/* eslint-disable no-unused-vars */
import dotenv from 'dotenv';
import Koa from 'koa';
import KoaRouter from 'koa-router';
import KoaLogger from 'koa-logger';
import KoaBody from 'koa-body';
import KoaServe from 'koa-static';
// import textract from 'textract';
// import path from 'path';
import fs from 'fs';
// import R from 'ramda';
import { getWeek } from 'date-fns';
// import fetch from 'node-fetch';

import { initializeApp } from 'firebase/app';
// import {getFirestore, collection, getDocs} from 'firebase/firestore/lite';
import { getDatabase, ref, onValue } from 'firebase/database';

dotenv.config();

const PORT = process.env.PORT || 5001;

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);

// const { getWeek } = dateFns;

// Utilities

// --experimental-modules-flag does not have __dirname global
// const __dirname = path.resolve(
//   path.dirname(decodeURI(new URL(import.meta.url).pathname)),
// );

// const capitalize = (word) =>
//   `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;

// const digitsOnly = R.pipe(R.match(/\d+/), R.head);

// const withoutNils = R.filter(R.complement(R.isNil));

// const isNotEmpty = R.pipe(R.trim, R.isEmpty, R.not);

const errorBody = (message, weekNumber = '') => ({
  days: [],
  weekNumber,
  error: {
    message: message,
  },
});

const mkdir = (folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
};

// const readFileAsync = async (filename) =>
//   new Promise((resolve, reject) =>
//     fs.readFile(filename, (err, data) => {
//       if (err) {
//         reject(err);
//       }
//       try {
//         resolve(JSON.parse(data));
//       } catch (exception) {
//         reject(exception);
//       }
//     }),
//   );

// Setup

const PATHS = {
  UPLOADS: 'uploads',
  MENUS: 'menus',
};

mkdir(PATHS.UPLOADS);
mkdir(PATHS.MENUS);

const app = new Koa();
const router = new KoaRouter();
const logger = new KoaLogger();

router
  // .post('/menu-powerpoint', KoaBody({ multipart: true }), updatePowerpointMenu)
  // .get('/menu-powerpoint', KoaBody(), getPowerpointMenu)
  // .get('/menu-powerpoint/:week', KoaBody(), getPowerpointMenu)
  .get('/menu', KoaBody(), getMenuFirebase);

app.use(logger).use(router.routes()).use(router.allowedMethods());

// Custom 404

app.use(async (ctx, next) => {
  await next();
  if (ctx.body || !ctx.idempotent) return;

  ctx.redirect('/404.html');
});

function stripNumberfromHeader(header) {
  return header.replace(/[0-9]+\.\s+/, '');
}

function norwegifyDays(day) {
  switch (day) {
    case 'Måndag':
      return 'Mandag';
    case 'Tisdag':
      return 'Tirsdag';
  }
  return day;
}

async function fetchMenuFromFireBase(weekNumber) {
  return new Promise((resolve, reject) => {
    const adminAppRef = ref(
      db,
      `Clients/compassno_hinnaparkkanalpiren/AppInfo`,
    );
    onValue(
      adminAppRef,
      (snapshot) => {
        const data = snapshot.val();

        const {
          Context: { weeklyMenu = null },
        } = data;

        if (weeklyMenu != null) {
          const currentMenu = weeklyMenu.content.find(
            (week) => week.number == weekNumber,
          );

          if (currentMenu != null) {
            resolve({
              weekNumber,
              days: currentMenu.days?.slice(0, 5).map(({ text, dishes }) => {
                return {
                  day: norwegifyDays(text),
                  dishes:
                    dishes?.map(({ header, subHeader }) =>
                      `${stripNumberfromHeader(header)}: ${subHeader}`.trim(),
                    ) ?? [],
                };
              }),
            });
            return;
          }
        }
        reject('missing weekly menu');
      },
      reject,
    );
  });
}

async function getMenuFirebase(ctx) {
  const weekNumber = getWeek(Date.now(), {
    weekStartsOn: 0,
    // https://no.wikipedia.org/wiki/Ukenummer#:~:text=Ukesnummerregler
    firstWeekContainsDate: 3,
  });

  try {
    const result = await fetchMenuFromFireBase(weekNumber);

    ctx.response.body = result;
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = errorBody(error.message, weekNumber);
  }
}

// GET Powerpoint Menu
// async function getPowerpointMenu(ctx) {
//   const reqWeekNumber = ctx.params.week;
//   const weekNumber = reqWeekNumber ? reqWeekNumber : getWeek(new Date());

