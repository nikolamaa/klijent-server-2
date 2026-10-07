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
  let poslednjiOdgovor = '';
  let aktivniFilter = 'NA_CEKANJU';
  let odlukaUToku = false;

  let korisnik;
  try {
    korisnik = await Api.requireRole('admin');
  } catch (err) {
    showMessage(pageError, `${err.message} Osvežite stranicu kada server bude dostupan.`);
    return;
  }
  if (!korisnik) return;
  showUserName(korisnik);

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
    const opis = `zahtev #${z.id}${z.klijent ? ` (${z.klijent.imePrezime})` : ''}`;
    return el('div', { class: 'actions' },
      el('button', {
        type: 'button', class: 'approve', disabled: odlukaUToku,
        'aria-label': `Odobri ${opis}`, onclick: () => decide(z, 'ODOBREN'),
      }, 'Odobri'),
      el('button', {
        type: 'button', class: 'reject', disabled: odlukaUToku,
        'aria-label': `Odbij ${opis}`, onclick: () => decide(z, 'ODBIJEN'),
      }, 'Odbij'),
    );
  }

  function renderRequests() {
    // Pamtimo dugme u fokusu da bi tastatura ostala na istom mestu posle osvežavanja.
    const fokus = tbody.contains(document.activeElement)
      ? document.activeElement.getAttribute('aria-label')
      : null;
    const prikazani = aktivniFilter ? zahtevi.filter((z) => z.status === aktivniFilter) : zahtevi;
    tbody.replaceChildren(...prikazani.map((z) => el('tr', {},
      el('td', { 'data-label': '#' }, z.id),
      el('td', { 'data-label': 'Klijent' }, z.klijent
        ? el('span', {}, z.klijent.imePrezime, el('span', { class: 'muted' }, ` (${z.klijent.korisnickoIme})`))
        : '—'),
      el('td', { 'data-label': 'Grad' }, z.grad),
      el('td', { 'data-label': 'Konzola' }, z.nazivKonzole),
      el('td', { 'data-label': 'Broj dana' }, Format.dana(z.brojDana)),
      el('td', { 'data-label': 'Cena', class: 'num' }, Format.cena(z.cena)),
      el('td', { 'data-label': 'Poslat' }, Format.datum(z.kreiran)),
      el('td', { 'data-label': 'Status' }, statusBadge(z.status)),
      el('td', { 'data-label': 'Akcije' }, actionButtons(z)),
    )));
    emptyNote.hidden = prikazani.length > 0;
    renderCounts();
    if (fokus) tbody.querySelector(`[aria-label="${CSS.escape(fokus)}"]`)?.focus();
  }

  // Tabela se ponovo iscrtava samo kada se podaci promene, da se ne izgubi
  // fokus tastature pri automatskom osvežavanju.
  async function loadRequests({ force = false } = {}) {
    const novi = await Api.get('/api/admin/zahtevi');
    const odgovor = JSON.stringify(novi);
    if (!force && odgovor === poslednjiOdgovor) return;
    poslednjiOdgovor = odgovor;
    zahtevi = novi;
    renderRequests();
  }

  async function decide(zahtev, status) {
    const akcija = status === 'ODOBREN' ? 'odobren' : 'odbijen';
    odlukaUToku = true;
    renderRequests();
    try {
      await Api.patch(`/api/admin/zahtevi/${zahtev.id}`, { status });
      setMessage(actionMessage,
        `Zahtev #${zahtev.id} (${zahtev.klijent?.imePrezime ?? 'klijent'}, ${zahtev.nazivKonzole}) je ${akcija}.`,
        'success');
    } catch (err) {
      setMessage(actionMessage, err.message, 'error');
    }
    odlukaUToku = false;
    // Sledeće uspešno osvežavanje mora ponovo da iscrta (i otključa) dugmad,
    // čak i ako ovo ne uspe a podaci se nisu promenili.
    poslednjiOdgovor = '';
    await refresh({ force: true });
    actionMessage.focus();
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
      const save = el('button', {
        type: 'button', class: 'secondary', 'aria-label': `Sačuvaj cenu za ${k.naziv}`,
      }, 'Sačuvaj');
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

  async function refresh({ force = false } = {}) {
    try {
      await Promise.all([
        loadRequests({ force }),
        // Cenovnik se ponovo učitava samo ako nije učitan pri otvaranju stranice,
        // da se ne izgube izmene cena koje admin upravo kuca.
        konzoleBody.children.length === 0 ? loadConsoles() : null,
      ]);
      showMessage(pageError, '');
    } catch (err) {
      showMessage(pageError, err.message);
    }
  }

  document.getElementById('refresh').addEventListener('click', () => refresh());

  try {
    await Promise.all([loadRequests(), loadConsoles()]);
  } catch (err) {
    showMessage(pageError, err.message);
  }
  // Novi zahtevi klijenata stižu sami, bez ručnog osvežavanja.
  setInterval(refresh, OSVEZAVANJE_MS);
})();
