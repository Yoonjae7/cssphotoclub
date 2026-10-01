import test from 'node:test';
import assert from 'node:assert/strict';
import { STRIP, FRAME_DESIGNS, DEFAULT_FRAME, SIGNATURE_PHRASE, frameDesign, frameLayout, photoSlot, drawStrip } from './photo-strip.js';
import { readFile } from 'node:fs/promises';
for (const design of FRAME_DESIGNS) test(`${design.name}: four non-overlapping 4:3 slots fit above the footer`, () => {
  const layout = frameLayout(design.id);
  const slots = Array.from({ length: 4 }, (_, index) => photoSlot(index, design.id));
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]; assert.equal(slot.width / slot.height, 4 / 3);
    assert.ok(slot.x > 0 && slot.x + slot.width < STRIP.width);
    if (i) assert.equal(slot.y - slots[i - 1].y - slots[i - 1].height, layout.gap);
  }
  assert.equal(slots[3].y + slots[3].height, STRIP.height - layout.footer);
  assert.ok(layout.footer >= 220);
  assert.throws(() => photoSlot(4));
});
function mockContext(overrides = {}) {
  return {save(){},restore(){},translate(){},rotate(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},drawImage(){},fillText(){},...overrides};
}
for (const design of FRAME_DESIGNS) test(`${design.name}: renderer preserves photos/order and Nottingham on the left`, () => {
  const calls = [], text = [];
  const ctx = mockContext({drawImage(...args){calls.push(args);},fillText(...args){text.push(args);}});
  const photos = [5,1,7,0].map(id => ({id, width:1280, height:960}));
  const logos = {nottingham:{naturalWidth:450,id:'nottingham'},css:{naturalWidth:750,id:'css'}};
  drawStrip(ctx, photos, {logos, design:design.id, date:new Date('2026-09-28T12:00:00Z')});
  assert.deepEqual(calls.slice(2).map(args => args[0].id), [5,1,7,0]);
  assert.equal(calls[0][0].id, 'nottingham'); assert.ok(calls[0][1] < STRIP.width / 2);
  assert.equal(calls[1][0].id, 'css'); assert.ok(calls[1][5] > STRIP.width / 2);
  // Only logo sizes change: both grow 20% around their original centres.
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .00001);
  near(calls[0][3], 204 * 1.2); near(calls[0][4], 78.4 * 1.2);
  near(calls[0][1] + calls[0][3] / 2, 43 + 204 / 2);
  near(calls[0][2] + calls[0][4] / 2, 20 + 78.4 / 2);
  assert.deepEqual(calls[1].slice(1, 5), [150, 190, 440, 430]);
  near(calls[1][7], 94 * 1.2); near(calls[1][8], 92 * 1.2);
  near(calls[1][5] + calls[1][7] / 2, STRIP.width - 133 + 94 / 2);
  near(calls[1][6] + calls[1][8] / 2, 12 + 92 / 2);
  assert.ok(text.some(args => args[0] === 'COMPUTER SCIENCE'));
  for (const [index, args] of calls.slice(2).entries()) {
    const slot = photoSlot(index, design.id);
    assert.deepEqual(args.slice(1), [slot.x, slot.y, slot.width, slot.height]);
    assert.equal(args.length, 5, 'photos use the whole source image, not a source crop');
  }
});
test('empty strip has four placeholders and demo strips are clearly labelled', () => {
  const text = [];
  const ctx = mockContext({fillText(value){text.push(value);}});
  drawStrip(ctx, [], {demo:true});
  assert.equal(text.filter(value => value === 'YOUR FAVOURITE GOES HERE').length, 4);
  assert.ok(text.some(value => value.includes('DEMO')));
});

test('three unique ready-made designs have a safe default', () => {
  assert.equal(FRAME_DESIGNS.length, 3);
  assert.equal(new Set(FRAME_DESIGNS.map(design => design.id)).size, 3);
  assert.equal(frameDesign('unknown').id, DEFAULT_FRAME);
  assert.deepEqual(photoSlot(0), photoSlot(0, DEFAULT_FRAME));
});

