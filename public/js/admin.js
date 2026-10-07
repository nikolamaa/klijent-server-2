'use strict';

(async () => {
  const OSVEZAVANJE_MS = 15000;

  const pageError = document.getElementById('page-error');
  const actionMessage = document.getElementById('action-message');
  const tbody = document.getElementById('zahtevi-body');
  const emptyNote = document.getElementById('zahtevi-empty');
  const filterButtons = [...document.querySelectorAll('.filter')];
  const konzoleBody = document.getElementById('konzole-body');
  const cenovnikMessage = document.getElementById('cenovnik-message');

  let zahtevi = [];
  let aktivniFilter = 'NA_CEKANJU';

  let korisnik;
  try {
    korisnik = await Api.requireRole('admin');
  } catch (err) {
    showMessage(pageError, err.message);
    return;
  }
  if (!korisnik) return;
  setupHeader(korisnik);

  function setMessage(node, text, tip) {
    node.classList.toggle('success', tip === 'success');
    node.classList.toggle('error', tip === 'error');
    showMessage(node, text);
  }

  // ---------- zahtevi ----------

  function renderCounts() {
    for (const span of document.querySelectorAll('[data-count]')) {
      const status = span.dataset.count;
      span.textContent = status ? zahtevi.filter((z) => z.status === status).length : zahtevi.length;
    }
  }

  function actionButtons(z) {
    if (z.status !== 'NA_CEKANJU') {
      return el('span', { class: 'muted' }, `Obrađen ${Format.datum(z.obradjen)}`);
    }
    return el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'approve', onclick: () => decide(z, 'ODOBREN') }, 'Odobri'),
      el('button', { type: 'button', class: 'reject', onclick: () => decide(z, 'ODBIJEN') }, 'Odbij'),
    );
  }

  function renderRequests() {
    const prikazani = aktivniFilter ? zahtevi.filter((z) => z.status === aktivniFilter) : zahtevi;
    tbody.replaceChildren(...prikazani.map((z) => el('tr', {},
      el('td', {}, z.id),
      el('td', {}, z.klijent ? `${z.klijent.imePrezime} (${z.klijent.korisnickoIme})` : '—'),
      el('td', {}, z.grad),
      el('td', {}, z.nazivKonzole),
      el('td', {}, Format.dana(z.brojDana)),
      el('td', { class: 'num' }, Format.cena(z.cena)),
      el('td', {}, Format.datum(z.kreiran)),
      el('td', {}, statusBadge(z.status)),
      el('td', {}, actionButtons(z)),
    )));
    emptyNote.hidden = prikazani.length > 0;
    renderCounts();
  }

  async function loadRequests() {
    zahtevi = await Api.get('/api/admin/zahtevi');
    renderRequests();
  }

  async function decide(zahtev, status) {
    const akcija = status === 'ODOBREN' ? 'odobren' : 'odbijen';
    for (const button of tbody.querySelectorAll('button')) button.disabled = true;
    try {
      await Api.patch(`/api/admin/zahtevi/${zahtev.id}`, { status });
      setMessage(actionMessage,
        `Zahtev #${zahtev.id} (${zahtev.klijent?.imePrezime ?? 'klijent'}, ${zahtev.nazivKonzole}) je ${akcija}.`,
        'success');
    } catch (err) {
      setMessage(actionMessage, err.message, 'error');
    }
    await refresh();
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      aktivniFilter = button.dataset.status;
      for (const b of filterButtons) b.setAttribute('aria-pressed', String(b === button));
      renderRequests();
    });
  }

  // ---------- cenovnik ----------

  function renderConsoles(konzole) {
    konzoleBody.replaceChildren(...konzole.map((k) => {
      const input = el('input', {
        type: 'number', min: '1', step: '1', value: k.cenaPoDanu,
        'aria-label': `Cena po danu za ${k.naziv}`,
      });
      const save = el('button', { type: 'button', class: 'secondary' }, 'Sačuvaj');
      save.addEventListener('click', () => savePrice(k, input, save));
      return el('tr', {}, el('td', {}, k.naziv), el('td', {}, input), el('td', {}, save));
    }));
  }

  async function loadConsoles() {
    renderConsoles(await Api.get('/api/konzole'));
  }

  async function savePrice(konzola, input, button) {
    const raw = input.value.trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1) {
      setMessage(cenovnikMessage, 'Cena po danu mora biti pozitivan ceo broj.', 'error');
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      const azurirana = await Api.put(`/api/admin/konzole/${konzola.id}`, { cenaPoDanu: Number(raw) });
      konzola.cenaPoDanu = azurirana.cenaPoDanu;
      input.value = azurirana.cenaPoDanu;
      setMessage(cenovnikMessage,
        `Nova cena za ${azurirana.naziv}: ${Format.cena(azurirana.cenaPoDanu)} po danu.`, 'success');
    } catch (err) {
      setMessage(cenovnikMessage, err.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  // ---------- osvežavanje ----------

  async function refresh() {
    try {
      await loadRequests();
      showMessage(pageError, '');
    } catch (err) {
      showMessage(pageError, err.message);
    }
  }

  document.getElementById('refresh').addEventListener('click', refresh);

  try {
    await Promise.all([loadRequests(), loadConsoles()]);
  } catch (err) {
    showMessage(pageError, err.message);
  }
  // Novi zahtevi klijenata stižu sami, bez ručnog osvežavanja.
  setInterval(refresh, OSVEZAVANJE_MS);
})();
