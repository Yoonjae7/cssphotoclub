import test from 'node:test';
import assert from 'node:assert/strict';
import { validStripPng } from './photo-storage.js';
function fixture() {
  const buffer = Buffer.alloc(57); Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer);
  buffer.writeUInt32BE(13,8); buffer.write('IHDR',12,'ascii');
  buffer.writeUInt32BE(1000,16); buffer.writeUInt32BE(3136,20); buffer.write('IEND',49,'ascii'); return buffer;
}
test('PNG validation rejects wrong dimensions, incomplete files and disguised video', () => {
  assert.equal(validStripPng(fixture()), true);
  assert.equal(validStripPng(Buffer.from('not an image')), false);
  const wrong = fixture(); wrong.writeUInt32BE(1280,16); assert.equal(validStripPng(wrong), false);
  assert.equal(validStripPng(fixture().subarray(0,35)), false);
});
