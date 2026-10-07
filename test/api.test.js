'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server/app');
const { Database } = require('../server/db');
const { SessionStore } = require('../server/sessions');

async function startServer(options = {}) {
  const app = createApp({ db: new Database(null), ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, { token, body, rawBody } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function login(korisnickoIme, lozinka) {
    const res = await call('POST', '/api/prijava', { body: { korisnickoIme, lozinka } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.token;
  }

  return { server, base, call, login };
}

describe('prijava', () => {
  let s;
  beforeEach(async () => { s = await startServer(); });
  afterEach(() => s.server.close());

  it('vraća token i javne podatke korisnika (bez hash-a lozinke)', async () => {
    const res = await s.call('POST', '/api/prijava', { body: { korisnickoIme: 'marko', lozinka: 'marko123' } });
    assert.equal(res.status, 200);
    assert.match(res.body.token, /^[0-9a-f]{64}$/);
    assert.deepEqual(res.body.korisnik, {
      id: 2, korisnickoIme: 'marko', imePrezime: 'Marko Marković', uloga: 'klijent',
    });
  });

  it('korisničko ime ne zavisi od velikih/malih slova', async () => {
    const res = await s.call('POST', '/api/prijava', { body: { korisnickoIme: ' ADMIN ', lozinka: 'admin123' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.korisnik.uloga, 'admin');
  });

  it('odbija pogrešnu lozinku i nepostojećeg korisnika istom porukom', async () => {
    const pogresna = await s.call('POST', '/api/prijava', { body: { korisnickoIme: 'marko', lozinka: 'x' } });
    const nepostojeci = await s.call('POST', '/api/prijava', { body: { korisnickoIme: 'niko', lozinka: 'x' } });
    assert.equal(pogresna.status, 401);
    assert.equal(nepostojeci.status, 401);
    assert.equal(pogresna.body.greska, nepostojeci.body.greska);
  });

  it('traži korisničko ime i lozinku', async () => {
    for (const body of [{}, { korisnickoIme: 'marko' }, { korisnickoIme: '  ', lozinka: 'a' }, { korisnickoIme: 1, lozinka: 2 }]) {
      const res = await s.call('POST', '/api/prijava', { body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  it('neispravan JSON vraća 400 sa JSON greškom', async () => {
    const res = await s.call('POST', '/api/prijava', { rawBody: '{nije json' });
    assert.equal(res.status, 400);
    assert.ok(res.body.greska);
  });

  it('odjava poništava token', async () => {
    const token = await s.login('marko', 'marko123');
    assert.equal((await s.call('GET', '/api/korisnik', { token })).status, 200);
    assert.equal((await s.call('POST', '/api/odjava', { token })).status, 204);
    assert.equal((await s.call('GET', '/api/korisnik', { token })).status, 401);
  });

  it('istekla sesija više ne važi', async () => {
    let now = 1_000;
    s.server.close();
    s = await startServer({ sessions: new SessionStore({ ttlMs: 100, now: () => now }) });
    const token = await s.login('marko', 'marko123');
    assert.equal((await s.call('GET', '/api/korisnik', { token })).status, 200);
    now += 100;
    assert.equal((await s.call('GET', '/api/korisnik', { token })).status, 401);
  });
});

describe('zaštita API-ja', () => {
  let s;
  beforeEach(async () => { s = await startServer(); });
  afterEach(() => s.server.close());

  it('bez tokena nema pristupa', async () => {
    for (const [method, url] of [
      ['GET', '/api/korisnik'], ['GET', '/api/konzole'], ['GET', '/api/gradovi'],
      ['GET', '/api/zahtevi'], ['POST', '/api/zahtevi'], ['GET', '/api/admin/zahtevi'],
      ['PATCH', '/api/admin/zahtevi/1'], ['PUT', '/api/admin/konzole/1'],
    ]) {
      const res = await s.call(method, url, { token: 'nepostojeci' });
      assert.equal(res.status, 401, `${method} ${url}`);
    }
  });

  it('klijent ne može da koristi admin rute', async () => {
    const token = await s.login('marko', 'marko123');
    assert.equal((await s.call('GET', '/api/admin/zahtevi', { token })).status, 403);
    assert.equal((await s.call('PATCH', '/api/admin/zahtevi/1', { token, body: { status: 'ODOBREN' } })).status, 403);
    assert.equal((await s.call('PUT', '/api/admin/konzole/1', { token, body: { cenaPoDanu: 1 } })).status, 403);
  });

  it('admin ne šalje zahteve za iznajmljivanje', async () => {
    const token = await s.login('admin', 'admin123');
    const res = await s.call('POST', '/api/zahtevi', { token, body: { grad: 'Beograd', konzolaId: 1, brojDana: 1 } });
    assert.equal(res.status, 403);
  });

  it('nepostojeća API ruta vraća JSON 404', async () => {
    const res = await s.call('GET', '/api/nema');
    assert.equal(res.status, 404);
    assert.ok(res.body.greska);
  });
});

describe('zahtevi za iznajmljivanje', () => {
  let s;
  let marko;
  let ana;
  let admin;

  beforeEach(async () => {
    s = await startServer();
    [marko, ana, admin] = await Promise.all([
      s.login('marko', 'marko123'), s.login('ana', 'ana123'), s.login('admin', 'admin123'),
    ]);
  });
  afterEach(() => s.server.close());

  it('šifarnici: gradovi i konzole sa cenom po danu', async () => {
    const gradovi = await s.call('GET', '/api/gradovi', { token: marko });
    const konzole = await s.call('GET', '/api/konzole', { token: marko });
    assert.ok(gradovi.body.includes('Beograd'));
    assert.deepEqual(konzole.body[0], { id: 1, naziv: 'PlayStation 5', cenaPoDanu: 1500 });
  });

  it('cenu računa server iz izabrane konzole i ignoriše cenu sa klijenta', async () => {
    const res = await s.call('POST', '/api/zahtevi', {
      token: marko,
      body: { grad: 'Niš', konzolaId: 3, brojDana: 4, cena: 1 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.nazivKonzole, 'Xbox Series X');
    assert.equal(res.body.cenaPoDanu, 1400);
    assert.equal(res.body.cena, 1400 * 4);
    assert.equal(res.body.status, 'NA_CEKANJU');
    assert.equal(res.body.korisnikId, 2);
  });

  it('prihvata brojeve poslate kao string', async () => {
    const res = await s.call('POST', '/api/zahtevi', {
      token: marko, body: { grad: 'Beograd', konzolaId: '5', brojDana: '2' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.cena, 1600);
  });

  it('validira grad, konzolu i broj dana', async () => {
    const neispravni = [
      { konzolaId: 1, brojDana: 1 },
      { grad: 'Pariz', konzolaId: 1, brojDana: 1 },
      { grad: 'Beograd', brojDana: 1 },
      { grad: 'Beograd', konzolaId: 99, brojDana: 1 },
      { grad: 'Beograd', konzolaId: 1.5, brojDana: 1 },
      { grad: 'Beograd', konzolaId: 1 },
      { grad: 'Beograd', konzolaId: 1, brojDana: 0 },
      { grad: 'Beograd', konzolaId: 1, brojDana: 31 },
      { grad: 'Beograd', konzolaId: 1, brojDana: 2.5 },
      { grad: 'Beograd', konzolaId: 1, brojDana: '-3' },
      { grad: 'Beograd', konzolaId: 1, brojDana: true },
      { grad: 'Beograd', konzolaId: 1, brojDana: '' },
    ];
    for (const body of neispravni) {
      const res = await s.call('POST', '/api/zahtevi', { token: marko, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.greska);
    }
    assert.deepEqual((await s.call('GET', '/api/zahtevi', { token: marko })).body, []);
  });

  it('klijent vidi samo svoje zahteve, najnovije prve', async () => {
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 1 } });
    await s.call('POST', '/api/zahtevi', { token: ana, body: { grad: 'Novi Sad', konzolaId: 2, brojDana: 2 } });
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Niš', konzolaId: 3, brojDana: 3 } });

    const markovi = (await s.call('GET', '/api/zahtevi', { token: marko })).body;
    assert.deepEqual(markovi.map((z) => z.id), [3, 1]);
    const anini = (await s.call('GET', '/api/zahtevi', { token: ana })).body;
    assert.deepEqual(anini.map((z) => z.id), [2]);
  });

  it('admin vidi sve zahteve sa podacima o klijentu i filtrira po statusu', async () => {
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 1 } });
    await s.call('POST', '/api/zahtevi', { token: ana, body: { grad: 'Novi Sad', konzolaId: 2, brojDana: 2 } });
    await s.call('PATCH', '/api/admin/zahtevi/1', { token: admin, body: { status: 'ODOBREN' } });

    const svi = (await s.call('GET', '/api/admin/zahtevi', { token: admin })).body;
    assert.deepEqual(svi.map((z) => z.id), [2, 1]);
    assert.deepEqual(svi[0].klijent, { korisnickoIme: 'ana', imePrezime: 'Ana Anić' });

    const naCekanju = (await s.call('GET', '/api/admin/zahtevi?status=NA_CEKANJU', { token: admin })).body;
    assert.deepEqual(naCekanju.map((z) => z.id), [2]);
    assert.equal((await s.call('GET', '/api/admin/zahtevi?status=XYZ', { token: admin })).status, 400);
  });

  it('admin odobrava zahtev i klijent vidi novi status', async () => {
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 2 } });
    const res = await s.call('PATCH', '/api/admin/zahtevi/1', { token: admin, body: { status: 'ODOBREN' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ODOBREN');
    assert.ok(res.body.obradjen);
    assert.equal(res.body.obradioId, 1);

    const [moj] = (await s.call('GET', '/api/zahtevi', { token: marko })).body;
    assert.equal(moj.status, 'ODOBREN');
  });

  it('admin odbija zahtev; obrađen zahtev se ne može ponovo menjati', async () => {
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 2 } });
    const odbijen = await s.call('PATCH', '/api/admin/zahtevi/1', { token: admin, body: { status: 'ODBIJEN' } });
    assert.equal(odbijen.body.status, 'ODBIJEN');
    const ponovo = await s.call('PATCH', '/api/admin/zahtevi/1', { token: admin, body: { status: 'ODOBREN' } });
    assert.equal(ponovo.status, 409);
  });

  it('obrada zahteva: neispravan status i nepostojeći zahtev', async () => {
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 2 } });
    for (const status of [undefined, 'NA_CEKANJU', 'odobren', 'BILO_STA']) {
      const res = await s.call('PATCH', '/api/admin/zahtevi/1', { token: admin, body: { status } });
      assert.equal(res.status, 400, String(status));
    }
    assert.equal((await s.call('PATCH', '/api/admin/zahtevi/99', { token: admin, body: { status: 'ODOBREN' } })).status, 404);
    assert.equal((await s.call('PATCH', '/api/admin/zahtevi/abc', { token: admin, body: { status: 'ODOBREN' } })).status, 404);
  });

  it('nova cena važi za nove zahteve, a stari zadržavaju svoju', async () => {
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 2 } });
    const izmena = await s.call('PUT', '/api/admin/konzole/1', { token: admin, body: { cenaPoDanu: 2000 } });
    assert.equal(izmena.status, 200);
    assert.equal(izmena.body.cenaPoDanu, 2000);

    const novi = await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 2 } });
    assert.equal(novi.body.cena, 4000);
    const stari = (await s.call('GET', '/api/zahtevi', { token: marko })).body.find((z) => z.id === 1);
    assert.equal(stari.cena, 3000);
  });

  it('odbija zahtev ako je cena promenjena posle prikaza u formi (409)', async () => {
    await s.call('PUT', '/api/admin/konzole/1', { token: admin, body: { cenaPoDanu: 2000 } });
    const stara = await s.call('POST', '/api/zahtevi', {
      token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 2, ocekivanaCenaPoDanu: 1500 },
    });
    assert.equal(stara.status, 409);
    assert.match(stara.body.greska, /2\.000 din po danu/);
    assert.deepEqual((await s.call('GET', '/api/zahtevi', { token: marko })).body, []);

    const nova = await s.call('POST', '/api/zahtevi', {
      token: marko, body: { grad: 'Beograd', konzolaId: 1, brojDana: 2, ocekivanaCenaPoDanu: 2000 },
    });
    assert.equal(nova.status, 201);
    assert.equal(nova.body.cena, 4000);
  });

  it('validira izmenu cene', async () => {
    for (const cenaPoDanu of [0, -5, 1.5, 'abc', null, 2_000_000]) {
      const res = await s.call('PUT', '/api/admin/konzole/1', { token: admin, body: { cenaPoDanu } });
      assert.equal(res.status, 400, String(cenaPoDanu));
    }
    assert.equal((await s.call('PUT', '/api/admin/konzole/99', { token: admin, body: { cenaPoDanu: 5 } })).status, 404);
  });
});

