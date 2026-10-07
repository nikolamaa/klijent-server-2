'use strict';

const os = require('node:os');
const path = require('node:path');
const { createApp } = require('./app');
const { Database } = require('./db');
const { DEMO_NALOZI } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'baza.json');

let db;
try {
  db = new Database(DATA_FILE);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp({ db });

// IPv4 adrese računara u lokalnoj mreži (za otvaranje aplikacije sa telefona).
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

app.listen(PORT, (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE'
      ? `Port ${PORT} je zauzet. Pokrenite server na drugom portu, npr. PORT=3001 npm start`
      : `Server nije pokrenut: ${err.message}`);
    process.exit(1);
  }
  console.log(`Server je pokrenut: http://localhost:${PORT}`);
  for (const adresa of lanAddresses()) {
    console.log(`Sa telefona (ista Wi-Fi mreža): http://${adresa}:${PORT}`);
  }
  console.log(`Baza: ${DATA_FILE}`);
  console.log('Demo nalozi:');
  for (const { korisnickoIme, lozinka, uloga } of DEMO_NALOZI) {
    console.log(`  ${uloga.padEnd(8)} ${korisnickoIme} / ${lozinka}`);
  }
});
