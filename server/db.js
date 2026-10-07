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
      this.data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      this.data = createSeedData();
      this.#save();
    }
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
    const konzola = this.data.konzole.find((k) => k.id === id);
    if (!konzola) return null;
    konzola.cenaPoDanu = cenaPoDanu;
    this.#save();
    return { ...konzola };
  }

  // --- zahtevi za iznajmljivanje ---

  createRequest(zahtev) {
    const novi = { id: this.data.sledeciId.zahtevi++, ...zahtev };
    this.data.zahtevi.push(novi);
    this.#save();
    return { ...novi };
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
    const zahtev = this.data.zahtevi.find((z) => z.id === id);
    if (!zahtev) return null;
    Object.assign(zahtev, izmene);
    this.#save();
    return { ...zahtev };
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
