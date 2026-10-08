// جسر واتساب ← سيستم ميكانيزم (طلبات الواتساب)
// أي رسالة فيها كلمة "طلب" بتتبعت لدالة wa_submit، وبتظهر للموظف في السيستم كإشعار.
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

const SB_URL = 'https://tkzfjeizvanfptnqvrmr.supabase.co';
const SB_KEY = 'sb_publishable_8QP_KfvoYOyF_bZC4-fw1w_qCkfEpvZ';
const KEYWORD = 'طلب';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SECRET = JSON.parse(fs.readFileSync(__dirname + '\\config.json', 'utf8')).secret;
const QUEUE = __dirname + '\\queue.jsonl';

const log = (...a) => {
  const line = `[${new Date().toLocaleString('en-GB')}] ${a.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(__dirname + '\\bridge.log', line + '\n'); } catch (e) {}
};

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: __dirname + '\\session' }),
  puppeteer: { executablePath: CHROME, headless: true, args: ['--no-sandbox'] },
});

client.on('qr', (qr) => {
  log('محتاج ربط جديد — افتح qr.png وامسحه');
  require('qrcode').toFile(__dirname + '\\qr.png', qr, { width: 420, margin: 2 });
});
client.on('authenticated', () => log('تم الربط'));
client.on('ready', () => { log('الجسر شغال وبيسمع للرسايل'); flush(); });
client.on('disconnected', (r) => { log('اتفصل:', r); process.exit(1); });

async function send(o) {
  const r = await fetch(SB_URL + '/rest/v1/rpc/wa_submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
    body: JSON.stringify({ p_secret: SECRET, p_msg_id: o.msg_id || ('q-' + Buffer.from((o.phone || '') + '|' + (o.body || '')).toString('base64').slice(0, 40)), p_phone: o.phone, p_name: o.name, p_body: o.body }),
  });
  const out = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${out}`);
  return out;
}

// طلبات متبعتتش (مفيش نت مثلاً) بتتحفظ وتتعاد
let flushing = false;
async function flush() {
  if (flushing || !fs.existsSync(QUEUE)) return;
  flushing = true;
  try {
    const rows = fs.readFileSync(QUEUE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const left = [];
    for (const o of rows) {
      try { await send(o); log('✔ اتبعت من الطابور:', o.phone); }
      catch (e) { if (/forbidden|empty/.test(e.message)) log('✘ طلب مرفوض نهائياً:', e.message); else left.push(o); }
    }
    if (left.length) fs.writeFileSync(QUEUE, left.map((x) => JSON.stringify(x)).join('\n') + '\n');
    else fs.unlinkSync(QUEUE);
  } catch (e) { log('خطأ في الطابور:', e.message); }
  flushing = false;
}
setInterval(flush, 60000);

// صندوق الصادر: مدير المنتجات بيحط فولدر فيه job.json + صور، والجسر بيبعتهم (صور المنتج + نص الكتالوج)
const { MessageMedia } = require('whatsapp-web.js');
const OUTBOX = __dirname + '\\outbox';
let ready = false, sending = false;
client.on('ready', () => { ready = true; });
async function outbox() {
  try { fs.writeFileSync(__dirname + '\\outbox.alive', String(Date.now())); } catch (e) {}
  if (!ready || sending || !fs.existsSync(OUTBOX)) return;
  sending = true;
  try {
    for (const d of fs.readdirSync(OUTBOX)) {
      const dir = OUTBOX + '\\' + d, jf = dir + '\\job.json';
      if (!fs.existsSync(jf)) continue;
      fs.renameSync(jf, dir + '\\job.sending');   // عشان لو حصل خطأ ميتبعتش مرتين
      try {
        const job = JSON.parse(fs.readFileSync(dir + '\\job.sending', 'utf8'));
        const num = String(job.to || '').replace(/\D/g, '');
        let step = 'getNumberId'; const wid = await client.getNumberId(num).catch(e => { throw new Error(step + ': ' + e.message); });           // واتساب بقى عايز الـ id الحقيقي مش رقم@c.us
        if (!wid) throw new Error('الرقم مش على واتساب: ' + num);
        const to = wid._serialized; log('📲 ببعت لـ', to);
        let chat = null; for (const id of [to, num + '@c.us']) { try { chat = await client.getChatById(id); if (chat) break; } catch (e) { log('getChatById', id, (e.stack || e.message).replace(/\s+/g, ' ').slice(0, 300)); } }
        if (!chat) { try { const all = await client.getChats(); chat = all.find(c => c.id && (c.id._serialized === to || c.id.user === num)) || null; log('getChats', all.length, chat ? 'لقيتها' : 'مش لاقيها'); } catch (e) { log('getChats', (e.stack || e.message).replace(/\s+/g, ' ').slice(0, 300)); } }
        if (!chat) throw new Error('مفيش محادثة مع ' + num);
        const say = (c, o) => chat.sendMessage(c, Object.assign({ sendSeen: false }, o || {}));
        for (const f of job.images || []) await say(MessageMedia.fromFilePath(dir + '\\' + f));
        if (job.text) await say(job.text);
        fs.rmSync(dir, { recursive: true, force: true });
        log(`📲 اتبعت منتج للواتساب (${(job.images || []).length} صور) على ${job.to}`);
      } catch (e) { log('✘ مبعتش المنتج', d, e.message); try { fs.renameSync(dir + '\\job.sending', dir + '\\job.failed'); } catch (_) {} }
    }
  } catch (e) { log('✘ صندوق الصادر:', e.message); }
  sending = false;
}
setInterval(outbox, 5000);

client.on('message', async (msg) => {
  try {
    const text = (msg.body || '').trim();
    log(`وصلت رسالة: من=${msg.from} نوع=${msg.type} نص="${text.slice(0, 60)}"`);
    if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us')) return;
    if (!text.includes(KEYWORD)) return;

    const contact = await msg.getContact();
    let number = contact.number;
    if (msg.from.endsWith('@lid')) {
      try {
        const m = await client.getContactLidAndPhone([msg.from]);
        const pn = m && m[0] && (m[0].pn || m[0].phone);
        if (pn) number = String(pn).split('@')[0];
      } catch (e) { log('تعذر جلب رقم الموبايل:', e.message); }
    }
    const o = {
      msg_id: (msg.id && (msg.id._serialized || msg.id.id)) || `${msg.from}-${msg.timestamp || Date.now()}`,
      phone: (number || '').replace(/\D/g, ''),
      name: (contact.pushname || contact.name || '').trim(),
      body: text,
    };
    try { await send(o); log(`✔ طلب اتبعت للسيستم من ${o.name} (${o.phone || 'رقم غير معروف'})`); }
    catch (e) {
      log('✘ مبعتش، اتحفظ للإعادة:', e.message);
      fs.appendFileSync(QUEUE, JSON.stringify(o) + '\n');
    }
  } catch (e) {
    log('خطأ:', e.message);
  }
});

client.initialize();
