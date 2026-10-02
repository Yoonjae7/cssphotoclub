import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoSession, PHOTO_COUNT, PICK_COUNT, POSE_MS, containFit } from './photo-session.js';
function completed() {
  const session = new PhotoSession(); session.start();
  for (let index = 0; index < PHOTO_COUNT; index++) { session.capture('photo-' + index); session.resume(); }
  return session;
}
test('takes exactly eight photos, with no duplicate captures between countdowns', () => {
  const session = new PhotoSession();
  assert.equal(session.capture('too-soon'), false); session.start();
  for (let i = 0; i < 8; i++) {
    assert.equal(session.capture('photo-' + i), true);
    assert.equal(session.capture('duplicate'), false);
    session.resume();
  }
  assert.equal(session.phase, 'choosing'); assert.equal(session.photos.length, 8);
  assert.equal(session.capture('ninth'), false); assert.equal(POSE_MS, 5000);
});
test('requires exactly four unique favourites and preserves click order', () => {
  const session = completed();
  for (const index of [5, 1, 7, 0]) assert.equal(session.toggle(index), true);
  assert.equal(session.complete, true); assert.equal(session.selected.length, PICK_COUNT);
  assert.deepEqual(session.chosen, ['photo-5', 'photo-1', 'photo-7', 'photo-0']);
  assert.equal(session.toggle(2), false); assert.deepEqual(session.selected, [5, 1, 7, 0]);
});
test('deselect and swap renumbers the remaining frames', () => {
  const session = completed(); [5, 1, 7, 0].forEach(index => session.toggle(index));
  session.toggle(1); assert.equal(session.complete, false); assert.deepEqual(session.selected, [5, 7, 0]);
  session.toggle(3); assert.deepEqual(session.selected, [5, 7, 0, 3]); assert.equal(session.complete, true);
});
test('invalid choices and choices during capture do nothing', () => {
  const session = new PhotoSession(); session.start(); session.capture('photo');
  assert.equal(session.toggle(0), false);
  const full = completed();
  for (const index of [-1, 8, 1.5, NaN, '2']) assert.equal(full.toggle(index), false);
  full.phase = 'building'; assert.equal(full.toggle(0), false);
});
test('reset and next round clear old shots and choices', () => {
  const session = completed(); session.toggle(3); session.reset();
  assert.equal(session.phase, 'ready'); assert.deepEqual(session.photos, []); assert.deepEqual(session.selected, []);
  session.start(); assert.equal(session.phase, 'capturing');
});

test('all four steps are accessible without prerequisites, but saving needs four photos', () => {
  const session = new PhotoSession();
  for (const step of [3,1,4,2]) { assert.equal(session.navigate(step), true); assert.equal(session.step, step); assert.equal(session.beginBuild(), false); }
  for (const step of [0,5,NaN,1.5,'3']) assert.equal(session.navigate(step), false);
  const full = completed(); [5,1,7,0].forEach(index => full.toggle(index));
  full.navigate(4); assert.equal(full.toggle(0), false); assert.equal(full.beginBuild(), true);
  assert.equal(full.finishBuild(), true); assert.equal(full.phase, 'preview');
});

test('back navigation preserves all photos and selected order', () => {
  const session = completed(); [5,1,7,0].forEach(index => session.toggle(index));
  const originals = [...session.photos];
  session.navigate(4); session.navigate(1); session.navigate(3); session.navigate(2);
  assert.deepEqual(session.selected, [5,1,7,0]); assert.deepEqual(session.photos, originals);
  session.toggle(1); session.navigate(3); assert.equal(session.beginBuild(), false);
  session.navigate(2); session.toggle(3); session.navigate(4); session.beginBuild(); session.finishBuild();
  session.navigate(2); assert.deepEqual(session.chosen, ['photo-5','photo-7','photo-0','photo-3']);
});

test('failed export stays on the shared preview and a new group clears it', () => {
  const session = completed(); [0,1,2,3].forEach(index => session.toggle(index));
  session.navigate(4); session.beginBuild(); session.finishBuild(false);
  assert.equal(session.phase, 'preview'); assert.equal(session.complete, true);
  assert.equal(session.beginBuild(), true); session.finishBuild(); session.navigate(2);
  session.reset(); assert.equal(session.step, 1); assert.equal(session.complete, false);
});

test('leaving capture preserves partial shots and returning can continue the round', () => {
  const session = new PhotoSession(); session.start(); session.capture('first');
  session.navigate(3); assert.deepEqual(session.photos, ['first']); assert.equal(session.capture('late'), false);
  session.navigate(1); assert.equal(session.phase, 'paused'); assert.equal(session.continueCapture(), true);
  session.capture('second'); assert.deepEqual(session.photos, ['first','second']);
  session.navigate(4); assert.equal(session.continueCapture(), false);
});
test('camera fit preserves all pixels and never crops or stretches', () => {
  for (const [sw, sh] of [[1920,1080], [1280,960], [720,1280], [2560,1080]]) {
    const fit = containFit(sw, sh, 1280, 960);
    assert.ok(fit.x >= 0 && fit.y >= 0);
    assert.ok(fit.x + fit.width <= 1280.001 && fit.y + fit.height <= 960.001);
    assert.ok(Math.abs(fit.width / fit.height - sw / sh) < .000001);
  }
  assert.throws(() => containFit(0, 1, 1280, 960));
});