describe('baza u fajlu', () => {
  let dir;
  let file;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konzole-'));
    file = path.join(dir, 'baza.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('podaci ostaju sačuvani posle restarta servera', async () => {
    const prvi = await startServer({ db: new Database(file) });
    const token = await prvi.login('marko', 'marko123');
    await prvi.call('POST', '/api/zahtevi', { token, body: { grad: 'Subotica', konzolaId: 4, brojDana: 3 } });
    prvi.server.close();

    const drugi = await startServer({ db: new Database(file) });
    const token2 = await drugi.login('marko', 'marko123');
    const zahtevi = (await drugi.call('GET', '/api/zahtevi', { token: token2 })).body;
    drugi.server.close();
    assert.equal(zahtevi.length, 1);
    assert.equal(zahtevi[0].grad, 'Subotica');
    assert.equal(zahtevi[0].cena, 3000);
  });

  it('neuspeo upis na disk ne menja podatke u memoriji', async (t) => {
    const s = await startServer({ db: new Database(file) });
    t.after(() => s.server.close());
    const marko = await s.login('marko', 'marko123');
    const admin = await s.login('admin', 'admin123');
    await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Niš', konzolaId: 1, brojDana: 1 } });

    fs.mkdirSync(`${file}.tmp`); // svaki sledeći upis pada (EISDIR)
    t.mock.method(console, 'error', () => {});
    const novi = await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Niš', konzolaId: 2, brojDana: 1 } });
    assert.equal(novi.status, 500);
    const odobri = await s.call('PATCH', '/api/admin/zahtevi/1', { token: admin, body: { status: 'ODOBREN' } });
    assert.equal(odobri.status, 500);
    const cena = await s.call('PUT', '/api/admin/konzole/1', { token: admin, body: { cenaPoDanu: 5 } });
    assert.equal(cena.status, 500);

    const zahtevi = (await s.call('GET', '/api/zahtevi', { token: marko })).body;
    assert.deepEqual(zahtevi.map((z) => [z.id, z.status]), [[1, 'NA_CEKANJU']]);
    assert.equal((await s.call('GET', '/api/konzole', { token: marko })).body[0].cenaPoDanu, 1500);

    fs.rmdirSync(`${file}.tmp`);
    const ponovo = await s.call('POST', '/api/zahtevi', { token: marko, body: { grad: 'Niš', konzolaId: 2, brojDana: 1 } });
    assert.equal(ponovo.body.id, 2);
  });

  it('oštećen fajl baze daje jasnu poruku', () => {
    fs.writeFileSync(file, '{"korisnici": [');
    assert.throws(() => new Database(file), /nije ispravan JSON.*obrišite/);
  });
});
