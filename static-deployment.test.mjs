import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { buildStaticSite, STATIC_FILES } from './build-static.mjs';
import { canArchiveLocally } from './photo-archive.js';

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative + '/'));
    else files.push(relative);
  }
  return files.sort();
}
async function temporaryOutput(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'css-static-test-'));
  try { await run(directory); }
  finally {
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('css-static-test-')) await rm(directory, { recursive: true, force: true });
  }
}

test('Vercel builds static browser files without a hosted sharing API', async () => {
  const config = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, 'node build-static.mjs');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.builds, undefined);
});

test('static build contains every browser dependency, no photos or server code', async () => {
  await temporaryOutput(async directory => {
    await buildStaticSite(directory);
    assert.deepEqual(await filesIn(directory), [...STATIC_FILES].sort());
    for (const file of STATIC_FILES) assert.deepEqual(await readFile(path.join(directory, file)), await readFile(new URL(file, import.meta.url)));
    const html = await readFile(path.join(directory, 'index.html'), 'utf8');
    for (const [, file] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) assert.ok(file === '/' || STATIC_FILES.includes(file), `Missing page resource: ${file}`);
    for (const file of STATIC_FILES.filter(file => file.endsWith('.js'))) {
      const source = await readFile(path.join(directory, file), 'utf8');
      for (const [, dependency] of source.matchAll(/from ['"]\.\/([^'"]+)['"]/g)) assert.ok(STATIC_FILES.includes(dependency), `Missing module: ${dependency}`);
    }
    assert.doesNotMatch((await filesIn(directory)).join('\n'), /server\.mjs|photo-storage|photo-strips|share-media|recordings|backup|\.test\./);
    await buildStaticSite(directory); // Repeated builds remain deterministic.
    assert.deepEqual(await filesIn(directory), [...STATIC_FILES].sort());
  });
});

test('static build refuses unexpected files without deleting them', async () => {
  await temporaryOutput(async directory => {
    await writeFile(path.join(directory, 'private-photo.png'), 'do not publish');
    await assert.rejects(buildStaticSite(directory), /Unexpected static output file/);
    assert.equal(await readFile(path.join(directory, 'private-photo.png'), 'utf8'), 'do not publish');
  });
});

test('hosted sites never archive photos; HTTP loopback booth keeps local saving', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(canArchiveLocally(new URL(`http://${host}:3000/`)), true);
  for (const address of ['https://cssphotoclub.vercel.app', 'https://localhost', 'http://example.com', 'https://127.0.0.1', 'http://localhost.example.com', 'http://192.168.1.10', 'file:///index.html']) assert.equal(canArchiveLocally(new URL(address)), false);
});

test('hosted PNG export asks the booth laptop to save a permanent picture', async () => {
  const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const body = source.match(/async function archiveStrip\(blob, generation\) \{([\s\S]*?)\n\}\nfunction drawQr/)[1];
  const invoke = new Function('boothApi', 'state', '$', 'fetch', `return async (blob, generation) => {${body}}`);
  const blob = {}, status = { textContent: '' }; let requests = 0;
  const archive = invoke(() => 'http://127.0.0.1:3000', { generation: 1, resultBlob: blob }, () => status, async (url, options) => {
    requests++;
    assert.equal(url, 'http://127.0.0.1:3000/api/strips');
    assert.equal(options.body, blob);
    return { ok: true, json: async () => ({ filename: 'saved.png' }) };
  });
  await archive(blob, 1);
  assert.equal(requests, 1);
  assert.match(status.textContent, /Saved in Downloads\/cssbooth\/photo/);
  assert.match(source, /link.download = `css-four-cut-/);
});
