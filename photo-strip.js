import { containFit, PICK_COUNT } from './photo-session.js';
export const STRIP = Object.freeze({ width: 1000, height: 3136 });
export const SIGNATURE_PHRASE = "We don't Code, We Build";
export const FRAME_DESIGNS = Object.freeze([
  Object.freeze({ id: 'diary', name: 'Design 1', margin: 66, header: 150, gap: 40, paper: '#faf7f0', ink: '#66608c', accent: '#f1a1db', mint: '#98e7ad' }),
  Object.freeze({ id: 'terminal', name: 'Design 2', margin: 64, header: 174, gap: 36, paper: '#292837', ink: '#e6e1fa', accent: '#bcb4ef', mint: '#98e7ad' }),
  Object.freeze({ id: 'pop', name: 'Design 3', margin: 84, header: 166, gap: 50, paper: '#d4efd9', ink: '#494465', accent: '#ef9cce', mint: '#8cdda3' })
]);
export const DEFAULT_FRAME = FRAME_DESIGNS[0].id;
export function frameDesign(id = DEFAULT_FRAME) { return FRAME_DESIGNS.find(design => design.id === id) || FRAME_DESIGNS[0]; }
export function frameLayout(id = DEFAULT_FRAME) {
  const design = frameDesign(id), photoWidth = STRIP.width - design.margin * 2, photoHeight = photoWidth * 3 / 4;
  return { ...design, ...STRIP, photoWidth, photoHeight, footer: STRIP.height - design.header - PICK_COUNT * photoHeight - (PICK_COUNT - 1) * design.gap };
}
export function photoSlot(index, design = DEFAULT_FRAME) {
  if (!Number.isInteger(index) || index < 0 || index >= PICK_COUNT) throw new Error('Invalid strip slot');
  const layout = frameLayout(design);
  return { x: layout.margin, y: layout.header + index * (layout.photoHeight + layout.gap), width: layout.photoWidth, height: layout.photoHeight };
}
function label(ctx, content, x, y, size, colour, align = 'left', pixel = true) {
  ctx.font = `500 ${size}px ${pixel ? '"Pixelify Sans", monospace' : '"DM Sans", sans-serif'}`;
  ctx.fillStyle = colour; ctx.textAlign = align; ctx.fillText(content, x, y);
}
function star(ctx, x, y, radius, colour, rotation = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.fillStyle = colour;
  for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.fillRect(-radius, -radius * .15, radius * 2, radius * .3); }
  ctx.restore();
}
function checker(ctx, x, y, cell, columns, rows, colour) {
  ctx.fillStyle = colour;
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) if ((row + col) % 2 === 0) ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
}
function tape(ctx, x, y, colour, angle) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = colour; ctx.fillRect(-67, -10, 134, 20);
  ctx.strokeStyle = '#ffffff65'; ctx.lineWidth = 1;
  for (let i = -57; i < 65; i += 13) { ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i + 5, 8); ctx.stroke(); }
  ctx.restore();
}
function cursor(ctx, x, y, scale, colour) {
  const pixels = ['1000000','1100000','1110000','1111000','1111100','1111110','1111000','1101100','1000110','0000110'];
  ctx.fillStyle = colour;
  pixels.forEach((row, r) => [...row].forEach((value, c) => { if (value === '1') ctx.fillRect(x + c * scale, y + r * scale, scale, scale); }));
}
function heart(ctx, x, y, size, colour) {
  const pixels = ['0110110','1111111','1111111','0111110','0011100','0001000'];
  ctx.fillStyle = colour;
  pixels.forEach((row, r) => [...row].forEach((value, c) => { if (value === '1') ctx.fillRect(x + c * size, y + r * size, size, size); }));
}
function sideLabel(ctx, text, x, y, colour) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2); label(ctx, text, 0, 0, 18, colour, 'center'); ctx.restore();
}
function background(ctx, layout) {
  ctx.fillStyle = layout.paper; ctx.fillRect(0, 0, layout.width, layout.height);
  if (layout.id === 'diary') {
    ctx.strokeStyle = '#aba3c632'; ctx.lineWidth = 1;
    for (let x = 0; x <= layout.width; x += 26) { ctx.beginPath(); ctx.moveTo(x, 112); ctx.lineTo(x, layout.height); ctx.stroke(); }
    for (let y = 112; y <= layout.height; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(layout.width, y); ctx.stroke(); }
  } else if (layout.id === 'terminal') {
    for (let i = 0; i < 100; i++) { ctx.fillStyle = i % 3 ? '#81799838' : '#98e7ad30'; ctx.fillRect(14, 188 + i * 28, 7, 7); ctx.fillRect(979, 188 + i * 28, 7, 7); }
  } else {
    checker(ctx, 0, 116, 20, 50, 2, '#97c9a266');
    ctx.fillStyle = '#7070a214';
    for (let y = 215; y < layout.height - layout.footer; y += 30) { ctx.fillRect(24, y, 4, 4); ctx.fillRect(972, y, 4, 4); }
  }
}
function header(ctx, layout, logos) {
  // A shared cream masthead keeps the original dark Nottingham wordmark legible.
  // No individual white boxes or recolouring of either supplied logo.
  ctx.fillStyle = '#faf7f0'; ctx.fillRect(0, 0, layout.width, 112);
  if (logos.nottingham?.naturalWidth) ctx.drawImage(logos.nottingham, 43 - 204 * .1, 20 - 78.4 * .1, 204 * 1.2, 78.4 * 1.2);
  else label(ctx, 'UNIVERSITY OF NOTTINGHAM', 48, 65, 18, '#303044');
  label(ctx, 'CSS PHOTO CLUB', 546, 58, 25, '#66608c', 'center');
  label(ctx, 'FOUR GOOD MOMENTS / FOUR-CUT', 546, 83, 13, '#8c829f', 'center', false);
  if (logos.css?.naturalWidth) ctx.drawImage(logos.css, 150, 190, 440, 430, layout.width - 133 - 94 * .1, 12 - 92 * .1, 94 * 1.2, 92 * 1.2);
  if (layout.id === 'terminal') {
    label(ctx, 'FILE   VIEW   MEMORIES', 64, 139, 17, '#bcb4ef');
    label(ctx, '● CAMERA_ROLL / 4', 930, 139, 17, '#98e7ad', 'right');
  }
}
function slotDecorations(ctx, slot, index, layout) {
  const number = String(index + 1).padStart(2, '0');
  if (layout.id === 'diary') {
    ctx.strokeStyle = '#9b91b9'; ctx.lineWidth = 2; ctx.strokeRect(slot.x - 5, slot.y - 5, slot.width + 10, slot.height + 10);
    tape(ctx, 500, slot.y - 19, index % 2 ? '#f1a1dbb8' : '#c2c1efc8', index % 2 ? -.04 : .04);
    label(ctx, number, 33, slot.y + 33, 20, layout.ink, 'center');
    star(ctx, 34, slot.y + slot.height - 55, 21, index % 2 ? '#aaa1d5' : '#e897cd', .15);
    heart(ctx, 942, slot.y + 55, 5, '#b3a9d0');
    sideLabel(ctx, index % 2 ? 'A LITTLE BIT OF US' : 'WE WERE HERE / CSS', 966, slot.y + slot.height / 2, '#9185a7');
  } else if (layout.id === 'terminal') {
    ctx.strokeStyle = '#bcb4ef'; ctx.lineWidth = 3; ctx.strokeRect(slot.x - 4, slot.y - 4, slot.width + 8, slot.height + 8);
    ctx.fillStyle = '#bcb4ef'; ctx.fillRect(slot.x - 4, slot.y - 25, slot.width + 8, 21);
    label(ctx, `${number} / keep_this_one.png`, slot.x + 9, slot.y - 9, 16, '#292837');
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#f1a1db','#98e7ad','#faf7f0'][i]; ctx.fillRect(slot.x + slot.width - 62 + i * 18, slot.y - 20, 11, 11); }
    label(ctx, number, 33, slot.y + 42, 23, '#98e7ad', 'center');
    sideLabel(ctx, 'CSS / PEOPLE > PIXELS', 960, slot.y + slot.height / 2, '#b0a7cc');
    cursor(ctx, 28, slot.y + slot.height - 55, 3, index % 2 ? '#f1a1db' : '#98e7ad');
  } else {
    ctx.strokeStyle = '#66608c'; ctx.lineWidth = 3; ctx.strokeRect(slot.x - 6, slot.y - 6, slot.width + 12, slot.height + 12);
    ctx.fillStyle = '#66608c'; ctx.fillRect(18, slot.y + 8, 47, 39); label(ctx, number, 41, slot.y + 36, 25, '#faf7f0', 'center');
    star(ctx, 41, slot.y + slot.height - 55, 32, '#e78dc2', -.12);
    checker(ctx, 946, slot.y + 18, 10, 4, 4, '#66608c');
    sideLabel(ctx, index % 2 ? 'YOUR PEOPLE. YOUR PLACE.' : 'GOOD TIMES / GREAT COMPANY', 968, slot.y + slot.height / 2, '#66608c');
    if (index < 3) {
      const y = slot.y + slot.height + layout.gap / 2;
      star(ctx, 500, y, 17, '#66608c', .2);
      ctx.strokeStyle = '#7ebc8a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(95, y); ctx.lineTo(430, y); ctx.moveTo(570, y); ctx.lineTo(905, y); ctx.stroke();
    }
  }
}
function footer(ctx, layout, date, demo) {
  const top = layout.height - layout.footer, dateLabel = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const stamp = `${dateLabel} / ${demo ? 'DEMO · ' : ''}CSS FOUR-CUT`;
  if (layout.id === 'diary') {
    ctx.fillStyle = '#c2bde1'; ctx.fillRect(0, top, layout.width, layout.footer);
    star(ctx, 98, top + 97, 57, '#f5a5d7', .18); heart(ctx, 872, top + 118, 9, '#faf7f0');
    tape(ctx, 783, top + 35, '#98e7adbb', -.1);
    label(ctx, 'COMPUTER SCIENCE', 500, top + 79, 45, '#514b72', 'center');
    label(ctx, 'SOCIETY', 500, top + 124, 45, '#514b72', 'center');
    label(ctx, SIGNATURE_PHRASE.toUpperCase(), 500, top + 172, 22, '#514b72', 'center');
    label(ctx, stamp, 500, top + 222, 16, '#625778', 'center', false);
    label(ctx, 'made of people, not pixels.', 500, top + 247, 16, '#625778', 'center', false);
  } else if (layout.id === 'terminal') {
    ctx.strokeStyle = '#bcb4ef'; ctx.lineWidth = 2; ctx.strokeRect(64, top + 20, 872, layout.footer - 40);
    cursor(ctx, 90, top + 62, 8, '#98e7ad'); checker(ctx, 852, top + 52, 12, 4, 4, '#f1a1db');
    label(ctx, 'COMPUTER SCIENCE', 500, top + 72, 42, '#eee8ff', 'center');
    label(ctx, 'SOCIETY', 500, top + 116, 42, '#eee8ff', 'center');
    label(ctx, `> ${SIGNATURE_PHRASE.toUpperCase()}_`, 500, top + 161, 22, '#98e7ad', 'center');
    label(ctx, stamp, 500, top + 197, 15, '#bcb4ef', 'center', false);
  } else {
    ctx.fillStyle = '#ef9cce'; ctx.fillRect(0, top, layout.width, layout.footer);
    checker(ctx, 0, top, 20, 50, 2, '#66608c');
    star(ctx, 113, top + 128, 73, '#d4efd9', -.1); star(ctx, 882, top + 201, 69, '#66608c', .25);
    label(ctx, 'COMPUTER SCIENCE', 500, top + 109, 44, '#494465', 'center');
    label(ctx, 'SOCIETY', 500, top + 153, 44, '#494465', 'center');
    label(ctx, SIGNATURE_PHRASE.toUpperCase(), 500, top + 207, 24, '#494465', 'center');
    label(ctx, 'GOOD PEOPLE. GOOD MEMORIES.', 500, top + 250, 20, '#494465', 'center');
    label(ctx, stamp, 500, top + 292, 16, '#494465', 'center', false);
  }
}
export function drawStrip(ctx, photos, { logos = {}, date = new Date(), demo = false, design = DEFAULT_FRAME } = {}) {
  const layout = frameLayout(design);
  ctx.save(); background(ctx, layout); header(ctx, layout, logos);
  for (let index = 0; index < PICK_COUNT; index++) {
    const slot = photoSlot(index, layout.id), photo = photos[index];
    ctx.fillStyle = layout.id === 'terminal' ? '#464154' : '#e3ddea'; ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
    if (photo) {
      const fit = containFit(photo.naturalWidth || photo.width, photo.naturalHeight || photo.height, slot.width, slot.height);
      ctx.fillStyle = '#303044'; ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
      ctx.drawImage(photo, slot.x + fit.x, slot.y + fit.y, fit.width, fit.height);
    } else {
      label(ctx, String(index + 1).padStart(2, '0'), 500, slot.y + slot.height / 2 + 45, 150, layout.id === 'terminal' ? '#9990b2' : '#b5abc8', 'center');
      label(ctx, 'YOUR FAVOURITE GOES HERE', 500, slot.y + slot.height / 2 + 95, 21, layout.id === 'terminal' ? '#bcb4ef' : '#8b7d9e', 'center');
    }
    slotDecorations(ctx, slot, index, layout);
  }
  footer(ctx, layout, date, demo); ctx.restore();
}
