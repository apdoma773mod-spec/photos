require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const erp = require('./erp');
const { frameImage } = require('./frame');
const { describe } = require('./describe');
const site = require('./site');
const wa = require('./whatsapp');

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

  const m = { id, name, code: String(req.body.code || '').trim(), sec: String(req.body.sec || ''), erpName: '', candidates: [], description: '',
    price: 0, wa: null, count: req.files.length, removed: [], status: 'draft', created: new Date().toISOString(), warnings: [] };

  // 1) ERP match (skipped if the user typed the code)
  try {
    const r = await erp.findByName(name);
    m.candidates = r.candidates;
    if (!m.code && r.match) m.code = r.match.code;
    const hit = r.candidates.find(c => c.code === m.code);
    if (hit) m.erpName = hit.name;
    if (!m.code) m.warnings.push('مالقيتش كود مطابق في السيستم — اختار من المقترحات أو اكتبه');
    else m.price = (hit && hit.price) || 0;
  } catch (e) { m.warnings.push('السيستم: ' + e.message); }

  // 2) originals + framed
  for (let i = 0; i < req.files.length; i++) await fs.writeFile(path.join(dir(id), `o${i}.jpg`), req.files[i].buffer);
  await reframe(m);

  // 3) description from the first framed image
  m.hint = String(req.body.hint || '').trim();
  const secNm = async sec => { try { return ((await site.sections()).find(s => s.id === sec) || {}).name || ''; } catch { return ''; } };
  try { m.description = await describe(name, await fs.readFile(path.join(dir(id), 'f0.jpg')), { hint: m.hint, sec: await secNm(m.sec) }); }
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
  if (typeof b.sec === 'string') m.sec = b.sec;
  if (b.price !== undefined && Number.isFinite(+b.price) && +b.price >= 0) m.price = +b.price;
  if (typeof b.code === 'string' && b.code.trim() !== m.code) {
    m.code = b.code.trim(); re = true;
    const hit = m.candidates.find(c => c.code === m.code);
    m.erpName = hit ? hit.name : '';
    if (hit && hit.price && b.price === undefined) m.price = hit.price;
  }
  if (Array.isArray(b.removed)) m.removed = [...new Set(b.removed.filter(Number.isInteger))];
  if (re) await reframe(m);
  await writeMeta(m.id, m);
  res.json(view(m));
}));

// product is not in the system yet: create it there (next numeric code) and re-frame the photos with that code
app.post('/api/drafts/:id/create-in-system', wrap(async (req, res) => {
  const m = await readMeta(req.params.id), b = req.body || {};
  if (m.status === 'published') return res.status(409).json({ error: 'اترفع خلاص' });
  if (m.code) return res.status(400).json({ error: 'المنتج ده عنده كود: ' + m.code });
  const code = await erp.nextCode(), cat = ((await site.sections()).find(s => s.id === m.sec) || {}).name || '';
  await erp.create({ code, name: m.name, cat, price: b.price, qty: b.qty, unit: b.unit, cost: b.cost });
  m.code = code; m.erpName = m.name; m.price = +b.price || 0;
  m.warnings = m.warnings.filter(w => !w.includes('مالقيتش كود'));
  await reframe(m); await writeMeta(m.id, m);
  res.json(view(m));
}));

app.post('/api/drafts/:id/describe', wrap(async (req, res) => {
  const m = await readMeta(req.params.id);
  const first = [...Array(m.count).keys()].find(i => !m.removed.includes(i)) ?? 0;
  const sec = await (async () => { try { return ((await site.sections()).find(s => s.id === m.sec) || {}).name || ''; } catch { return ''; } })();
  m.description = await describe(m.name, await fs.readFile(path.join(dir(m.id), `f${first}.jpg`)), { hint: m.hint || '', sec });
  await writeMeta(m.id, m);
  res.json(view(m));
}));

// --- publish: site first, then sync the ERP name -------------------------
app.post('/api/drafts/:id/publish', wrap(async (req, res) => {
  const m = await readMeta(req.params.id);
  if (m.status === 'published') return res.status(409).json({ error: 'اترفع قبل كده' });
  if (!m.code) return res.status(400).json({ error: 'مفيش كود للمنتج' });
  const imgs = [];
  for (let i = 0; i < m.count; i++) if (!m.removed.includes(i)) imgs.push(await fs.readFile(path.join(dir(m.id), `f${i}.jpg`)));
  if (!imgs.length) return res.status(400).json({ error: 'مفيش صور' });

  const r = await site.publish({ name: m.name, description: m.description, sec: m.sec, code: m.code, images: imgs });
  m.status = 'published'; m.published = new Date().toISOString(); m.site = r; m.warnings = [];
  if (req.body?.syncName !== false && mismatch(m)) {
    try { await erp.rename(m.code, m.name); m.erpName = m.name; m.synced = true; }
    catch (e) { m.warnings.push('اترفع على الموقع بس تغيير الاسم في السيستم فشل: ' + e.message); }
  }
  if (req.body?.catalog !== false) {          // WhatsApp catalog (never blocks the site publish)
    try {
      const w = await wa.upsert({ code: m.code, name: m.name, description: m.description, price: m.price, link: r.url, images: r.imgs });
      if (w.skipped) m.warnings.push('الواتساب: ' + w.skipped); else m.wa = { ok: true, at: new Date().toISOString() };
    } catch (e) { m.warnings.push('الواتساب: ' + e.message); }
  }
  await writeMeta(m.id, m);
  res.json(view(m));
}));

