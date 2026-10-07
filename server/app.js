'use strict';

const path = require('node:path');
const express = require('express');
const { verifyPassword, verifyAgainstDummy } = require('./passwords');
const { SessionStore } = require('./sessions');
const { ULOGE, STATUSI, MIN_DANA, MAX_DANA, MAX_CENA_PO_DANU } = require('./constants');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Prihvata ceo broj kao broj (3) ili kao string od cifara ("3"); sve ostalo je NaN.
function toInteger(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

function publicUser(korisnik) {
  const { id, korisnickoIme, imePrezime, uloga } = korisnik;
  return { id, korisnickoIme, imePrezime, uloga };
}

function createApp({ db, sessions = new SessionStore() }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(PUBLIC_DIR));

  const api = express.Router();

  function bearerToken(req) {
    const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
    return match ? match[1] : null;
  }

  // Proverava da li je korisnik prijavljen i, ako je navedena uloga, da li je ima.
  function requireAuth(uloga) {
    return (req, res, next) => {
      const token = bearerToken(req);
      const session = token && sessions.get(token);
      const korisnik = session && db.findUserById(session.userId);
      if (!korisnik) {
        return res.status(401).json({ greska: 'Niste prijavljeni ili je sesija istekla.' });
      }
      if (uloga && korisnik.uloga !== uloga) {
        return res.status(403).json({ greska: 'Nemate pravo pristupa ovoj akciji.' });
      }
      req.korisnik = korisnik;
      req.token = token;
      next();
    };
  }

  function withClient(zahtev) {
    const korisnik = db.findUserById(zahtev.korisnikId);
    return {
      ...zahtev,
      klijent: korisnik
        ? { korisnickoIme: korisnik.korisnickoIme, imePrezime: korisnik.imePrezime }
        : null,
    };
  }

  // ---------- prijava / odjava ----------

  api.post('/prijava', (req, res) => {
    const { korisnickoIme, lozinka } = req.body ?? {};
    if (typeof korisnickoIme !== 'string' || typeof lozinka !== 'string'
        || !korisnickoIme.trim() || !lozinka) {
      return res.status(400).json({ greska: 'Unesite korisničko ime i lozinku.' });
    }
    const korisnik = db.findUserByUsername(korisnickoIme.trim());
    const ispravno = korisnik
      ? verifyPassword(lozinka, korisnik.lozinkaHash)
      : verifyAgainstDummy(lozinka);
    if (!ispravno) {
      return res.status(401).json({ greska: 'Pogrešno korisničko ime ili lozinka.' });
    }
    const token = sessions.create(korisnik.id);
    res.json({ token, korisnik: publicUser(korisnik) });
  });

  api.post('/odjava', requireAuth(), (req, res) => {
    sessions.delete(req.token);
    res.status(204).end();
  });

  api.get('/korisnik', requireAuth(), (req, res) => {
    res.json({ korisnik: publicUser(req.korisnik) });
  });

  // ---------- šifarnici ----------

  api.get('/gradovi', requireAuth(), (req, res) => {
    res.json(db.listCities());
  });

  api.get('/konzole', requireAuth(), (req, res) => {
    res.json(db.listConsoles());
  });

  // ---------- klijent: zahtevi za iznajmljivanje ----------

  api.post('/zahtevi', requireAuth(ULOGE.KLIJENT), (req, res) => {
    const { grad, konzolaId, brojDana } = req.body ?? {};

    if (typeof grad !== 'string' || !db.listCities().includes(grad)) {
      return res.status(400).json({ greska: 'Izaberite grad sa liste.' });
    }
    const konzola = db.findConsole(toInteger(konzolaId));
    if (!konzola) {
      return res.status(400).json({ greska: 'Izaberite tip konzole sa liste.' });
    }
    const dana = toInteger(brojDana);
    if (!Number.isInteger(dana) || dana < MIN_DANA || dana > MAX_DANA) {
      return res.status(400).json({
        greska: `Broj dana mora biti ceo broj od ${MIN_DANA} do ${MAX_DANA}.`,
      });
    }

    // Cenu uvek računa server na osnovu izabrane konzole; cena poslata sa
    // klijenta se ignoriše.
    const zahtev = db.createRequest({
      korisnikId: req.korisnik.id,
      grad,
      konzolaId: konzola.id,
      nazivKonzole: konzola.naziv,
      cenaPoDanu: konzola.cenaPoDanu,
      brojDana: dana,
      cena: konzola.cenaPoDanu * dana,
      status: STATUSI.NA_CEKANJU,
      kreiran: new Date().toISOString(),
      obradjen: null,
    });
    res.status(201).json(zahtev);
  });

  api.get('/zahtevi', requireAuth(ULOGE.KLIJENT), (req, res) => {
    res.json(db.listRequests({ korisnikId: req.korisnik.id }));
  });

  // ---------- admin ----------

  api.get('/admin/zahtevi', requireAuth(ULOGE.ADMIN), (req, res) => {
    const { status } = req.query;
    if (status !== undefined && !Object.values(STATUSI).includes(status)) {
      return res.status(400).json({ greska: 'Nepoznat status.' });
    }
    res.json(db.listRequests({ status }).map(withClient));
  });

  api.patch('/admin/zahtevi/:id', requireAuth(ULOGE.ADMIN), (req, res) => {
    const { status } = req.body ?? {};
    if (status !== STATUSI.ODOBREN && status !== STATUSI.ODBIJEN) {
      return res.status(400).json({ greska: 'Status mora biti ODOBREN ili ODBIJEN.' });
    }
    const zahtev = db.findRequest(toInteger(req.params.id));
    if (!zahtev) {
      return res.status(404).json({ greska: 'Zahtev ne postoji.' });
    }
    if (zahtev.status !== STATUSI.NA_CEKANJU) {
      return res.status(409).json({ greska: 'Zahtev je već obrađen.' });
    }
    const azuriran = db.updateRequest(zahtev.id, {
      status,
      obradjen: new Date().toISOString(),
      obradioId: req.korisnik.id,
    });
    res.json(withClient(azuriran));
  });

  api.put('/admin/konzole/:id', requireAuth(ULOGE.ADMIN), (req, res) => {
    const cenaPoDanu = toInteger(req.body?.cenaPoDanu);
    if (!Number.isInteger(cenaPoDanu) || cenaPoDanu < 1 || cenaPoDanu > MAX_CENA_PO_DANU) {
      return res.status(400).json({
        greska: `Cena po danu mora biti ceo broj od 1 do ${MAX_CENA_PO_DANU}.`,
      });
    }
    const konzola = db.updateConsolePrice(toInteger(req.params.id), cenaPoDanu);
    if (!konzola) {
      return res.status(404).json({ greska: 'Konzola ne postoji.' });
    }
    res.json(konzola);
  });

  api.use((req, res) => {
    res.status(404).json({ greska: 'Nepostojeća API ruta.' });
  });

  app.use('/api', api);

  // Greške (npr. neispravan JSON u telu zahteva) uvek vraćamo kao JSON.
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const greska = err.type === 'entity.parse.failed'
      ? 'Neispravan JSON u telu zahteva.'
      : status >= 500 ? 'Greška na serveru.' : 'Neispravan zahtev.';
    res.status(status).json({ greska });
  });

  return app;
}

module.exports = { createApp };
