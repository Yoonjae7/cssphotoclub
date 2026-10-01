import { STRIP } from './photo-strip.js';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function validStripPng(buffer) {
  return buffer.length >= 57 && buffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
    buffer.toString('ascii', 12, 16) === 'IHDR' && buffer.readUInt32BE(8) === 13 &&
    buffer.readUInt32BE(16) === STRIP.width && buffer.readUInt32BE(20) === STRIP.height &&
    buffer.toString('ascii', buffer.length - 8, buffer.length - 4) === 'IEND';
}
