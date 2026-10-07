'use strict';

(async () => {
  const MIN_DANA = 1;
  const MAX_DANA = 30;
  const OSVEZAVANJE_MS = 15000;

  const pageError = document.getElementById('page-error');
  const form = document.getElementById('rent-form');
  const gradSelect = document.getElementById('grad');
  const konzolaSelect = document.getElementById('konzola');
  const daniInput = document.getElementById('broj-dana');
  const cenaInput = document.getElementById('cena');
  const cenaDetalji = document.getElementById('cena-detalji');
  const rentError = document.getElementById('rent-error');
  const rentSuccess = document.getElementById('rent-success');
  const submitButton = form.querySelector('button[type="submit"]');
  const tbody = document.getElementById('zahtevi-body');
  const emptyNote = document.getElementById('zahtevi-empty');

  let konzole = [];

  let korisnik;
  try {
    korisnik = await Api.requireRole('klijent');
  } catch (err) {
    showMessage(pageError, err.message);
    return;
  }
  if (!korisnik) return;
  setupHeader(korisnik);

  function selectedConsole() {
    return konzole.find((k) => String(k.id) === konzolaSelect.value) ?? null;
  }

  function readDays() {
    const raw = daniInput.value.trim();
    if (!/^\d+$/.test(raw)) return null;
    const dana = Number(raw);
    return dana >= MIN_DANA && dana <= MAX_DANA ? dana : null;
  }

  // Cena je vezana za izabranu konzolu: cena po danu × broj dana.
  function updatePrice() {
    const konzola = selectedConsole();
    const dana = readDays();
    if (!konzola) {
      cenaInput.value = '—';
      cenaDetalji.textContent = 'Cena zavisi od izabrane konzole.';
    } else if (!dana) {
      cenaInput.value = '—';
      cenaDetalji.textContent = `${Format.cena(konzola.cenaPoDanu)} po danu — unesite broj dana od ${MIN_DANA} do ${MAX_DANA}.`;
    } else {
      cenaInput.value = Format.cena(konzola.cenaPoDanu * dana);
      cenaDetalji.textContent = `${Format.cena(konzola.cenaPoDanu)} po danu × ${Format.dana(dana)}`;
    }
  }

  function renderConsoles() {
    const izabrana = konzolaSelect.value;
    konzolaSelect.replaceChildren(
      el('option', { value: '' }, '— izaberite konzolu —'),
      ...konzole.map((k) =>
        el('option', { value: k.id }, `${k.naziv} (${Format.cena(k.cenaPoDanu)} / dan)`)),
    );
    konzolaSelect.value = izabrana;
    updatePrice();
  }

  // Admin može da promeni cenovnik, pa ga povremeno osvežavamo.
  async function loadConsoles() {
    const nove = await Api.get('/api/konzole');
    if (JSON.stringify(nove) === JSON.stringify(konzole)) return;
    konzole = nove;
    renderConsoles();
  }

  async function loadCities() {
    const gradovi = await Api.get('/api/gradovi');
    gradSelect.append(...gradovi.map((grad) => el('option', { value: grad }, grad)));
  }

  function renderRequests(zahtevi) {
    tbody.replaceChildren(...zahtevi.map((z) => el('tr', {},
      el('td', {}, z.id),
      el('td', {}, z.grad),
      el('td', {}, z.nazivKonzole),
      el('td', {}, Format.dana(z.brojDana)),
      el('td', { class: 'num' }, Format.cena(z.cena)),
      el('td', {}, Format.datum(z.kreiran)),
      el('td', {}, statusBadge(z.status)),
    )));
    emptyNote.hidden = zahtevi.length > 0;
  }

  async function loadRequests() {
    renderRequests(await Api.get('/api/zahtevi'));
  }

  async function refresh() {
    try {
      await Promise.all([loadRequests(), loadConsoles()]);
      showMessage(pageError, '');
    } catch (err) {
      showMessage(pageError, err.message);
    }
  }

  function validate() {
    if (!gradSelect.value) return { polje: gradSelect, poruka: 'Izaberite grad.' };
    if (!selectedConsole()) return { polje: konzolaSelect, poruka: 'Izaberite tip konzole.' };
    if (!readDays()) {
      return { polje: daniInput, poruka: `Broj dana mora biti ceo broj od ${MIN_DANA} do ${MAX_DANA}.` };
    }
    return null;
  }

  konzolaSelect.addEventListener('change', updatePrice);
  daniInput.addEventListener('input', updatePrice);
  document.getElementById('refresh').addEventListener('click', refresh);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(rentError, '');
    showMessage(rentSuccess, '');

    const greska = validate();
    if (greska) {
      showMessage(rentError, greska.poruka);
      greska.polje.focus();
      return;
    }

    submitButton.disabled = true;
    try {
      const zahtev = await Api.post('/api/zahtevi', {
        grad: gradSelect.value,
        konzolaId: Number(konzolaSelect.value),
        brojDana: readDays(),
      });
      form.reset();
      updatePrice();
      showMessage(rentSuccess,
        `Zahtev #${zahtev.id} je poslat: ${zahtev.nazivKonzole}, ${zahtev.grad}, `
        + `${Format.dana(zahtev.brojDana)}, ukupno ${Format.cena(zahtev.cena)}. `
        + 'Sačekajte odobrenje administratora.');
    } catch (err) {
      showMessage(rentError, err.message);
    } finally {
      submitButton.disabled = false;
    }
    await refresh();
  });

  try {
    await Promise.all([loadCities(), loadConsoles(), loadRequests()]);
  } catch (err) {
    showMessage(pageError, err.message);
  }
  setInterval(refresh, OSVEZAVANJE_MS);
})();
