export const PHOTO_COUNT = 8;
export const PICK_COUNT = 4;
export const POSE_MS = 3000;
export function containFit(sourceWidth, sourceHeight, width, height) {
  if (![sourceWidth, sourceHeight, width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid photo dimensions');
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return { x: (width - sourceWidth * scale) / 2, y: (height - sourceHeight * scale) / 2, width: sourceWidth * scale, height: sourceHeight * scale };
}
export class PhotoSession {
  constructor() { this.reset(); }
  reset() { this.phase = 'ready'; this.step = 1; this.photos = []; this.selected = []; this.date = new Date(); }
  start() { this.reset(); this.phase = 'capturing'; }
  capture(photo) {
    if (this.phase !== 'capturing' || !photo) return false;
    this.photos.push(photo);
    this.phase = this.photos.length === PHOTO_COUNT ? 'choosing' : 'between';
    if (this.phase === 'choosing') this.step = 2;
    return true;
  }
  resume() { if (this.phase === 'between') this.phase = 'capturing'; }
  navigate(step) {
    if (!Number.isInteger(step) || step < 1 || step > 4) return false;
    this.step = step;
    this.phase = step === 1 ? (this.photos.length > 0 && this.photos.length < PHOTO_COUNT ? 'paused' : 'ready') : step === 2 ? 'choosing' : 'preview';
    return true;
  }
  continueCapture() {
    if (this.phase !== 'paused' || this.step !== 1) return false;
    this.phase = 'capturing'; return true;
  }
  beginBuild() {
    if (this.phase !== 'preview' || !this.complete) return false;
    this.phase = 'building'; return true;
  }
  finishBuild(success = true) {
    if (this.phase !== 'building') return false;
    this.phase = 'preview'; return true;
  }
  toggle(index) {
    if (this.phase !== 'choosing' || !Number.isInteger(index) || index < 0 || index >= this.photos.length) return false;
    const position = this.selected.indexOf(index);
    if (position >= 0) { this.selected.splice(position, 1); return true; }
    if (this.selected.length === PICK_COUNT) return false;
    this.selected.push(index); return true;
  }
  get complete() { return this.selected.length === PICK_COUNT; }
  get chosen() { return this.selected.map(index => this.photos[index]); }
}
