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

const mkdir = folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
};
const { getWeek } = dateFns;

// --experimental-modules-flag does not have __dirname global
const __dirname = path.resolve(
  path.dirname(decodeURI(new URL(import.meta.url).pathname))
);

const PORT = process.env.PORT || 5001;
const UPLOADS = "uploads";
const MENUS = "menus";

mkdir(UPLOADS);
mkdir(MENUS);

const app = new Koa();
const router = new KoaRouter();
const logger = new KoaLogger();

router
  .post("/menu", KoaBody({ multipart: true }), updateMenu)
  .get("/menu", KoaBody(), getMenu);

app
  .use(logger)
  .use(router.routes())
  .use(router.allowedMethods());

// custom 404

app.use(async (ctx, next) => {
  await next();
  if (ctx.body || !ctx.idempotent) return;
  ctx.redirect("/404.html");
});

// GET Menu
async function getMenu(ctx, next) {
  const reqWeekNumber = ctx.request.query.weekNumber;
  const weekNumber = reqWeekNumber ? reqWeekNumber : getWeek(new Date());

  try {
    const menu = await readFileAsync(
      path.join(__dirname, MENUS, `${weekNumber}.json`)
    );
    ctx.response.body = menu;
  } catch (error) {
    ctx.response.status = 404;
    ctx.response.body = `Menu not found for week ${weekNumber}`;
  }
}

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

// UPDATE Menu

async function updateMenu(ctx, next) {
  if (R.complement(R.isNil(ctx.request.files))) {
    const menus = await Promise.all(
      Object.values(ctx.request.files).map(
        file =>
          new Promise(resolve => {
            const { name } = file;
            const reader = fs.createReadStream(file.path);
            const stream = fs.createWriteStream(
              path.join(__dirname, UPLOADS, name)
            );
            reader.pipe(stream);

            reader.on("close", async () => {
              const weekNumber = digitsOnly(name);

              console.log(`Finished uploading  ${name}\n`);

              const formatted = await extractTextFromPptx(`uploads/${name}`);

              fs.writeFileSync(
                path.join(__dirname, MENUS, parsedFileName(name)),
                JSON.stringify(formatted, null, 2)
              );

              console.info(`Created menu for week ${weekNumber}\n`);

              resolve(formatted);
            });
          })
      )
    );
    ctx.response.body = menus;
  } else {
    next();
  }
}

const digitsOnly = R.pipe(R.match(/\d+/), R.head);

const parsedFileName = name => `${digitsOnly(name)}.json`;

const extractTextFromPptx = async filePath =>
  new Promise((resolve, reject) =>
    textract.fromFileWithPath(
      filePath,
      { preserveLineBreaks: true },
      (error, text) => {
        if (error) {
          reject(error);
        }
        resolve(menuBuilder(text));
      }
    )
  );

const menuBuilder = R.pipe(
  R.split("\n"),
  R.map(R.trim),
  R.filter(x => R.not(R.isEmpty(x))),
  R.reduce(
    (acc, val) => {
      const isDay = R.test(/MANDAG|TIRSDAG|ONSDAG|TORSDAG|FREDAG/, val);
      const isMenu = R.test(/:/, val);
      const isWeek = R.test(/^UKE/, val);

      if (isDay) {
        return {
          ...acc,
          _parsingDay: val,
          days: [...acc.days, { day: val, dishes: [] }]
        };
      }

      if (isMenu) {
        const dish = val;
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
  )
);

app.use(KoaServe(path.join(__dirname, "/public")));

app.listen(PORT);

console.info("Started Olavstoppen lunch broker! 🐧");