test('different-aspect photos are contained within every design', () => {
  for (const design of FRAME_DESIGNS) {
    const calls = [], photos = [{width:1920,height:1080},{width:720,height:1280},{width:960,height:960},{width:1280,height:960}];
    drawStrip(mockContext({drawImage(...args){calls.push(args);}}), photos, {design:design.id});
    calls.forEach(([,x,y,width,height], index) => {
      const slot = photoSlot(index, design.id);
      assert.ok(x >= slot.x && y >= slot.y && x + width <= slot.x + slot.width + .001 && y + height <= slot.y + slot.height + .001);
      assert.ok(Math.abs(width / height - photos[index].width / photos[index].height) < .00001);
    });
  }
});
test('capture and PNG export remain separate from the optional slideshow video', async () => {
  const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const video = await readFile(new URL('./video-export.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /new Worker|penContact|drawStrokes/);
  assert.match(source, /canvas.toDataURL\('image\/jpeg', .95\)/);
  assert.match(source, /strip.toBlob\(resolve, 'image\/png'\)/);
  assert.match(video, /new MediaRecorder\(stream/);
  assert.match(video, /SHOT_MS \* 4/);
});

test('design controls live on the save screen, with four always-available step buttons', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const photos = html.match(/<section id="choose-view"[^>]*>([\s\S]*?)<\/section>/)[1];
  const save = html.match(/<section id="result-view"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(photos, /id="photo-grid"/); assert.match(photos, /id="view-strip-button"/);
  assert.doesNotMatch(html, /id="frame-view"|id="frame-picker"/);
  assert.match(save, /id="strip-preview"/); assert.match(save, /id="design-options"/);
  assert.match(save, /id="download-button"/);
  const navigation = html.match(/<nav class="journey"[\s\S]*?<\/nav>/)[0];
  assert.equal([...navigation.matchAll(/data-step="[1-4]"/g)].length, 4); assert.doesNotMatch(navigation, /disabled/);
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  for (const match of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]), `Missing UI element: ${match[1]}`);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="assets\/favicon.svg"/);
  const favicon = await readFile(new URL('./assets/favicon.svg', import.meta.url), 'utf8');
  assert.match(favicon, /viewBox="0 0 64 64"/);
});

test('Enter opens the save preview without immediately downloading', async () => {
  const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const body = source.match(/document.addEventListener\('keydown', event => \{([\s\S]*?)\n\}\);/)[1];
  const dispatch = new Function('state', 'session', 'navigateStep', 'downloadStrip', 'choosePhoto', 'chooseFrame', 'FRAME_DESIGNS', 'event', 'inRound', body);
  const state = {view:'choose'}; let built = 0, prevented = 0;
  const event = {key:'Enter',code:'Enter',target:{tagName:'H1'},preventDefault(){prevented++;}};
  const args = [state, {step:4}, () => {state.view = 'result';}, () => {built++;}, () => {}, () => {}, FRAME_DESIGNS, event, () => false];
  dispatch(...args); assert.equal(state.view, 'result'); assert.equal(built, 0); assert.equal(prevented, 1);
  dispatch(...args); assert.equal(built, 1); assert.equal(prevented, 2);
});

test('every design carries the signature phrase and no old style names', () => {
  for (const design of FRAME_DESIGNS) {
    const labels = []; drawStrip(mockContext({fillText(value){labels.push(value);}}), [], {design:design.id});
    assert.ok(labels.some(value => value.includes(SIGNATURE_PHRASE.toUpperCase())));
    assert.doesNotMatch(labels.join(' '), /CLUB DIARY|AFTER HOURS|GOOD COMPANY/i);
  }
  assert.deepEqual(FRAME_DESIGNS.map(design => design.name), ['Design 1','Design 2','Design 3']);
});
