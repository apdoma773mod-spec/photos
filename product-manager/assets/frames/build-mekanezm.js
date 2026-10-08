// Rebuilds a SLIM Mekanezm frame from the finished design (assets/frames/mekanezm-sample.png):
// logo / slogan / corner ribbons are cut out of it and re-laid-out around a much bigger photo window.
// Usage: node assets/frames/build-mekanezm.js   ->  assets/frame.png + assets/frame.json
const sharp = require('sharp'), fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'mekanezm-sample.png');
const OUT = path.join(__dirname, '..', 'frame.png');

const W = 1448, MARGIN = 34, TOP = 124, WIN_W = W - 2 * MARGIN, WIN_H = Math.round(WIN_W * 3 / 4), FOOT = 86;
const H = TOP + WIN_H + FOOT, WIN = { x: MARGIN, y: TOP, w: WIN_W, h: WIN_H, r: 26 };
const crop = (box, k, mask) => async () => {
  let s = sharp(SRC).extract(box).ensureAlpha();
  if (mask) s = s.composite([{ input: Buffer.from(mask), blend: 'dest-in' }]);
  const b = await s.png().toBuffer();
  return sharp(b).resize(Math.round(box.width * k)).png().toBuffer();
};
// polygon masks in the source crop's own coordinates
const poly = (w, h, pts) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="${pts}" fill="#fff"/></svg>`;

(async () => {
  // top-left ribbon: sample pixels with x+y <= 206 ; bottom-right ribbon: 205x+197.5y >= 468700
  const tl = await crop({ left: 0, top: 0, width: 230, height: 230 }, .72, poly(230, 230, '0,0 206,0 0,206'))();
  const BRX = 1198, BRY = 836, BRW = 250, BRH = 250, c = 468700, nx = 205, ny = 197.5;
  const pts = [[BRW, (c - nx * (BRX + BRW)) / ny - BRY], [(c - ny * (BRY + BRH)) / nx - BRX, BRH], [BRW, BRH]].map(p => p.join(',')).join(' ');
  const brK = .8, br = await crop({ left: BRX, top: BRY, width: BRW, height: BRH }, brK, poly(BRW, BRH, pts))();
  const logoK = .68, logo = await crop({ left: 540, top: 18, width: 360, height: 148 }, logoK)();
  const slogan = await crop({ left: 370, top: 1022, width: 710, height: 50 }, .85)();
  const lm = await sharp(logo).metadata(), sm = await sharp(slogan).metadata(), bm = await sharp(br).metadata();

  const rx = WIN.x + WIN.w + 3, by = WIN.y + WIN.h + 3, g = 4, sw = 8;   // gold ring sits 3px outside the window
  const ring = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7c948"/><stop offset=".5" stop-color="#d98a00"/><stop offset="1" stop-color="#f5b50a"/></linearGradient></defs>
    <rect x="${WIN.x - 3 - g}" y="${WIN.y - 3 - g}" width="${rx - WIN.x + 6 + 2 * g - 3}" height="${by - WIN.y + 6 + 2 * g - 3}" rx="34" fill="none" stroke="url(#g)" stroke-width="${sw}"/></svg>`;
  const hole = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="${WIN.r}" fill="#fff"/></svg>`;

  const base = await sharp({ create: { width: W, height: H, channels: 4, background: '#ffffff' } }).composite([
    { input: Buffer.from(ring) }, { input: tl, left: 0, top: 0 },
    { input: logo, left: Math.round((W - lm.width) / 2), top: Math.round((TOP - lm.height) / 2) },
    { input: slogan, left: Math.round((W - sm.width) / 2), top: WIN.y + WIN.h + 3 + Math.round((FOOT - 3 - sm.height) / 2) }
  ]).png().toBuffer();
  const holed = await sharp(base).composite([{ input: Buffer.from(hole), blend: 'dest-out' }]).png().toBuffer();
  await sharp(holed).composite([{ input: br, left: W - bm.width, top: H - bm.height }]).png().toFile(OUT);

  fs.writeFileSync(OUT.replace(/\.png$/, '.json'), JSON.stringify({
    window: { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h }, fit: 'cover',
    code: { x: 215, y: H - 30, size: 34, color: '#9a6a00', anchor: 'middle' }
  }, null, 2));
  console.log('frame ready', W + 'x' + H, 'window', WIN.w + 'x' + WIN.h);
})();