// --- instant code match while typing ---------------------------------------
app.get('/api/match', wrap(async (req, res) => {
  const name = String(req.query.name || '').trim();
  res.json(name ? await erp.findByName(name) : { match: null, candidates: [] });
}));

// --- 🎬 فيديو للسوشيال --------------------------------------------------------
const video = require('./video');
const VDIR = path.join(__dirname, '..', 'data', 'videos');
const vdir = id => { if (!/^[a-f0-9]{12}$/.test(id)) throw new Error('bad id'); return path.join(VDIR, id); };
const vupload = multer({ storage: multer.diskStorage({ destination: async (req, f, cb) => { await fs.mkdir(VDIR, { recursive: true }); cb(null, VDIR); },
  filename: (req, f, cb) => cb(null, 'up-' + crypto.randomBytes(6).toString('hex') + path.extname(f.originalname || '.mp4').toLowerCase()) }),
  limits: { fileSize: 600e6, files: 1 }, fileFilter: (req, f, cb) => cb(null, /^video\//.test(f.mimetype) || /\.(mp4|mov|m4v|3gp|webm|mkv|avi)$/i.test(f.originalname || '')) });
const vsave = m => fs.writeFile(path.join(vdir(m.id), 'meta.json'), JSON.stringify(m, null, 1));
app.get('/api/videos/formats', (req, res) => res.json(Object.fromEntries(Object.entries(video.FORMATS).map(([k, f]) => [k, f.label]))));
app.post('/api/videos', vupload.single('video'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ارفع فيديو (mp4 أو mov)' });
  const b = req.body || {}, id = crypto.randomBytes(6).toString('hex'), d = vdir(id);
  await fs.mkdir(d, { recursive: true });
  const ext = path.extname(req.file.filename) || '.mp4';
  await fs.rename(req.file.path, path.join(d, 'src' + ext));
  const formats = String(b.formats || 'v').split(',').filter(k => video.FORMATS[k]);
  const m = { id, created: new Date().toISOString(), src: 'src' + ext, orig: req.file.originalname || '', name: String(b.name || '').trim() || 'منتج', code: String(b.code || '').trim(),
    title: String(b.title || '').trim(), notes: String(b.notes || '').trim(), start: +b.start || 0, end: +b.end || 0, cover_t: b.cover_t === '' || b.cover_t == null ? null : +b.cover_t,
    opts: { silence: b.silence !== '0', captions: b.captions !== '0', motion: b.motion !== '0' }, formats: formats.length ? formats : ['v'], phone: String(b.phone || '').trim() || await site.shopPhone(), status: 'working', step: 'بيبدأ…', files: {} };
  await vsave(m);
  res.json(m);
  video.processVideo(d, m, vsave);            // في الخلفية — الصفحة بتسأل على الحالة
}));
app.get('/api/videos', wrap(async (req, res) => {
  await fs.mkdir(VDIR, { recursive: true }); const out = [];
  for (const id of await fs.readdir(VDIR)) { try { out.push(JSON.parse(await fs.readFile(path.join(vdir(id), 'meta.json'), 'utf8'))); } catch {} }
  res.json(out.sort((a, b) => b.created.localeCompare(a.created)));
}));
app.get('/api/videos/:id', wrap(async (req, res) => res.json(JSON.parse(await fs.readFile(path.join(vdir(req.params.id), 'meta.json'), 'utf8')))));
app.patch('/api/videos/:id', wrap(async (req, res) => {
  const m = JSON.parse(await fs.readFile(path.join(vdir(req.params.id), 'meta.json'), 'utf8'));
  if (req.body && req.body.ai && typeof req.body.ai === 'object') m.ai = Object.assign(m.ai || {}, req.body.ai);
  await vsave(m); res.json(m);
}));
app.get('/api/videos/:id/file/:name', wrap(async (req, res) => {
  const n = String(req.params.name); if (!/^(v|s|l)\.mp4$|^cover\.jpg$/.test(n)) return res.sendStatus(404);
  const p = path.join(vdir(req.params.id), n);
  if (req.query.dl) res.download(p, (req.query.dl === '1' ? n : String(req.query.dl).replace(/[\\/:*?"<>|]/g, '')) );
  else res.sendFile(p);
}));
app.delete('/api/videos/:id', wrap(async (req, res) => { await fs.rm(vdir(req.params.id), { recursive: true, force: true }); res.json({ ok: true }); }));

// --- frame settings (code position / size / colour) -------------------------
// «ابعتلي على الواتساب»: بنحط المنتج (صور بالفريم + نص جاهز للكتالوج) في فولدر outbox، وجسر الواتساب بيبعته
const OUTBOX = process.env.WA_OUTBOX || 'C:\\mekanizm-whatsapp\\outbox';
const SEND_TO = () => String(process.env.WA_SEND_TO || '201119199659').replace(/\D/g, '');
app.post('/api/drafts/:id/send-wa', wrap(async (req, res) => {
  const m = await readMeta(req.params.id);
  const ids = [...Array(m.count).keys()].filter(i => !m.removed.includes(i)).slice(0, 10);
  if (!ids.length) return res.status(400).json({ error: 'مفيش صور' });
  const job = path.join(OUTBOX, m.id + '-' + Date.now());
  await fs.mkdir(job, { recursive: true });
  const images = [];
  for (const [k, i] of ids.entries()) { const f = `${k + 1}.jpg`; await fs.copyFile(path.join(dir(m.id), `f${i}.jpg`), path.join(job, f)); images.push(f); }
  const url = m.site && m.site.url && m.site.url !== '#' ? m.site.url : '';
  const text = [m.name, m.code ? 'الكود: ' + m.code : '', '', m.description || '', url ? '\n' + url : ''].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  await fs.writeFile(path.join(job, 'job.tmp'), JSON.stringify({ to: SEND_TO(), text, images }));
  await fs.rename(path.join(job, 'job.tmp'), path.join(job, 'job.json'));   // الجسر مبيشوفوش غير لما يكمل
  let bridge = false;
  try { const st = await fs.stat(path.join(OUTBOX, '..', 'outbox.alive')); bridge = Date.now() - st.mtimeMs < 60e3; } catch {}
  if (!bridge) return res.json({ ok: false, images: images.length, bridge, msg: 'جسر الواتساب مش شغال — هيتبعت أول ما يشتغل' });
  // بنستنى نتيجة الجسر الحقيقية (الفولدر بيتمسح لما يتبعت، أو job.failed لو فشل)
  const exists = f => fs.access(f).then(() => true, () => false);
  for (let t = 0; t < 60; t++) {
    await new Promise(r => setTimeout(r, 1000));
    if (!(await exists(job))) return res.json({ ok: true, images: images.length, bridge });
    if (await exists(path.join(job, 'job.failed'))) {
      await fs.rm(job, { recursive: true, force: true });
      return res.status(502).json({ error: 'الواتساب رفض الإرسال (مكتبة الواتساب محتاجة تحديث) — استخدم «نسخ نص المنتج» و«تحميل الصور» لحد ما تتصلح' });
    }
  }
  res.json({ ok: false, images: images.length, bridge, msg: 'لسه بيتبعت... لو موصلش خلال دقيقة قولي' });
}));

// صور الآيفون (HEIC): المتصفح مش بيفتحها — بنحوّلها JPG هنا ونرجّعها
app.post('/api/heic', express.raw({ type: () => true, limit: '30mb' }), wrap(async (req, res) => {
  const out = await require('heic-convert')({ buffer: req.body, format: 'JPEG', quality: 0.92 });
  res.type('jpeg').send(Buffer.from(out));
}));

const FRAME_DIR = path.join(__dirname, '..', 'assets');
app.get('/api/frame', wrap(async (req, res) => res.json(JSON.parse(await fs.readFile(path.join(FRAME_DIR, 'frame.json'), 'utf8')))));
app.get('/api/frame.png', (req, res) => res.sendFile(path.join(FRAME_DIR, 'frame.png')));
app.put('/api/frame', wrap(async (req, res) => {
  const f = path.join(FRAME_DIR, 'frame.json'), cfg = JSON.parse(await fs.readFile(f, 'utf8')), c = req.body || {};
  const num = (v, lo, hi) => Number.isFinite(+v) && +v >= lo && +v <= hi;
  if (!num(c.x, 0, 4000) || !num(c.y, 0, 4000) || !num(c.size, 10, 120) || !/^#[0-9a-fA-F]{6}$/.test(c.color || '')) return res.status(400).json({ error: 'قيم غير صحيحة' });
  cfg.code = { ...cfg.code, x: +c.x, y: +c.y, size: +c.size, color: c.color };
  await fs.writeFile(f, JSON.stringify(cfg, null, 2));
  res.json(cfg);
}));

// --- connection status -------------------------------------------------------
app.get('/api/status', wrap(async (req, res) => {
  const out = { claude: true, ai: require('./describe').aiOn(), wa: wa.configured(), supabase: false, system: false };
  try { await site.sections(); out.supabase = true; } catch (e) { out.error = e.message; }
  try { await erp.findByName('x'); out.system = true; } catch (e) { out.error = out.error || e.message; }
  res.json(out);
}));

app.get('/api/sections', wrap(async (req, res) => res.json(await site.sections())));
app.post('/api/sections', wrap(async (req, res) => res.json(await site.addSection((req.body || {}).name))));

app.delete('/api/drafts/:id', wrap(async (req, res) => {
  await fs.rm(dir(req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
}));

app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: res => res.set('Cache-Control', 'no-cache') }));
const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log('http://localhost:' + port));
module.exports = app;
