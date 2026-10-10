// تحسين خلفية صورة المنتج بالذكاء الاصطناعي (Gemini image editing) — اختياري، المنتج نفسه ما بيتغيرش، الخلفية بس.
const sharp = require('sharp');
const { post } = require('./describe');

const configured = () => !!process.env.GEMINI_API_KEY;
const PROMPT = 'Edit this product photo for an online shop. Keep the product EXACTLY as it is: same shape, colors, materials, details, text, logos, proportions and position in the frame. ' +
  'Only replace the cluttered background with a clean, softly lit, neutral light-grey studio background, and add a subtle natural contact shadow under the product. ' +
  'Do not crop, do not zoom, do not add text, watermarks, props, people or hands. Keep the same aspect ratio.';

async function enhance(buf) {
  if (!configured()) throw new Error('مفيش مفتاح Gemini (GEMINI_API_KEY)');
  const small = await sharp(buf).rotate().resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const { width: w, height: h } = await sharp(small).metadata();
  const body = JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: small.toString('base64') } }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } });
  const models = [...new Set([process.env.GEMINI_IMAGE_MODEL, 'gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'].filter(Boolean))];
  let err = 'ما رجعتش صورة';
  for (const m of models) {
    const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, body, 120e3);
    if (r.status !== 200) { err = (r.json.error && r.json.error.message) || ('HTTP ' + r.status); if ([404, 400, 429, 503].includes(r.status)) continue; throw new Error(err); }
    const part = ((r.json.candidates || [])[0] || { content: { parts: [] } }).content.parts.find(p => (p.inlineData || p.inline_data));
    if (!part) { err = 'الموديل ماردّش بصورة'; continue; }
    const out = await sharp(Buffer.from((part.inlineData || part.inline_data).data, 'base64')).jpeg({ quality: 92 }).toBuffer();
    const o = await sharp(out).metadata();
    // لو الذكاء الاصطناعي قصّ الصورة أو غيّر نسبتها بنرفضها، عشان المنتج مايتشوّهش
    if (Math.abs(o.width / o.height - w / h) / (w / h) > 0.12) { err = 'الموديل غيّر أبعاد الصورة'; continue; }
    return out;
  }
  throw new Error(err);
}

module.exports = { enhance, configured };
