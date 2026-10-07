'use strict';

const ULOGE = Object.freeze({
  KLIJENT: 'klijent',
  ADMIN: 'admin',
});

const STATUSI = Object.freeze({
  NA_CEKANJU: 'NA_CEKANJU',
  ODOBREN: 'ODOBREN',
  ODBIJEN: 'ODBIJEN',
});

const MIN_DANA = 1;
const MAX_DANA = 30;
const MAX_CENA_PO_DANU = 1_000_000;

module.exports = { ULOGE, STATUSI, MIN_DANA, MAX_DANA, MAX_CENA_PO_DANU };
