import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(root, 'assets', 'fonts');
await mkdir(fontDir, { recursive: true });
const files = [
  ['dm-sans-400.ttf', 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhTg.ttf'],
  ['dm-sans-500.ttf', 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAkJxhTg.ttf'],
  ['dm-sans-600.ttf', 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAfJthTg.ttf'],
  ['dm-sans-700.ttf', 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf'],
  ['pixelify-400.ttf', 'https://fonts.gstatic.com/s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TTp0H1Y.ttf'],
  ['pixelify-500.ttf', 'https://fonts.gstatic.com/s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TTb0H1Y.ttf'],
  ['pixelify-600.ttf', 'https://fonts.gstatic.com/s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TQ3131Y.ttf'],
  ['pixelify-700.ttf', 'https://fonts.gstatic.com/s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TQO131Y.ttf'],
  ['DM-Sans-OFL.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt'],
  ['Pixelify-Sans-OFL.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/pixelifysans/OFL.txt']
];
await Promise.all(files.map(async ([name, url]) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  await writeFile(path.join(fontDir, name), new Uint8Array(await response.arrayBuffer())); console.log(`Ready: ${name}`);
}));
