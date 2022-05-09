/* eslint-disable no-unused-vars */
import dotenv from 'dotenv';
import Koa from 'koa';
import KoaRouter from 'koa-router';
import KoaLogger from 'koa-logger';
import KoaBody from 'koa-body';
import KoaServe from 'koa-static';
import fs from 'fs';
import { getWeek } from 'date-fns';

import { initializeApp } from 'firebase/app';
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

router.get('/menu', KoaBody(), getMenuFirebase);

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

function stripWirdStufFromText(text) {
  const matches = [/(64\sgrader)$/];

  const hola = matches.reduce((acc, match) => {
    return acc.trim().replace(match, '');
  }, text);
  console.log(hola.trim());
  return hola.trim();
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
                    dishes?.map(
                      ({ header, subHeader }) =>
                        `${stripNumberfromHeader(
                          header,
                        )}: ${stripWirdStufFromText(subHeader)}`,
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

// Start

app.use(KoaServe('./public'));

app.listen(PORT);

console.info('Started Olavstoppen lunch broker! 🐧');
