// Puts each product photo inside the brand frame and prints the ERP code on it.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const frameFile = () => process.env.FRAME_FILE ? path.resolve(process.env.FRAME_FILE) : path.join(__dirname, '..', 'assets', 'frame.png');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function frameImage(buf, code) {
  const N = +process.env.FRAME_SIZE || 1080;
  const inset = Math.round(N * (+process.env.FRAME_INSET || 0.12));
  const inner = N - inset * 2;

  const photo = await sharp(buf).rotate().resize(inner, inner, { fit: 'contain', background: '#ffffff' }).toBuffer();
  const layers = [{ input: photo, left: inset, top: inset }];

  if (fs.existsSync(frameFile())) layers.push({ input: await sharp(frameFile()).resize(N, N, { fit: 'fill' }).toBuffer() });

  if (code) {
    const x = Math.round(N * (+process.env.CODE_X || 0.5)), y = Math.round(N * (+process.env.CODE_Y || 0.955));
    const svg = `<svg width="${N}" height="${N}" xmlns="http://www.w3.org/2000/svg"><text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, Tahoma, sans-serif" font-weight="700" font-size="${+process.env.CODE_SIZE || 44}" fill="${esc(process.env.CODE_COLOR || '#111')}">${esc(code)}</text></svg>`;
    layers.push({ input: Buffer.from(svg) });
  }
  return sharp({ create: { width: N, height: N, channels: 3, background: '#ffffff' } })
    .composite(layers).jpeg({ quality: 90 }).toBuffer();
}

module.exports = { frameImage };
