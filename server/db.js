'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createSeedData } = require('./seed');

// Jednostavna baza u JSON fajlu. Ako je filePath null, podaci se čuvaju samo
// u memoriji (koristi se u testovima).
class Database {
  constructor(filePath = null) {
    this.filePath = filePath;
    if (filePath && fs.existsSync(filePath)) {
      this.data = Database.#read(filePath);
    } else {
      this.data = createSeedData();
      this.#save();
    }
  }

  static #read(filePath) {
    const savet = 'Ispravite fajl ili ga obrišite da bi se napravila nova baza.';
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Baza ${filePath} nije ispravan JSON (${err.message}). ${savet}`);
      }
      throw new Error(`Baza ${filePath} ne može da se pročita (${err.message}).`);
    }
    const kolekcije = ['korisnici', 'konzole', 'gradovi', 'zahtevi'];
    if (!kolekcije.every((k) => Array.isArray(data?.[k])) || !Number.isInteger(data.sledeciId?.zahtevi)) {
      throw new Error(`Baza ${filePath} nema očekivanu strukturu. ${savet}`);
    }
    return data;
  }

  // --- korisnici ---

  findUserById(id) {
    return this.data.korisnici.find((k) => k.id === id) ?? null;
  }

  findUserByUsername(korisnickoIme) {
    const trazeno = korisnickoIme.toLowerCase();
    return this.data.korisnici.find((k) => k.korisnickoIme.toLowerCase() === trazeno) ?? null;
  }

  // --- gradovi i konzole ---

  listCities() {
    return [...this.data.gradovi];
  }

  listConsoles() {
    return this.data.konzole.map((k) => ({ ...k }));
  }

  findConsole(id) {
    const konzola = this.data.konzole.find((k) => k.id === id);
    return konzola ? { ...konzola } : null;
  }

  updateConsolePrice(id, cenaPoDanu) {
    return this.#commit((data) => {
      const konzola = data.konzole.find((k) => k.id === id);
      if (!konzola) return null;
      konzola.cenaPoDanu = cenaPoDanu;
      return { ...konzola };
    });
  }

  // --- zahtevi za iznajmljivanje ---

  createRequest(zahtev) {
    return this.#commit((data) => {
      const novi = { id: data.sledeciId.zahtevi++, ...zahtev };
      data.zahtevi.push(novi);
      return { ...novi };
    });
  }

  findRequest(id) {
    const zahtev = this.data.zahtevi.find((z) => z.id === id);
    return zahtev ? { ...zahtev } : null;
  }

  // Najnoviji zahtevi su prvi.
  listRequests({ korisnikId, status } = {}) {
    return this.data.zahtevi
      .filter((z) => korisnikId === undefined || z.korisnikId === korisnikId)
      .filter((z) => status === undefined || z.status === status)
      .map((z) => ({ ...z }))
      .reverse();
  }

  updateRequest(id, izmene) {
    return this.#commit((data) => {
      const zahtev = data.zahtevi.find((z) => z.id === id);
      if (!zahtev) return null;
      Object.assign(zahtev, izmene);
      return { ...zahtev };
    });
  }

  // Izmena se zadržava samo ako je uspešno upisana na disk; u suprotnom se
  // podaci u memoriji vraćaju na stanje pre izmene.
  #commit(change) {
    const backup = structuredClone(this.data);
    try {
      const result = change(this.data);
      this.#save();
      return result;
    } catch (err) {
      this.data = backup;
      throw err;
    }
  }

  #save() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }
}

module.exports = { Database };
