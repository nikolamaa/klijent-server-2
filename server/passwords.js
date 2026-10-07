'use strict';

const crypto = require('node:crypto');

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Used when the username does not exist, so a failed login takes the same
// time either way and does not reveal which usernames are valid.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function verifyAgainstDummy(password) {
  verifyPassword(password, DUMMY_HASH);
  return false;
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy };
