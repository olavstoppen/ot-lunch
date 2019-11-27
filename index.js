#!/usr/bin/env NODE_NO_WARNINGS=1 node
/* eslint-disable no-unused-vars */
import dotenv from "dotenv";
import Koa from "koa";
import KoaRouter from "koa-router";
import KoaLogger from "koa-logger";
import KoaBody from "koa-body";
import KoaServe from "koa-static";
import textract from "textract";
import path from "path";
import fs from "fs";
import * as R from "ramda";
import dateFns from "date-fns";

dotenv.config();
const { getWeek } = dateFns;

// Utilities

// --experimental-modules-flag does not have __dirname global
const __dirname = path.resolve(
  path.dirname(decodeURI(new URL(import.meta.url).pathname))
);

const capitalize = word =>
  `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;

const digitsOnly = R.pipe(R.match(/\d+/), R.head);

const withoutNils = R.filter(R.complement(R.isNil));

const errorBody = (message, weekNumber = "") => ({
  days: [],
  weekNumber,
  error: {
    message: message
  }
});

const mkdir = folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
};

const readFileAsync = async filename =>
  new Promise((resolve, reject) =>
    fs.readFile(filename, (err, data) => {
      if (err) {
        reject(err);
      }
      try {
        resolve(JSON.parse(data));
      } catch (exception) {
        reject(exception);
      }
    })
  );

// Setup

const PORT = process.env.PORT || 5001;
const PATHS = {
  UPLOADS: "uploads",
  MENUS: "menus"
};

mkdir(PATHS.UPLOADS);
mkdir(PATHS.MENUS);

const app = new Koa();
const router = new KoaRouter();
const logger = new KoaLogger();

router
  .post("/menu", KoaBody({ multipart: true }), updateMenu)
  .get("/menu", KoaBody(), getMenu)
  .get("/menu/:week", KoaBody(), getMenu);

app
  .use(logger)
  .use(router.routes())
  .use(router.allowedMethods());

// Custom 404

app.use(async (ctx, next) => {
  await next();
  if (ctx.body || !ctx.idempotent) return;
  ctx.redirect("/404.html");
});

// GET Menu
async function getMenu(ctx) {
  const reqWeekNumber = ctx.params.week;
  const weekNumber = reqWeekNumber ? reqWeekNumber : getWeek(new Date());

  try {
    const menu = await readFileAsync(
      path.join(__dirname, PATHS.MENUS, `${weekNumber}.json`)
    );
    ctx.response.body = menu;
  } catch (error) {
    ctx.response.status = 404;
    ctx.response.body = errorBody(
      `Menu not found for week ${weekNumber}`,
      weekNumber
    );
  }
}

// UPDATE Menu

async function updateMenu(ctx, next) {
  if (R.complement(R.isNil(ctx.request.files))) {
    const menus = await Promise.all(
      Object.values(ctx.request.files).map(
        file =>
          new Promise(resolve => {
            const { name } = file;

            if (R.isEmpty(name)) {
              resolve(null);
            } else {
              const uploadPath = path.join(__dirname, PATHS.UPLOADS, name);
              const menuPath = path.join(
                __dirname,
                PATHS.MENUS,
                `${digitsOnly(name)}.json`
              );

              const reader = fs.createReadStream(file.path);
              const stream = fs.createWriteStream(uploadPath);
              reader.pipe(stream);

              reader.on("close", async () => {
                console.info(`Finished uploading: ${name}`);
                const menu = await createMenuFromPptx(uploadPath);
                fs.writeFileSync(menuPath, JSON.stringify(menu, null, 2));
                console.info(`Created menu for week: ${menu.weekNumber}`);
                resolve(menu);
              });
            }
          })
      )
    );
    ctx.response.body = withoutNils(menus);
  } else {
    next();
  }
}

const createMenuFromPptx = async filePath =>
  new Promise((resolve, reject) =>
    textract.fromFileWithPath(
      filePath,
      { preserveLineBreaks: true },
      (error, text) => {
        if (error) {
          reject(error);
        }
        resolve(buildMenu(text));
      }
    )
  );

const dayWeights = {
  mandag: 1,
  tirsdag: 2,
  onsdag: 3,
  torsdag: 4,
  fredag: 5,
  lørdag: 6,
  søndag: 7
};
const sortyByDay = R.sort((a, b) => {
  const left = dayWeights[R.toLower(a.day)];
  const right = dayWeights[R.toLower(b.day)];

  return left - right;
});
const prepAndSort = ({ days, weekNumber }) => ({
  weekNumber,
  days: sortyByDay(days)
});

const buildMenu = R.pipe(
  R.split("\n"),
  R.map(R.trim),
  R.filter(x => R.not(R.isEmpty(x))),
  R.reduce(
    (acc, val) => {
      const isDay = R.test(/MANDAG|TIRSDAG|ONSDAG|TORSDAG|FREDAG/i, val);
      const isMenu = R.test(/:|varmrett|suppe|temadag/i, val);
      const isWeek = R.test(/^UKE/i, val);

      if (isDay) {
        const day = capitalize(val);
        return {
          ...acc,
          _parsingDay: day,
          days: [...acc.days, { day, dishes: [] }]
        };
      }

      if (isMenu) {
        let dish = val;
        const isMissingSemiColon = dish.indexOf(`:`) === -1;
        if (isMissingSemiColon) {
          const [_, type, name] = val.match(/(varmrett|suppe|temadag)(.*)/i);
          dish = `${type}:${name}`;
        }
        return {
          ...acc,
          days: R.map(x => {
            if (x.day === acc._parsingDay) {
              return { ...x, dishes: [...x.dishes, dish] };
            }
            return x;
          }, acc.days)
        };
      }

      if (isWeek) {
        const weekNumber = val;
        return {
          ...acc,
          weekNumber: R.head(R.match(/[0-9]./, weekNumber))
        };
      }
      return acc;
    },
    { days: [], _parsingDay: "" }
  ),
  prepAndSort
);

// Start

app.use(KoaServe("./public"));

app.listen(PORT);

console.info("Started Olavstoppen lunch broker! 🐧");
