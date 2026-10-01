import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { buildStaticSite, STATIC_FILES } from './build-static.mjs';

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

test('Vercel publishes browser files and deploys the sharing function', async () => {
  const config = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, 'node build-static.mjs');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.builds, undefined);
  assert.equal(config.functions['api/share.js'].maxDuration, 60);
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

test('PNG export uses browser folder permission without requiring a laptop server', async () => {
  const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const body = source.match(/async function archiveStrip\(blob, generation\) \{([\s\S]*?)\n\}\nfunction archiveFilename/)[1];
  const invoke = new Function('saveToArchive', 'archiveFilename', 'state', '$', `return async (blob, generation) => {${body}}`);
  const blob = {}, status = { textContent: '' }; let requests = 0;
  const archive = invoke(async (directory, savedBlob, filename) => {
    requests++;
    assert.equal(directory, 'photo'); assert.equal(savedBlob, blob); assert.equal(filename, 'saved.png'); return true;
  }, () => 'saved.png', { generation: 1, resultBlob: blob }, () => status);
  await archive(blob, 1);
  assert.equal(requests, 1);
  assert.match(status.textContent, /Photo saved in cssbooth\/photo/);
  assert.match(source, /link.download = `css-four-cut-/);
  assert.doesNotMatch(source, /boothApi|BOOTH_SITE_ORIGIN|127\.0\.0\.1|targetAddressSpace/);
});
