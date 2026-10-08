require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const erp = require('./erp');
const { frameImage } = require('./frame');
const { describe } = require('./describe');
const shopify = require('./shopify');

const DIR = path.join(__dirname, '..', 'data', 'drafts');
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25e6, files: 30 } });
app.use(express.json());

// --- simple password gate for /api -----------------------------------------
app.use('/api', (req, res, next) => {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return res.status(500).json({ error: 'APP_PASSWORD مش متظبط' });
  const given = Buffer.from(req.get('x-pass') || req.query.pass || '');
  const want = Buffer.from(pw);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'كلمة السر غلط' });
  next();
});

const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });
const dir = id => { if (!/^[a-f0-9]{12}$/.test(id)) throw new Error('bad id'); return path.join(DIR, id); };
const readMeta = async id => JSON.parse(await fs.readFile(path.join(dir(id), 'meta.json'), 'utf8'));
const writeMeta = (id, m) => fs.writeFile(path.join(dir(id), 'meta.json'), JSON.stringify(m, null, 1));

async function reframe(m) {
  for (let i = 0; i < m.count; i++) {
    if (m.removed.includes(i)) continue;
    const o = await fs.readFile(path.join(dir(m.id), `o${i}.jpg`));
    await fs.writeFile(path.join(dir(m.id), `f${i}.jpg`), await frameImage(o, m.code));
  }
}
const mismatch = m => !!(m.erpName && erp.norm(m.erpName) !== erp.norm(m.name));
const view = m => ({ ...m, mismatch: mismatch(m) });

// --- create a draft: images + name -> match code, frame, describe ----------
app.post('/api/drafts', upload.array('images', 30), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name || !req.files?.length) return res.status(400).json({ error: 'لازم اسم وصورة على الأقل' });
  const id = crypto.randomBytes(6).toString('hex');
  await fs.mkdir(dir(id), { recursive: true });

  const m = { id, name, code: String(req.body.code || '').trim(), erpName: '', candidates: [], description: '',
    count: req.files.length, removed: [], status: 'draft', created: new Date().toISOString(), warnings: [] };

  // 1) ERP match (skipped if the user typed the code)
  try {
    const r = await erp.findByName(name);
    m.candidates = r.candidates;
    if (!m.code && r.match) m.code = r.match.code;
    const hit = r.candidates.find(c => c.code === m.code);
    if (hit) m.erpName = hit.name;
    if (!m.code) m.warnings.push('مالقيتش كود مطابق في السيستم — اختار من المقترحات أو اكتبه');
  } catch (e) { m.warnings.push('السيستم: ' + e.message); }

  // 2) originals + framed
  for (let i = 0; i < req.files.length; i++) await fs.writeFile(path.join(dir(id), `o${i}.jpg`), req.files[i].buffer);
  await reframe(m);

  // 3) description from the first framed image
  try { m.description = await describe(name, await fs.readFile(path.join(dir(id), 'f0.jpg'))); }
  catch (e) { m.warnings.push('الوصف: ' + e.message); }

  await writeMeta(id, m);
  res.json(view(m));
}));

app.get('/api/drafts', wrap(async (req, res) => {
  await fs.mkdir(DIR, { recursive: true });
  const out = [];
  for (const id of await fs.readdir(DIR)) { try { out.push(view(await readMeta(id))); } catch {} }
  res.json(out.sort((a, b) => b.created.localeCompare(a.created)));
}));

app.get('/api/drafts/:id/img/:n', wrap(async (req, res) => {
  const n = +req.params.n;
  if (!Number.isInteger(n) || n < 0) return res.sendStatus(400);
  res.type('jpeg').send(await fs.readFile(path.join(dir(req.params.id), `f${n}.jpg`)));
}));

app.patch('/api/drafts/:id', wrap(async (req, res) => {
  const m = await readMeta(req.params.id);
  if (m.status === 'published') return res.status(409).json({ error: 'المنتج اترفع خلاص' });
  const b = req.body || {};
  let re = false;
  if (typeof b.name === 'string' && b.name.trim()) m.name = b.name.trim();
  if (typeof b.description === 'string') m.description = b.description;
  if (typeof b.code === 'string' && b.code.trim() !== m.code) {
    m.code = b.code.trim(); re = true;
    const hit = m.candidates.find(c => c.code === m.code);
    m.erpName = hit ? hit.name : '';
  }
  if (Array.isArray(b.removed)) m.removed = [...new Set(b.removed.filter(Number.isInteger))];
  if (re) await reframe(m);
  await writeMeta(m.id, m);
  res.json(view(m));
}));

app.post('/api/drafts/:id/describe', wrap(async (req, res) => {
  const m = await readMeta(req.params.id);
  const first = [...Array(m.count).keys()].find(i => !m.removed.includes(i)) ?? 0;
  m.description = await describe(m.name, await fs.readFile(path.join(dir(m.id), `f${first}.jpg`)));
  await writeMeta(m.id, m);
  res.json(view(m));
}));

// --- publish: Shopify first, then sync the ERP name -------------------------
app.post('/api/drafts/:id/publish', wrap(async (req, res) => {
  const m = await readMeta(req.params.id);
  if (m.status === 'published') return res.status(409).json({ error: 'اترفع قبل كده' });
  if (!m.code) return res.status(400).json({ error: 'مفيش كود للمنتج' });
  const imgs = [];
  for (let i = 0; i < m.count; i++) if (!m.removed.includes(i)) imgs.push(await fs.readFile(path.join(dir(m.id), `f${i}.jpg`)));
  if (!imgs.length) return res.status(400).json({ error: 'مفيش صور' });

  const r = await shopify.createProduct({ title: m.name, description: m.description, code: m.code, images: imgs });
  m.status = 'published'; m.shopify = r; m.warnings = [];
  if (req.body?.syncName !== false && mismatch(m)) {
    try { await erp.rename(m.code, m.name); m.erpName = m.name; }
    catch (e) { m.warnings.push('اترفع على Shopify بس تغيير الاسم في السيستم فشل: ' + e.message); }
  }
  await writeMeta(m.id, m);
  res.json(view(m));
}));

app.delete('/api/drafts/:id', wrap(async (req, res) => {
  await fs.rm(dir(req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
}));

app.use(express.static(path.join(__dirname, '..', 'public')));
const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log('http://localhost:' + port));
module.exports = app;
