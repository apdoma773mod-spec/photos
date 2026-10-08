// Renders each candidate frame with a sample product so you can compare them side by side.
const sharp = require('sharp'), path = require('path');
const { frameImage } = require('../../src/frame');
const CODE = { 'gold-classic': '#8a6a1f', 'navy-modern': '#14213d', 'soft-beige': '#ffffff' };
(async () => {
  // placeholder product: a bag-like shape on a light background
  const prod = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#f1f1f1"/>
   <path d="M330 330C330 150 570 150 570 330" fill="none" stroke="#6b3e26" stroke-width="26"/>
   <rect x="170" y="310" width="560" height="440" rx="48" fill="#8b5a3c"/><rect x="170" y="310" width="560" height="120" rx="48" fill="#a0694a"/>
   <circle cx="450" cy="470" r="30" fill="#d4af37"/></svg>`);
  const outs = [];
  for (const k of Object.keys(CODE)) {
    process.env.FRAME_FILE = path.join(__dirname, k + '.png'); process.env.CODE_COLOR = CODE[k];
    process.env.CODE_Y = '0.955'; // vertically centred on the plaque
    const b = await frameImage(await sharp(prod).jpeg().toBuffer(), 'MK-1024');
    await sharp(b).toFile(path.join(__dirname, 'preview-' + k + '.jpg')); outs.push(b);
  }
  const sheet = await sharp({ create: { width: 1100 * 3, height: 1080, channels: 3, background: '#ddd' } })
    .composite(outs.map((b, i) => ({ input: b, left: i * 1100, top: 0 }))).jpeg({ quality: 90 }).toBuffer();
  await sharp(sheet).resize(1800).jpeg({ quality: 88 }).toFile(path.join(__dirname, 'preview-all.jpg'));
})();
