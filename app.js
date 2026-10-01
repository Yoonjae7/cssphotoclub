import { PhotoSession, PHOTO_COUNT, PICK_COUNT, POSE_MS, containFit } from './photo-session.js';
import { STRIP, FRAME_DESIGNS, DEFAULT_FRAME, frameDesign, drawStrip } from './photo-strip.js';
import { canArchiveLocally } from './photo-archive.js';
import { canMakeVideo, makePhotoVideo } from './video-export.js';
import qrcode from './vendor/qrcode.mjs';
const $ = id => document.getElementById(id);
const session = new PhotoSession();
const canvas = $('scene'), ctx = canvas.getContext('2d', { alpha: false }), video = $('camera');
const state = { mode: 'off', view: 'capture', design: DEFAULT_FRAME, stream: null, opening: false, timer: null, deadline: 0, generation: 0, previewRevision: 0, resultUrl: null, resultBlob: null, resultKey: null, shareId: null, shareUrl: null, shareBusy: false, shareVideoReady: false, shareRevision: 0, shareExpiryTimer: null };
function boothApi() {
  if (canArchiveLocally(window.location)) return '';
  const url = new URL($('booth-server-url').value.trim() || 'http://127.0.0.1:3000');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The booth server address must be http://127.0.0.1 with its port.');
  }
  return url.origin;
}
const logos = { css: new Image(), nottingham: new Image() };
logos.css.src = 'assets/css-logo.png'; logos.nottingham.src = 'assets/nottingham-logo.png';
const assetsReady = Promise.all(Object.values(logos).map(image => image.decode().catch(() => {}))).then(() => document.fonts.ready);
const photoImages = new Map();

