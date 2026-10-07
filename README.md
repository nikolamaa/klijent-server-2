# klijent-server-2 — Iznajmljivanje konzola

Klijent-server aplikacija za iznajmljivanje igračkih konzola.

- **Klijent** se prijavi i popuni formu za iznajmljivanje: **grad**, **tip konzole**,
  **broj dana** i **cena**. Cena je vezana za izabranu konzolu
  (cena po danu × broj dana) i automatski se računa pri izboru konzole i broja dana.
  Poslati zahtev dobija status *Na čekanju*.
- **Admin** se prijavi na istoj login formi, vidi sve zahteve klijenata i
  **odobrava** ili **odbija** ih. Klijent vidi novi status u tabeli „Moji zahtevi”
  (tabela se osvežava automatski na svakih 15 sekundi, a odmah klikom na „Osveži”).
  Admin može da menja i cenovnik konzola (nova cena važi za nove zahteve; ako se cena
  promeni dok klijent popunjava formu, server odbija zahtev i forma prikazuje novu cenu).

## Pokretanje

Potreban je [Node.js](https://nodejs.org) 18.18 ili noviji.

```bash
npm install
npm start
```

Zatim otvorite <http://localhost:3000>.

| Uloga   | Korisničko ime | Lozinka    |
|---------|----------------|------------|
| admin   | `admin`        | `admin123` |
| klijent | `marko`        | `marko123` |
| klijent | `ana`          | `ana123`   |

Savet: prijava se pamti po tabu pretraživača, pa u jednom tabu možete biti prijavljeni
kao klijent, a u drugom kao admin.

Podešavanja preko promenljivih okruženja:

- `PORT` — port servera (podrazumevano `3000`)
- `DATA_FILE` — putanja do JSON baze (podrazumevano `data/baza.json`; pravi se sama
  pri prvom pokretanju sa početnim korisnicima, konzolama i gradovima)

Za početak od nule obrišite `data/baza.json`.

## Testovi

```bash
npm test
```

## Struktura

```
server/            serverska strana (Node.js + Express)
  index.js         pokretanje servera
  app.js           REST API (prijava, zahtevi, admin)
  db.js            baza u JSON fajlu
  seed.js          početni podaci (korisnici, konzole, gradovi)
  sessions.js      sesije (token)
  passwords.js     heširanje lozinki (scrypt)
public/            klijentska strana (HTML, CSS, JavaScript)
  index.html       login forma
  klijent.html     forma za iznajmljivanje + moji zahtevi
  admin.html       admin: odobravanje zahteva + cenovnik
test/              testovi API-ja
```

## API

Svi zahtevi osim prijave šalju zaglavlje `Authorization: Bearer <token>`.

| Metod | Ruta | Uloga | Opis |
|-------|------|-------|------|
| POST  | `/api/prijava` | — | `{ korisnickoIme, lozinka }` → `{ token, korisnik }` |
| POST  | `/api/odjava` | bilo koja | poništava token |
| GET   | `/api/korisnik` | bilo koja | trenutno prijavljeni korisnik |
| GET   | `/api/gradovi` | bilo koja | lista gradova |
| GET   | `/api/konzole` | bilo koja | konzole sa cenom po danu |
| POST  | `/api/zahtevi` | klijent | `{ grad, konzolaId, brojDana, ocekivanaCenaPoDanu? }` → novi zahtev; cenu računa server, a ako se `ocekivanaCenaPoDanu` razlikuje od trenutne cene vraća 409 |
| GET   | `/api/zahtevi` | klijent | zahtevi prijavljenog klijenta |
| GET   | `/api/admin/zahtevi?status=` | admin | svi zahtevi (opciono filter: `NA_CEKANJU`, `ODOBREN`, `ODBIJEN`) |
| PATCH | `/api/admin/zahtevi/:id` | admin | `{ status: "ODOBREN" \| "ODBIJEN" }` — samo za zahteve na čekanju |
| PUT   | `/api/admin/konzole/:id` | admin | `{ cenaPoDanu }` — izmena cenovnika |
