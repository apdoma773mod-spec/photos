// Turns the finished Mekanezm design (photo + branding) into a reusable frame:
// the photo window becomes transparent, the corner ribbon that overlaps it stays.
// Usage: node assets/frames/build-mekanezm.js [source.png]   ->  assets/frame.png + assets/frame.json
const sharp = require('sharp'), fs = require('fs'), path = require('path');
const SRC = process.argv[2] || path.join(__dirname, 'mekanezm-sample.png');
const OUT = path.join(__dirname, '..', 'frame.png');
const WIN = { x: 64, y: 186, w: 1320, h: 809, r: 26 };      // measured on the 1448x1086 design
const RIBBON = { nx: 205, ny: 197.5, c: 468700 };           // bottom-right ribbon: keep pixels where nx*x+ny*y >= c

(async () => {
  const { width: W, height: H } = await sharp(SRC).metadata();
  const yAtRight = (RIBBON.c - RIBBON.nx * W) / RIBBON.ny, xAtBottom = (RIBBON.c - RIBBON.ny * H) / RIBBON.nx;
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="c"><polygon points="0,0 ${W},0 ${W},${yAtRight} ${xAtBottom},${H} 0,${H}"/></clipPath></defs>
    <rect clip-path="url(#c)" x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="${WIN.r}" fill="#fff"/></svg>`;
  await sharp(SRC).ensureAlpha().composite([{ input: Buffer.from(mask), blend: 'dest-out' }]).png().toFile(OUT);
  fs.writeFileSync(OUT.replace(/\.png$/, '.json'), JSON.stringify({
    window: { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h }, fit: 'cover',
    code: { x: 215, y: 1056, size: 40, color: '#9a6a00', anchor: 'middle' }
  }, null, 2));
  console.log('frame ready', W + 'x' + H);
})();
