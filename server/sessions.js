'use strict';

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // 8 sati

// Sesije se čuvaju u memoriji: restart servera odjavljuje sve korisnike.
class SessionStore {
  constructor({ ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.sessions = new Map();
  }

  create(userId) {
    this.#purgeExpired();
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, { userId, expiresAt: this.now() + this.ttlMs });
    return token;
  }

  get(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  delete(token) {
    this.sessions.delete(token);
  }

  #purgeExpired() {
    const now = this.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }
}

module.exports = { SessionStore };
