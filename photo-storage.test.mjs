import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveStrip, validStripPng } from './photo-storage.js';
import { createBoothServer } from './server.mjs';
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
test('archive creates unique files and refuses invalid strips', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'css-strip-test-'));
  try {
    const one = await saveStrip(fixture(),directory), two = await saveStrip(fixture(),directory);
    assert.notEqual(one,two); assert.ok(one.endsWith('.png')); assert.deepEqual(await readFile(path.join(directory,one)), fixture());
    await assert.rejects(saveStrip(Buffer.from('bad'),directory)); assert.equal((await readdir(directory)).length,2);
  } finally { if(path.dirname(directory)===path.resolve(tmpdir())&&path.basename(directory).startsWith('css-strip-test-')) await rm(directory,{recursive:true,force:true}); }
});
test('local API saves PNG, rejects cross-origin writes and protects old backups', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'css-strip-server-test-'));
  const server = createBoothServer(directory);
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const saved = await fetch(base+'/api/strips',{method:'POST',headers:{'Content-Type':'image/png'},body:fixture()});
    assert.equal(saved.status,201); assert.deepEqual(await saved.json(), { saved: true });
    const archive = path.join(directory, 'cssbooth', 'picture');
    const [filename] = await readdir(archive);
    assert.deepEqual(await readFile(path.join(archive, filename)), fixture());
    assert.equal((await fetch(base+'/api/strips',{method:'POST',headers:{'Content-Type':'video/webm'},body:'video'})).status,415);
    assert.equal((await fetch(base+'/api/strips',{method:'POST',headers:{'Content-Type':'image/png',Origin:'https://example.com'},body:fixture()})).status,403);
    assert.equal((await fetch(base+'/api/strips',{method:'POST',headers:{'Content-Type':'image/png'},body:'bad'})).status,400);
    assert.equal((await fetch(base+'/.legacy-signing-backup/app.js')).status,403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if(path.dirname(directory)===path.resolve(tmpdir())&&path.basename(directory).startsWith('css-strip-server-test-')) await rm(directory,{recursive:true,force:true});
  }
});
