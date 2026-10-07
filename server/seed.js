'use strict';

const { hashPassword } = require('./passwords');
const { ULOGE } = require('./constants');

// Početni podaci koji se upisuju pri prvom pokretanju (kada baza ne postoji).
const KORISNICI = [
  { korisnickoIme: 'admin', lozinka: 'admin123', imePrezime: 'Administrator', uloga: ULOGE.ADMIN },
  { korisnickoIme: 'marko', lozinka: 'marko123', imePrezime: 'Marko Marković', uloga: ULOGE.KLIJENT },
  { korisnickoIme: 'ana', lozinka: 'ana123', imePrezime: 'Ana Anić', uloga: ULOGE.KLIJENT },
];

const KONZOLE = [
  { naziv: 'PlayStation 5', cenaPoDanu: 1500 },
  { naziv: 'PlayStation 4', cenaPoDanu: 900 },
  { naziv: 'Xbox Series X', cenaPoDanu: 1400 },
  { naziv: 'Xbox Series S', cenaPoDanu: 1000 },
  { naziv: 'Nintendo Switch', cenaPoDanu: 800 },
];

const GRADOVI = ['Beograd', 'Novi Sad', 'Niš', 'Kragujevac', 'Subotica'];

function createSeedData() {
  return {
    korisnici: KORISNICI.map(({ lozinka, ...korisnik }, i) => ({
      id: i + 1,
      ...korisnik,
      lozinkaHash: hashPassword(lozinka),
    })),
    konzole: KONZOLE.map((konzola, i) => ({ id: i + 1, ...konzola })),
    gradovi: [...GRADOVI],
    zahtevi: [],
    sledeciId: { zahtevi: 1 },
  };
}

module.exports = { createSeedData, DEMO_NALOZI: KORISNICI };