//   try {
//     const menu = await readFileAsync(
//       path.join(__dirname, PATHS.MENUS, `${weekNumber}.json`),
//     );
//     ctx.response.body = menu;
//   } catch (error) {
//     ctx.response.status = 404;
//     ctx.response.body = errorBody(
//       `Menu not found for week ${weekNumber}`,
//       weekNumber,
//     );
//   }
// }

// UPDATE Powerpoint Menu
// async function updatePowerpointMenu(ctx, next) {
//   if (R.complement(R.isNil(ctx.request.files))) {
//     const menus = await Promise.all(
//       Object.values(ctx.request.files).map(
//         (file) =>
//           new Promise((resolve) => {
//             const { name } = file;

//             if (R.isEmpty(name)) {
//               resolve(null);
//             } else {
//               const uploadPath = path.join(__dirname, PATHS.UPLOADS, name);
//               const menuPath = path.join(
//                 __dirname,
//                 PATHS.MENUS,
//                 `${digitsOnly(name)}.json`,
//               );

//               const reader = fs.createReadStream(file.path);
//               const stream = fs.createWriteStream(uploadPath);
//               reader.pipe(stream);

//               reader.on('close', async () => {
//                 console.info(`Finished uploading: ${name}`);
//                 const menu = await createMenuFromPptx(uploadPath);
//                 fs.writeFileSync(menuPath, JSON.stringify(menu, null, 2));
//                 console.info(`Created menu for week: ${menu.weekNumber}`);
//                 resolve(menu);
//               });
//             }
//           }),
//       ),
//     );
//     ctx.response.body = withoutNils(menus);
//   } else {
//     next();
//   }
// }

// const createMenuFromPptx = async (filePath) =>
//   new Promise((resolve, reject) =>
//     textract.fromFileWithPath(
//       filePath,
//       {
//         preserveLineBreaks: true,
//       },
//       (error, text) => {
//         if (error) {
//           reject(error);
//         }
//         resolve(buildMenu(text));
//       },
//     ),
//   );

// const dayWeights = {
//   mandag: 1,
//   tirsdag: 2,
//   onsdag: 3,
//   torsdag: 4,
//   fredag: 5,
//   lørdag: 6,
//   søndag: 7,
// };
// const sortyByDay = R.sort((a, b) => {
//   const left = dayWeights[R.toLower(a.day)];
//   const right = dayWeights[R.toLower(b.day)];

//   return left - right;
// });
// const prepAndSort = ({ days, weekNumber }) => ({
//   weekNumber,
//   days: sortyByDay(days),
// });

// const buildMenu = R.pipe(
//   R.split('\n'),
//   R.map(R.trim),
//   R.filter((x) => R.not(R.isEmpty(x))),
//   R.reduce(
//     (acc, val) => {
//       const isDay = R.test(/MANDAG|TIRSDAG|ONSDAG|TORSDAG|FREDAG/i, val);
//       const isMenu = R.test(/:|varmrett|suppe|temadag/i, val);
//       const isWeek = R.test(/^UKE/i, val);

//       if (isDay) {
//         const day = capitalize(val);
//         return {
//           ...acc,
//           _parsingDay: day,
//           days: [
//             ...acc.days,
//             {
//               day,
//               dishes: [],
//             },
//           ],
//         };
//       }

//       if (isMenu) {
//         let dish = val;
//         const isMissingSemiColon = dish.indexOf(`:`) === -1;
//         if (isMissingSemiColon) {
//           const [_, type, name] = val.match(/(varmrett|suppe|temadag)(.*)/i);
//           dish = `${type}:${name}`;
//         }
//         return {
//           ...acc,
//           days: R.map((x) => {
//             if (x.day === acc._parsingDay) {
//               return {
//                 ...x,
//                 dishes: [...x.dishes, dish],
//               };
//             }
//             return x;
//           }, acc.days),
//         };
//       }

//       if (isWeek) {
//         const weekNumber = val;
//         return {
//           ...acc,
//           weekNumber: R.head(R.match(/[0-9]./, weekNumber)),
//         };
//       }
//       return acc;
//     },
//     {
//       days: [],
//       _parsingDay: '',
//     },
//   ),
//   prepAndSort,
// );

// Start

app.use(KoaServe('./public'));

app.listen(PORT);

console.info('Started Olavstoppen lunch broker! 🐧');
