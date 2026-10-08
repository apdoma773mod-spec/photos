// Minimal Supabase client: logs in as the shop owner (same account as the admin pages) and calls REST/Storage.
const URL_ = () => (process.env.SB_URL || 'https://tkzfjeizvanfptnqvrmr.supabase.co').replace(/\/$/, '');
const KEY = () => process.env.SB_KEY || 'sb_publishable_8QP_KfvoYOyF_bZC4-fw1w_qCkfEpvZ'; // public key, same one shop.html ships
let ses = null;

async function auth(grant, body) {
  const r = await fetch(`${URL_()}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('دخول Supabase فشل: ' + (j.error_description || j.msg || r.status));
  return { at: j.access_token, rt: j.refresh_token, uid: j.user && j.user.id };
}
async function login() {
  const { SB_EMAIL: email, SB_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error('SB_EMAIL / SB_PASSWORD مش متظبطين');
  ses = await auth('password', { email, password });
}

async function sb(path, o = {}) {
  if (!ses) await login();
  const go = () => fetch(URL_() + path, { ...o, headers: { apikey: KEY(), Authorization: 'Bearer ' + ses.at, ...(o.headers || {}) } });
  let r = await go();
  if (r.status === 401) { await login(); r = await go(); }
  return r;
}
async function json(path, o = {}) {
  const r = await sb(path, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw Object.assign(new Error(`Supabase ${r.status} ${typeof j === 'string' ? j : (j && (j.message || j.error)) || ''}`.trim()), { status: r.status });
  return j;
}
const userId = async () => { if (!ses) await login(); return ses.uid; };

module.exports = { sb, json, userId, url: URL_ };
