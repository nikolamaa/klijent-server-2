'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

// Sinhrono: koristi se samo pri pravljenju početne baze.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

// Asinhrono, da provera lozinke ne blokira server dok traje.
async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Koristi se kada korisničko ime ne postoji, da neuspešna prijava traje isto
// i ne otkriva koja korisnička imena postoje.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

async function verifyAgainstDummy(password) {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy };
