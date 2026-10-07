'use strict';

// Zajednički kod za sve stranice: komunikacija sa serverom, sesija i pomoćne funkcije.
const Api = (() => {
  const TOKEN_KEY = 'token';
  const MESSAGE_KEY = 'poruka';

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function saveToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function pageFor(uloga) {
    return uloga === 'admin' ? '/admin.html' : '/klijent.html';
  }

  function isLoginPage() {
    return location.pathname === '/' || location.pathname === '/index.html';
  }

  // Poruka koju login stranica prikaže posle preusmeravanja (npr. istekla sesija).
  function setLoginMessage(text) {
    sessionStorage.setItem(MESSAGE_KEY, text);
  }

  function takeLoginMessage() {
    const text = sessionStorage.getItem(MESSAGE_KEY);
    sessionStorage.removeItem(MESSAGE_KEY);
    return text;
  }

  async function request(method, url, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('Server nije dostupan. Proverite da li je pokrenut.', 0);
    }

    // Istekla sesija -> brišemo token i vraćamo korisnika na prijavu.
    if (res.status === 401 && url !== '/api/prijava') {
      const poruka = 'Sesija je istekla. Prijavite se ponovo.';
      clearToken();
      if (!isLoginPage()) {
        setLoginMessage(poruka);
        location.replace('/');
      }
      throw new ApiError(poruka, 401);
    }

    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(data?.greska || `Greška na serveru (${res.status}).`, res.status);
    }
    return data;
  }

  // Pušta na stranicu samo prijavljenog korisnika sa odgovarajućom ulogom.
  async function requireRole(uloga) {
    if (!getToken()) {
      location.replace('/');
      return null;
    }
    const { korisnik } = await request('GET', '/api/korisnik');
    if (korisnik.uloga !== uloga) {
      location.replace(pageFor(korisnik.uloga));
      return null;
    }
    return korisnik;
  }

  async function logout() {
    try {
      await request('POST', '/api/odjava');
    } catch {
      // Odjavljujemo lokalno čak i ako server nije dostupan.
    }
    clearToken();
    location.replace('/');
  }

  return {
    ApiError,
    getToken,
    saveToken,
    clearToken,
    pageFor,
    takeLoginMessage,
    requireRole,
    logout,
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    patch: (url, body) => request('PATCH', url, body),
    put: (url, body) => request('PUT', url, body),
  };
})();

const Format = (() => {
  const brojFormat = new Intl.NumberFormat('sr-RS');
  const datumFormat = new Intl.DateTimeFormat('sr-RS', { dateStyle: 'short', timeStyle: 'short' });

  const STATUSI = {
    NA_CEKANJU: { tekst: 'Na čekanju', klasa: 'badge-pending' },
    ODOBREN: { tekst: 'Odobren', klasa: 'badge-approved' },
    ODBIJEN: { tekst: 'Odbijen', klasa: 'badge-rejected' },
  };

  return {
    cena: (iznos) => `${brojFormat.format(iznos)} din`,
    datum: (iso) => (iso ? datumFormat.format(new Date(iso)) : '—'),
    // 1 dan, 2 dana, 11 dana, 21 dan...
    dana: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana'}`,
    status: (status) => STATUSI[status] ?? { tekst: status, klasa: '' },
  };
})();

// Pravi DOM element; tekst se uvek postavlja kao textContent (bez innerHTML-a).
// Atribut sa vrednošću false/null/undefined se izostavlja, a true daje prazan atribut.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (value === true) node.setAttribute(key, '');
    else if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

function showMessage(node, text) {
  node.textContent = text;
  node.hidden = !text;
}

function statusBadge(status) {
  const { tekst, klasa } = Format.status(status);
  return el('span', { class: `badge ${klasa}` }, tekst);
}

// Dugme za odjavu radi i kada server nije dostupan (briše lokalnu sesiju).
document.getElementById('logout')?.addEventListener('click', Api.logout);

function showUserName(korisnik) {
  document.getElementById('user-name').textContent = korisnik.imePrezime;
}
