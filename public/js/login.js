'use strict';

(() => {
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const submit = form.querySelector('button[type="submit"]');

  showMessage(errorBox, Api.takeLoginMessage() ?? '');

  // Ako je korisnik već prijavljen u ovom tabu, šaljemo ga direktno na njegovu stranicu.
  if (Api.getToken()) {
    Api.get('/api/korisnik')
      .then(({ korisnik }) => location.replace(Api.pageFor(korisnik.uloga)))
      .catch(() => Api.clearToken());
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const korisnickoIme = form.korisnickoIme.value.trim();
    const lozinka = form.lozinka.value;
    if (!korisnickoIme || !lozinka) {
      showMessage(errorBox, 'Unesite korisničko ime i lozinku.');
      return;
    }

    showMessage(errorBox, '');
    submit.disabled = true;
    try {
      const { token, korisnik } = await Api.post('/api/prijava', { korisnickoIme, lozinka });
      Api.saveToken(token);
      location.replace(Api.pageFor(korisnik.uloga));
    } catch (err) {
      showMessage(errorBox, err.message);
      form.lozinka.value = '';
      form.lozinka.focus();
    } finally {
      submit.disabled = false;
    }
  });
})();
