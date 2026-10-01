const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let expiresAt = 0, timer;
function expire() {
  clearInterval(timer);
  $('preview').removeAttribute('src');
  for (const name of ['preview', 'photo-link', 'video-link', 'expiry']) $(name).classList.add('hidden');
  $('status').classList.remove('hidden'); $('status').textContent = 'This five-minute QR link has expired.';
}
function countdown() {
  const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  if (!remaining) return expire();
  $('expiry').textContent = `Download within ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}
if (!/^[0-9a-f-]{36}$/.test(id || '')) $('status').textContent = 'This QR link is invalid.';
else {
  try {
    const response = await fetch(`/api/share?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const share = await response.json();
    if (!response.ok) throw new Error(share.error || 'Could not load your keepsake. Please try again.');
    expiresAt = Date.now() + share.remainingMs;
    $('preview').src = share.photo;
    $('photo-link').href = share.photo + '&download=1';
    $('video-link').href = share.video + '&download=1';
    for (const name of ['preview', 'photo-link', 'video-link', 'expiry']) $(name).classList.remove('hidden');
    $('status').classList.add('hidden');
    timer = setInterval(countdown, 1000); countdown();
  } catch (error) { $('status').textContent = error.message; }
}
window.addEventListener('pageshow', () => { if (expiresAt) countdown(); });
