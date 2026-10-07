'use strict';

const path = require('node:path');
const { createApp } = require('./app');
const { Database } = require('./db');
const { DEMO_NALOZI } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'baza.json');

const db = new Database(DATA_FILE);
const app = createApp({ db });

app.listen(PORT, () => {
  console.log(`Server je pokrenut: http://localhost:${PORT}`);
  console.log(`Baza: ${DATA_FILE}`);
  console.log('Demo nalozi:');
  for (const { korisnickoIme, lozinka, uloga } of DEMO_NALOZI) {
    console.log(`  ${uloga.padEnd(8)} ${korisnickoIme} / ${lozinka}`);
  }
});
