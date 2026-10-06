import { setBoothToken } from './booth-session.js';

const form = document.getElementById('booth-login');
const password = document.getElementById('booth-password');
const status = document.getElementById('login-status');
const button = document.getElementById('unlock-booth');
const access = document.getElementById('access-view');
const content = document.getElementById('booth-content');
const footer = document.getElementById('booth-footer');

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true; status.textContent = 'Checking password…';
  try {
    const response = await fetch('/api/share?login=1', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }), cache: 'no-store', signal: AbortSignal.timeout(30_000)
    });
    password.value = '';
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not unlock the booth. Try again.');
    setBoothToken(result.token);
    await import('./app.js');
    access.classList.add('hidden'); content.classList.remove('hidden'); footer.classList.remove('hidden');
    document.querySelector('#capture-view h1').focus({ preventScroll: true });
  } catch (error) {
    password.value = ''; setBoothToken('');
    status.textContent = error.message === 'Failed to fetch' ? 'Could not reach the website. Check your connection and try again.' : error.message;
    password.focus();
  } finally { button.disabled = false; }
});

window.addEventListener('pageshow', event => {
  if (event.persisted) {
    setBoothToken(''); content.classList.add('hidden'); footer.classList.add('hidden'); access.classList.remove('hidden');
    window.location.reload();
  }
});