function notice(message = '', error = false) {
  $('notice').textContent = message; $('notice').classList.toggle('hidden', !message); $('notice').classList.toggle('error', error);
}
function inRound() { return ['capturing', 'between'].includes(session.phase); }
function stopTimer() { clearTimeout(state.timer); state.timer = null; }
function eraseActivePhotos() {
  state.previewRevision++; photoImages.clear(); $('photo-grid').replaceChildren();
  $('strip-preview').getContext('2d').clearRect(0, 0, STRIP.width, STRIP.height);
}
function showView(view) {
  state.view = view;
  for (const name of ['capture', 'choose', 'result']) $(name + '-view').classList.toggle('hidden', name !== view);
  const step = session.step - 1;
  ['step-camera', 'step-choose', 'step-frame', 'step-strip'].forEach((id, index) => {
    $(id).classList.toggle('current', index === step);
    $(id).classList.toggle('complete', index === 0 ? session.photos.length === PHOTO_COUNT : index === 1 ? session.complete : index === 3 ? Boolean(state.resultBlob) : false);
    if (index === step) $(id).setAttribute('aria-current', 'step'); else $(id).removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = $(view + '-view').querySelector('h1'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
}
function navigateStep(step) {
  if (!Number.isInteger(step) || step < 1 || step > 4) return;
  stopTimer(); state.previewRevision++;
  if (session.phase === 'building') state.generation++;
  session.navigate(step); $('shutter-flash').classList.remove('active'); notice();
  if (step === 1) { showView('capture'); updateCapture(); }
  else if (step === 2) showChoices();
  else {
    $('strip-heading').innerHTML = step === 3 ? 'Your strip.<br><em>Your memories.</em>' : 'Save your<br><em>little keepsake.</em>';
    showView('result'); updateSaveControls(); updatePreview();
  }
}
function updateCapture() {
  $('start-button').disabled = state.mode === 'off' || state.opening || session.phase === 'between';
  $('start-button').innerHTML = session.phase === 'capturing' ? 'Take photo now <span>↗</span>' : session.phase === 'between' ? 'Nice! Next pose…' : session.phase === 'paused' ? 'Continue my photos <span>↗</span>' : 'Start my 8 photos <span>↗</span>';
  $('cancel-button').classList.toggle('hidden', !inRound());
  $('shot-countdown').classList.toggle('hidden', session.phase !== 'capturing');
  $('capture-help').textContent = inRound() ? 'Automatic countdown · press Space to snap sooner.' : 'Three seconds to pose before each photo.';
  $('camera-status').textContent = state.mode === 'off' ? 'CAMERA OFF' : inRound() ? `PHOTO ${Math.min(PHOTO_COUNT, session.photos.length + 1)} / ${PHOTO_COUNT}` : state.mode === 'demo' ? 'DEMO · NO CAMERA NEEDED' : 'LIVE CAMERA · READY';
  $('shot-progress').replaceChildren(...Array.from({ length: PHOTO_COUNT }, (_, index) => {
    const dot = document.createElement('span'); dot.textContent = String(index + 1).padStart(2, '0');
    dot.className = index < session.photos.length ? 'taken' : inRound() && index === session.photos.length ? 'next' : '';
    return dot;
  }));
  $('shot-progress').setAttribute('aria-label', `${session.photos.length} of ${PHOTO_COUNT} photos taken`);
}
async function openCamera() {
  if (state.opening || inRound()) return;
  if (!navigator.mediaDevices?.getUserMedia) return notice('Camera access needs localhost or HTTPS. You can still try the demo.', true);
  state.opening = true; $('camera-button').disabled = true; $('demo-button').disabled = true; $('camera-button').textContent = 'Opening the camera…'; notice();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, resizeMode: { ideal: 'none' }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
    const track = stream.getVideoTracks()[0], zoom = track.getCapabilities?.().zoom;
    if (zoom && Number.isFinite(zoom.min)) await track.applyConstraints({ advanced: [{ zoom: zoom.min }] }).catch(() => {});
    state.stream?.getTracks().forEach(old => old.stop()); state.stream = stream;
    video.srcObject = stream; await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error('Camera image is not ready');
    state.mode = 'camera'; $('welcome').classList.add('hidden');
    track.addEventListener('ended', () => {
      state.mode = 'off'; state.stream = null;
      if (inRound()) cancelRound('Camera disconnected. Reconnect it and start a fresh round.');
      $('welcome').classList.remove('hidden'); updateCapture(); notice('Camera disconnected. Your completed photos are still available.', true);
    });
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop()); state.stream = null;
    notice(error.name === 'NotAllowedError' ? 'Camera permission was declined. Allow it in the browser, or try the demo.' : error.name === 'NotFoundError' ? 'No camera found. Connect a webcam or try the demo.' : `Could not open the camera: ${error.message}`, true);
  } finally {
    state.opening = false; $('camera-button').disabled = false; $('demo-button').disabled = false; $('camera-button').innerHTML = 'Open the camera <span>↗</span>'; updateCapture();
  }
}
function startDemo() {
  if (state.opening || inRound()) return;
  state.stream?.getTracks().forEach(track => track.stop()); state.stream = null; video.srcObject = null;
  state.mode = 'demo'; $('welcome').classList.add('hidden'); updateCapture(); notice();
}
function ellipse(x, y, rx, ry, colour) { ctx.fillStyle = colour; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function drawDemo(now) {
  const pose = session.photos.length % PHOTO_COUNT;
  const colours = ['#b9b0d6', '#b9cfbf', '#d9b4cb', '#b8c4dd', '#d7bfb1', '#b8c7c1', '#c5b7dd', '#dfc0d3'];
  const gradient = ctx.createLinearGradient(0, 0, 1280, 960); gradient.addColorStop(0, '#ede5e0'); gradient.addColorStop(1, colours[pose]);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 960);
  ctx.fillStyle = '#ffffff38'; for (let x = 0; x < 1280; x += 80) ctx.fillRect(x, 0, 1, 960);
  ctx.font = '500 70px "Pixelify Sans", monospace'; ctx.fillStyle = '#7070a238'; ctx.textAlign = 'center'; ctx.fillText('WE BUILD', 640, 210);
  [310, 640, 965].forEach((x, person) => {
    const bob = Math.sin(now / 800 + person) * 8;
    const y = 470 + bob + Math.sin(pose * 1.6 + person) * 24;
    const tilt = Math.sin(pose + person) * .12;
    const skins = ['#d2a07c', '#edc4a4', '#bc876b'], shirts = ['#7070a2', '#98c9aa', '#d694bc'];
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ellipse(0, 350, 195, 260, shirts[person]); ellipse(0, -14, 119, 152, '#393248');
    if (person === 2) ellipse(0, 95, 138, 172, '#393248');
    ellipse(0, 25, 95, 118, skins[person]); ellipse(-39, -74, 64, 34, '#393248'); ellipse(37, -72, 67, 41, '#393248');
    if (pose % 3 === 1) {
      ctx.strokeStyle = '#393248'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(-34, 26, 11, Math.PI, Math.PI * 2); ctx.arc(34, 26, 11, Math.PI, Math.PI * 2); ctx.stroke();
    } else { ellipse(-34, 22, 6, 9, '#393248'); ellipse(34, 22, 6, 9, '#393248'); }
    ctx.strokeStyle = '#8c544f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 48, 26, .1, Math.PI - .1); ctx.stroke();
    ellipse(-61, 48, 13, 7, '#d18b8960'); ellipse(61, 48, 13, 7, '#d18b8960');
    if (person === 1) {
      ctx.strokeStyle = '#514960'; ctx.lineWidth = 5; ctx.strokeRect(-62, 7, 48, 36); ctx.strokeRect(14, 7, 48, 36); ctx.beginPath(); ctx.moveTo(-14, 18); ctx.lineTo(14, 18); ctx.stroke();
    }
    if ((pose + person) % 2 === 0) {
      ellipse(130, 135, 26, 41, skins[person]); ctx.strokeStyle = skins[person]; ctx.lineWidth = 17; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(120, 107); ctx.lineTo(104, 56); ctx.moveTo(139, 107); ctx.lineTo(151, 54); ctx.stroke();
    }
    ctx.restore();
  });
  ctx.textAlign = 'right'; ctx.font = '500 23px "Pixelify Sans", monospace'; ctx.fillStyle = '#57516b'; ctx.fillText(`DEMO / POSE ${String(pose + 1).padStart(2, '0')}`, 1230, 913);
}
function drawScene(now) {
  if (state.mode === 'camera' && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const fit = containFit(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
    ctx.fillStyle = '#363449'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.filter = 'brightness(1.04) saturate(.96)';
    ctx.drawImage(video, fit.x, fit.y, fit.width, fit.height); ctx.restore();
  } else if (state.mode === 'demo') drawDemo(now);
  else {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#dcd5e9'); gradient.addColorStop(.65, '#c4c1df'); gradient.addColorStop(1, '#c5ddd0');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7070a21a';
    for (let x = 0; x < canvas.width; x += 70) ctx.fillRect(x, 0, 1, canvas.height);
    for (let y = 0; y < canvas.height; y += 70) ctx.fillRect(0, y, canvas.width, 1);
    ctx.save(); ctx.translate(1100, 790); ctx.rotate(.3); ctx.fillStyle = '#f1a1db90';
    for (let x = -130; x < 130; x += 15) for (let y = -130; y < 130; y += 15) {
      if (Math.abs(x) < 20 || Math.abs(y) < 20 || Math.abs(x - y) < 22) ctx.fillRect(x, y, 5, 5);
    }
    ctx.restore();
  }
}
function frame(now) {
  if (state.view === 'capture') {
    drawScene(now);
    if (session.phase === 'capturing') $('countdown-number').textContent = String(Math.max(1, Math.ceil((state.deadline - now) / 1000)));
  }
  requestAnimationFrame(frame);
}
function countdown() {
  stopTimer(); state.deadline = performance.now() + POSE_MS;
  $('shot-label').textContent = `PHOTO ${String(session.photos.length + 1).padStart(2, '0')} / 08`;
  $('countdown-number').textContent = '3'; updateCapture();
  state.timer = setTimeout(takePhoto, POSE_MS);
}
function startRound() {
  if (state.mode === 'off' || state.opening) return;
  if (session.phase === 'capturing') return takePhoto();
  if (inRound() || session.phase === 'building') return;
  if (session.continueCapture()) { notice(); countdown(); return; }
  releaseResult(); eraseActivePhotos(); state.generation++; session.start(); notice(); countdown();
  $('camera-stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function takePhoto() {
  if (session.phase !== 'capturing') return;
  stopTimer();
  if (state.mode === 'camera' && (video.readyState < 2 || !video.videoWidth || !video.videoHeight)) return cancelRound('The camera image is not ready. Please try another round.');
  try {
    // Only the clean scene is saved: countdown, flash and screen controls are DOM overlays.
    drawScene(performance.now());
    if (!session.capture(canvas.toDataURL('image/jpeg', .95))) return;
    $('shutter-flash').classList.remove('active'); void $('shutter-flash').offsetWidth; $('shutter-flash').classList.add('active');
    updateCapture();
    if (session.phase === 'choosing') { navigateStep(2); return; }
    state.timer = setTimeout(() => { session.resume(); countdown(); }, 650);
  } catch { cancelRound('Could not capture the photo. Please start a fresh round.'); }
}
function cancelRound(message = '') {
  stopTimer(); state.generation++; session.reset(); eraseActivePhotos(); $('shutter-flash').classList.remove('active');
  updateCapture(); notice(message, Boolean(message));
}
function loadPhoto(source) {
  if (!photoImages.has(source)) {
    const image = new Image(); image.src = source;
    photoImages.set(source, image.decode().then(() => image));
  }
  return photoImages.get(source);
}
function showChoices() {
  state.previewRevision++; showView('choose'); notice();
  $('empty-photos').classList.toggle('hidden', session.photos.length > 0);
  $('photo-grid').replaceChildren(...session.photos.map((photo, index) => {
    const button = document.createElement('button'); button.className = 'photo-choice'; button.dataset.index = index;
    const image = document.createElement('img'); image.src = photo; image.alt = `Booth photo ${index + 1}`;
    const caption = document.createElement('span'); caption.className = 'photo-caption';
    const label = document.createElement('span'); label.textContent = `PHOTO ${String(index + 1).padStart(2, '0')}`;
    const status = document.createElement('span'); status.className = 'choice-status'; status.textContent = 'TAP TO PICK';
    const rank = document.createElement('span'); rank.className = 'pick-rank hidden'; rank.setAttribute('aria-hidden', 'true');
    caption.append(label, status); button.append(image, caption, rank);
    button.addEventListener('click', () => choosePhoto(index)); return button;
  }));
  updateChoices();
}
function choosePhoto(index) {
  if (state.view !== 'choose' || session.phase !== 'choosing') return;
  if (!session.toggle(index)) return notice('You have four favourites. Tap a selected photo to remove it, then pick another.');
  releaseResult(); notice(); updateChoices();
}
function createDesignOptions() {
  $('design-options').replaceChildren(...FRAME_DESIGNS.map((design, index) => {
    const button = document.createElement('button'); button.className = 'design-option'; button.dataset.design = design.id;
    const swatch = document.createElement('span'); swatch.className = 'design-swatch'; swatch.style.background = design.paper; swatch.style.borderColor = design.ink; swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = `Design ${index + 1}`;
    button.append(swatch, label);
    button.addEventListener('click', () => chooseFrame(design.id)); return button;
  }));
}
function chooseFrame(id) {
  if (state.view !== 'result' || session.phase !== 'preview') return;
  const next = frameDesign(id).id;
  if (next === state.design) return;
  state.design = next; releaseResult(); updateSaveControls(); updatePreview();
}
function cycleDesign(direction) {
  const index = FRAME_DESIGNS.findIndex(design => design.id === state.design);
  chooseFrame(FRAME_DESIGNS[(index + direction + FRAME_DESIGNS.length) % FRAME_DESIGNS.length].id);
}
function updateChoices() {
  const building = session.phase === 'building';
  $('selection-count').textContent = `${session.selected.length} of ${PICK_COUNT} selected`;
  for (const button of $('photo-grid').children) {
    const index = Number(button.dataset.index), rank = session.selected.indexOf(index), selected = rank >= 0;
    button.disabled = building; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `Photo ${index + 1}${selected ? `, selected as frame ${rank + 1}` : ', not selected'}`);
    button.querySelector('.choice-status').textContent = selected ? `FRAME ${String(rank + 1).padStart(2, '0')}` : 'TAP TO PICK';
    const badge = button.querySelector('.pick-rank'); badge.textContent = rank + 1; badge.classList.toggle('hidden', !selected);
  }
  $('retake-button').disabled = building;
  $('selection-help').textContent = session.complete ? 'Four favourites. Your strip is ready to preview.' : `Pick ${PICK_COUNT - session.selected.length} more to save. You can preview any time.`;
}
function updateSaveControls() {
  const building = session.phase === 'building';
  for (const button of $('design-options').children) {
    const selected = button.dataset.design === state.design;
    button.disabled = building; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  $('design-count').textContent = `${frameDesign(state.design).name} / ${FRAME_DESIGNS.length}`;
  $('previous-design-button').disabled = building; $('next-design-button').disabled = building;
  const previewOnly = session.step === 3;
  $('continue-save-button').classList.toggle('hidden', !previewOnly);
  for (const id of ['download-button', 'print-button']) { $(id).classList.toggle('hidden', previewOnly); $(id).disabled = !session.complete || building; }
  $('download-button').innerHTML = building ? 'Making your PNG…' : 'Save & download PNG <span>↓</span>';
  $('share-button').classList.toggle('hidden', previewOnly);
  $('share-button').disabled = !session.complete || building || state.shareBusy || (Boolean(state.shareUrl) && state.shareVideoReady);
  $('share-button').innerHTML = state.shareBusy ? 'Preparing your phone link…' : state.shareUrl && !state.shareVideoReady ? 'Retry video upload <span>↗</span>' : 'Create phone QR <span>▦</span>';
  $('save-help').textContent = session.complete ? 'All four are here. Change the design, then save it.' : `${session.selected.length} of 4 photos selected. Preview freely; choose four to save.`;
}
async function updatePreview() {
  const revision = ++state.previewRevision, selected = [...session.chosen], design = state.design;
  try {
    const photos = await Promise.all(selected.map(loadPhoto)); await assetsReady;
    if (revision !== state.previewRevision) return;
    drawStrip($('strip-preview').getContext('2d'), photos, { logos, date: session.date, demo: state.mode === 'demo', design });
  } catch { notice('Could not load a photo. Retake this round and try again.', true); }
}
function releaseResult() {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  clearTimeout(state.shareExpiryTimer); state.shareExpiryTimer = null;
  state.resultUrl = null; state.resultBlob = null; state.resultKey = null; $('strip-result').removeAttribute('src'); $('archive-status').textContent = '';
  state.shareRevision++; state.shareId = null; state.shareUrl = null; state.shareBusy = false; state.shareVideoReady = false;
  $('phone-share').classList.add('hidden'); $('share-status').textContent = '';
}
function exportKey() { return `${state.generation}:${state.design}:${session.selected.join(',')}`; }
async function makeStrip() {
  if (state.view !== 'result' || !session.complete || session.phase === 'building') return null;
  const key = exportKey();
  if (state.resultKey === key && state.resultUrl) return {url:state.resultUrl};
  if (!session.beginBuild()) return null;
  const generation = state.generation, sources = [...session.chosen], date = session.date, design = state.design;
  updateSaveControls(); notice();
  try {
    const photos = await Promise.all(sources.map(loadPhoto)); await assetsReady;
    if (generation !== state.generation) return null;
    const strip = document.createElement('canvas'); strip.width = STRIP.width; strip.height = STRIP.height;
    drawStrip(strip.getContext('2d'), photos, { logos, date, demo: state.mode === 'demo', design });
    const blob = await new Promise(resolve => strip.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG export failed');
    if (generation !== state.generation || key !== exportKey() || session.phase !== 'building') return null;
    releaseResult(); state.resultBlob = blob; state.resultUrl = URL.createObjectURL(blob); state.resultKey = key;
    $('strip-result').src = state.resultUrl; session.finishBuild(); updateSaveControls();
    $('step-strip').classList.add('complete');
    archiveStrip(blob, generation);
    return {url:state.resultUrl};
  } catch (error) { if (generation === state.generation) { session.finishBuild(false); updateSaveControls(); notice('Could not make your strip. Please try again.', true); } return null; }
}
async function archiveStrip(blob, generation) {
  $('archive-status').textContent = 'Saving your strip to Downloads/cssbooth/photo…';
  try {
    const response = await fetch(`${boothApi()}/api/strips`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob, targetAddressSpace: 'loopback' });
    if (!response.ok) throw new Error(`Local save failed (${response.status})`);
    await response.json();
    if (generation === state.generation && state.resultBlob === blob) $('archive-status').textContent = '✓ Saved in Downloads/cssbooth/photo on the booth laptop.';
  } catch {
    if (generation === state.generation && state.resultBlob === blob) $('archive-status').textContent = 'Could not save locally. Start the booth server, then download this strip to keep a copy.';
  }
}
function drawQr(url) {
  const code = qrcode(0, 'M'); code.addData(url); code.make();
  const modules = code.getModuleCount(), cell = 5, quiet = 4;
  const qrCanvas = $('share-qr'); qrCanvas.width = qrCanvas.height = (modules + quiet * 2) * cell;
  const qrContext = qrCanvas.getContext('2d');
  qrContext.fillStyle = '#fff'; qrContext.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
  qrContext.fillStyle = '#303044';
  for (let row = 0; row < modules; row++) for (let column = 0; column < modules; column++) {
    if (code.isDark(row, column)) qrContext.fillRect((column + quiet) * cell, (row + quiet) * cell, cell, cell);
  }
}
async function postMedia(url, blob) {
  const headers = { 'Content-Type': blob.type };
  const response = await fetch(url, { method: 'POST', headers, body: blob, targetAddressSpace: 'loopback' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Upload failed (${response.status})`);
  return result;
}
async function createPhoneShare() {
  if (state.shareBusy || !session.complete) return;
  const result = await makeStrip();
  if (!result) return;
  const generation = state.generation, revision = state.shareRevision, selected = [...session.chosen];
  const active = () => generation === state.generation && revision === state.shareRevision && state.view === 'result';
  state.shareBusy = true; $('share-status').textContent = state.shareUrl ? 'Retrying your video…' : 'Uploading your photo…'; updateSaveControls();
  try {
    if (!state.shareUrl) {
      const photo = state.resultBlob;
      if (!active()) return;
      const share = await postMedia(`${boothApi()}/api/shares`, photo);
      if (!active()) return;
      state.shareId = share.id; state.shareUrl = share.shareUrl;
      state.shareExpiryTimer = setTimeout(() => {
        if (!active()) return;
        state.generation++; releaseResult(); session.reset(); eraseActivePhotos(); state.design = DEFAULT_FRAME;
        showView('capture'); updateCapture(); notice('The five-minute QR expired. The booth laptop keeps its saved picture and video.');
      }, Math.max(1, share.expiresAt - Date.now()));
      drawQr(share.shareUrl);
      $('share-link').href = share.shareUrl; $('share-link').textContent = share.shareUrl;
      $('phone-share').classList.remove('hidden');
    }
    if (!canMakeVideo()) { $('share-status').textContent = 'Photo QR ready. This browser cannot make the video.'; return; }
    $('share-status').textContent = 'Photo QR ready. Making your video…';
    const photos = await Promise.all(selected.map(loadPhoto));
    const videoBlob = await makePhotoVideo(photos);
    if (!active()) return;
    $('share-status').textContent = 'Photo QR ready. Uploading your video…';
    await postMedia(`${boothApi()}/api/shares/${state.shareId}/video`, videoBlob);
    if (active()) { state.shareVideoReady = true; $('share-status').textContent = '✓ Photo and video are ready. Scan the QR with your phone.'; }
  } catch (error) {
    if (active()) $('share-status').textContent = state.shareUrl ? `Photo QR ready. Video unavailable: ${error.message}` : `Could not connect to the booth laptop: ${error.message}. Start the local server and check its address.`;
  } finally { if (active()) { state.shareBusy = false; updateSaveControls(); } }
}
function nextGroup() {
  stopTimer(); state.generation++; releaseResult(); session.reset(); eraseActivePhotos(); state.design = DEFAULT_FRAME;
  showView('capture'); updateCapture(); notice();
}
async function downloadStrip() {
  const result = await makeStrip();
  if (!result || result.url !== state.resultUrl) return;
  const link = document.createElement('a'); link.href = result.url;
  link.download = `css-four-cut-${session.date.toISOString().replace(/[:.]/g, '-')}.png`;
  document.body.append(link); link.click(); link.remove();
}
async function printStrip() {
  const result = await makeStrip();
  if (!result) return;
  await $('strip-result').decode().catch(() => {});
  if (result.url === state.resultUrl && state.view === 'result') window.print();
}
$('camera-button').addEventListener('click', openCamera);
$('demo-button').addEventListener('click', startDemo);
$('start-button').addEventListener('click', startRound);
$('cancel-button').addEventListener('click', () => cancelRound());
$('retake-button').addEventListener('click', () => { nextGroup(); startRound(); });
$('view-strip-button').addEventListener('click', () => navigateStep(4));
$('go-camera-button').addEventListener('click', () => navigateStep(1));
$('continue-save-button').addEventListener('click', () => navigateStep(4));
$('previous-design-button').addEventListener('click', () => cycleDesign(-1));
$('next-design-button').addEventListener('click', () => cycleDesign(1));
$('next-group-button').addEventListener('click', nextGroup);
$('edit-selection-button').addEventListener('click', () => navigateStep(2));
$('download-button').addEventListener('click', downloadStrip);
$('print-button').addEventListener('click', printStrip);
$('share-button').addEventListener('click', createPhoneShare);
for (const button of document.querySelectorAll('.journey button')) button.addEventListener('click', () => navigateStep(Number(button.dataset.step)));
document.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  if (['BUTTON', 'A'].includes(event.target.tagName) && (event.code === 'Space' || event.key === 'Enter')) return;
  if (state.view === 'capture' && event.code === 'Space') { event.preventDefault(); startRound(); }
  if (state.view === 'capture' && event.key.toLowerCase() === 'd') startDemo();
  if (inRound() && event.key === 'Escape') cancelRound();
  if (state.view === 'choose' && /^[1-8]$/.test(event.key)) choosePhoto(Number(event.key) - 1);
  if (state.view === 'choose' && event.key === 'Enter') { event.preventDefault(); navigateStep(4); return; }
  if (state.view === 'result' && /^[1-3]$/.test(event.key)) chooseFrame(FRAME_DESIGNS[Number(event.key) - 1].id);
  if (state.view === 'result' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); cycleDesign(event.key === 'ArrowLeft' ? -1 : 1); }
  if (state.view === 'result' && event.key === 'Enter') { event.preventDefault(); if (session.step === 3) navigateStep(4); else downloadStrip(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && inRound()) { navigateStep(1); notice('The round is paused. Continue your photos when you return.'); } });
window.addEventListener('beforeunload', () => { stopTimer(); state.stream?.getTracks().forEach(track => track.stop()); if (state.resultUrl) URL.revokeObjectURL(state.resultUrl); });
if (!canArchiveLocally(window.location)) {
  $('booth-server-wrap').classList.remove('hidden');
  $('booth-server-url').value = localStorage.getItem('boothServerUrl') || 'http://127.0.0.1:3000';
  $('booth-server-url').addEventListener('change', () => localStorage.setItem('boothServerUrl', $('booth-server-url').value.trim()));
  $('check-booth-server').addEventListener('click', async () => {
    $('booth-server-status').textContent = 'Connecting to the booth laptop…';
    try {
      const response = await fetch(`${boothApi()}/api/health`, { cache: 'no-store', targetAddressSpace: 'loopback' });
      if (!response.ok) throw new Error(`Server responded ${response.status}`);
      $('booth-server-status').textContent = '✓ Booth laptop connected. Pictures and videos will be saved locally.';
    } catch { $('booth-server-status').textContent = 'Could not connect. Start the server and set BOOTH_SITE_ORIGIN to this website’s address.'; }
  });
}
createDesignOptions(); showView('capture'); updateCapture(); requestAnimationFrame(frame);
