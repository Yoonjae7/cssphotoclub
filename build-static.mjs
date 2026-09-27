import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const STATIC_FILES = Object.freeze([
  'index.html', 'styles.css', 'app.js', 'photo-session.js', 'photo-strip.js', 'photo-archive.js',
  'assets/css-logo.png', 'assets/nottingham-logo.png', 'assets/favicon.svg',
  'assets/fonts/DM-Sans-OFL.txt', 'assets/fonts/Pixelify-Sans-OFL.txt',
  ...['dm-sans', 'pixelify'].flatMap(font => [400, 500, 600, 700].map(weight => `assets/fonts/${font}-${weight}.ttf`))
]);

async function checkOutput(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Refusing a symlink in static output: ${relative}`);
    if (entry.isDirectory() && STATIC_FILES.some(file => file.startsWith(relative + '/'))) {
      await checkOutput(path.join(directory, entry.name), relative + '/');
    } else if (!entry.isFile() || !STATIC_FILES.includes(relative)) {
      throw new Error(`Unexpected static output file: ${relative}. Use an empty output directory.`);
    }
  }
}

export async function buildStaticSite(output = path.join(root, 'dist')) {
  await mkdir(output, { recursive: true });
  // Publish only browser assets, never booth photos, backups, server code or tests.
  // Refuse unexpected existing files rather than deleting user data or publishing it.
  await checkOutput(output);
  for (const relative of STATIC_FILES) {
    const destination = path.join(output, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, relative), destination);
  }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildStaticSite();
  console.log(`Built ${STATIC_FILES.length} browser assets in dist/ — no server functions or photo uploads.`);
}
