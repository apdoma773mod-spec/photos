// Puts each product photo inside the brand frame (assets/frame.png + frame.json) and prints the ERP code on it.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const frameFile = () => process.env.FRAME_FILE ? path.resolve(process.env.FRAME_FILE) : path.join(__dirname, '..', 'assets', 'frame.png');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function frameImage(buf, code) {
  const file = frameFile();
  if (!fs.existsSync(file)) throw new Error('الفريم مش موجود: ' + file);
  const cfg = JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.json'), 'utf8'));
  const { width: W, height: H } = await sharp(file).metadata();
  const { x, y, w, h } = cfg.window;

  // the photo goes UNDER the frame, so the frame's rounded corners / ribbon stay on top
  const photo = await sharp(buf).rotate().resize(w, h, { fit: cfg.fit || 'cover', position: 'attention', background: '#ffffff' }).toBuffer();
  const layers = [{ input: photo, left: x, top: y }, { input: file }];

  if (code && cfg.code) {
    const c = cfg.code;
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><text x="${c.x}" y="${c.y}" text-anchor="${c.anchor || 'middle'}" font-family="Arial, Tahoma, sans-serif" font-weight="700" font-size="${c.size}" fill="${esc(c.color)}">${esc(code)}</text></svg>`;
    layers.push({ input: Buffer.from(svg) });
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite(layers).jpeg({ quality: 90 }).toBuffer();
}

module.exports = { frameImage };
