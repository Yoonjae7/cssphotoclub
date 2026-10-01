let archive = null;
const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('cssbooth-folder', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('settings');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function storedHandle(value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', value ? 'readwrite' : 'readonly');
      const request = value ? transaction.objectStore('settings').put(value, 'directory') : transaction.objectStore('settings').get('directory');
      request.onsuccess = () => { if (!value) resolve(request.result); };
      transaction.oncomplete = () => { if (value) resolve(value); };
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export const folderSavingSupported = () => typeof window.showDirectoryPicker === 'function';
export async function restoreArchive() {
  if (!folderSavingSupported()) return false;
  try { archive = await storedHandle(); return Boolean(archive && await archive.queryPermission({ mode: 'readwrite' }) === 'granted'); }
  catch { return false; }
}
export async function chooseArchive() {
  if (!folderSavingSupported()) throw new Error('Folder saving needs Chrome or Edge. You can still download both files.');
  if (!archive || await archive.requestPermission({ mode: 'readwrite' }) !== 'granted') {
    const selected = await window.showDirectoryPicker({ id: 'cssbooth', startIn: 'downloads', mode: 'readwrite' });
    archive = selected.name === 'cssbooth' ? selected : await selected.getDirectoryHandle('cssbooth', { create: true });
  }
  await archive.getDirectoryHandle('photo', { create: true });
  await archive.getDirectoryHandle('video', { create: true });
  await storedHandle(archive).catch(() => {});
  return true;
}
export async function saveToArchive(kind, blob, filename) {
  if (!archive || await archive.queryPermission({ mode: 'readwrite' }) !== 'granted') return false;
  const directory = await archive.getDirectoryHandle(kind, { create: true });
  const file = await directory.getFileHandle(filename, { create: true });
  const writer = await file.createWritable();
  try { await writer.write(blob); await writer.close(); }
  catch (error) { await writer.abort().catch(() => {}); throw error; }
  return true;
}
