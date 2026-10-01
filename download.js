const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id || '')) {
  $('status').textContent = 'This QR link is invalid.';
} else {
  try {
    const response = await fetch(`/api/share?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'This photo could not be found.' : 'Could not load your photo. Please try again.');
    const share = await response.json();
    $('status').classList.add('hidden');
    $('preview').src = share.photo.url; $('preview').classList.remove('hidden');
    $('photo-link').href = share.photo.downloadUrl; $('photo-link').classList.remove('hidden');
    if (share.video) {
      $('video-link').href = share.video.downloadUrl;
      $('video-link').textContent = `Download video (${share.video.type})`;
      $('video-link').classList.remove('hidden');
    } else $('video-wait').classList.remove('hidden');
  } catch (error) { $('status').textContent = error.message; }
}
