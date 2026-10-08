// "System" adapter: the Mekanezm management system on Supabase.
// New system  -> table mk_products (code, name)       (when rpc mk_tables_on() = true)
// Old system  -> app_state.data.products (JSON blob)  (versioned row owned by the user)
const { json, userId } = require('./supabase');

const norm = s => String(s || '')
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[^؀-ۿa-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[n];
}
const sim = (a, b) => { const L = Math.max(a.length, b.length); return L ? 1 - lev(a, b) / L : 0; };
function score(a, b) {                      // order-independent token similarity
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  const sorted = s => s.split(' ').sort().join(' ');
  let best = Math.max(sim(x, y), sim(sorted(x), sorted(y)));
  const tx = x.split(' '), ty = y.split(' '), [sm, lg] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  if (sm.length >= 2 && sm.every(t => lg.includes(t))) best = Math.max(best, 0.88);   // one name = the other + extra words
  return best;
}

let mode = null, cache = null, cacheAt = 0;
async function useTables() {
  if (mode === null) mode = (await json('/rest/v1/rpc/mk_tables_on', { method: 'POST', body: '{}' })) === true ? 'tables' : 'blob';
  return mode === 'tables';
}
async function list() {
  if (cache && Date.now() - cacheAt < 60e3) return cache;
  if (await useTables()) {
    // السيرفر بيرجّع 1000 صف بالكتير في المرة — بنجيب الكل على دفعات
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const part = await json(`/rest/v1/mk_products?select=code,name,price&order=id&offset=${from}&limit=1000`);
      rows.push(...part); if (part.length < 1000) break;
    }
    cache = rows.map(x => ({ code: String(x.code || ''), name: String(x.name || ''), price: +x.price || 0 }));
  } else {
    const r = await json('/rest/v1/app_state?select=data&owner=eq.' + await userId());
    cache = ((r[0] && r[0].data && r[0].data.products) || []).map(x => ({ code: String(x.code || ''), name: String(x.name || ''), price: +x.price || 0 }));
  }
  cacheAt = Date.now();
  return cache;
}

// { match, candidates } — `match` only when confident, otherwise the user picks from candidates.
async function findByName(name) {
  const ranked = (await list()).filter(p => p.code).map(p => ({ ...p, score: score(name, p.name) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  const [top, second] = ranked;
  const sure = top && top.score >= 0.85 && (!second || top.score - second.score >= 0.08);
  return { match: sure ? top : null, candidates: ranked };
}

async function rename(code, newName) {
  cache = null;
  if (await useTables()) {
    const rows = await json('/rest/v1/mk_products?code=eq.' + encodeURIComponent(code), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: newName, updated_at: new Date().toISOString() }) });
    if (!rows.length) throw new Error('الكود مش موجود في السيستم: ' + code);
    return;
  }
  const owner = await userId();
  for (let i = 0; i < 3; i++) {             // optimistic-lock on app_state.version, same as the app does
    const [row] = await json(`/rest/v1/app_state?select=data,version&owner=eq.${owner}`);
    const p = row && row.data.products.find(x => String(x.code) === String(code));
    if (!p) throw new Error('الكود مش موجود في السيستم: ' + code);
    p.name = newName;
    const ok = await json(`/rest/v1/app_state?owner=eq.${owner}&version=eq.${row.version}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: row.data, version: row.version + 1, updated_at: new Date().toISOString() }) });
    if (ok.length) return;
  }
  throw new Error('السيستم اتعدل من مكان تاني، جرّب تاني');
}

// أكواد السيستم الحقيقية شكلها P0001…P1250 (ومعاهم شوية أرقام عادية): الجديد = أكبر رقم + 1 بنفس الشكل P####
async function nextCode() {
  let m = 0, hasP = false;
  for (const p of await list()) {
    const c = String(p.code || '').trim(), mp = c.match(/^P(\d+)$/i);
    if (mp) { hasP = true; m = Math.max(m, parseInt(mp[1], 10)); continue; }
    const n = parseInt(c, 10); if (String(n) === c && n > m) m = n;
  }
  return hasP ? 'P' + String(m + 1).padStart(4, '0') : String(m + 1);
}

// New product in the system, shaped exactly like the app's own "new product" (code, name, cat, unit, qty, price, min, cost).
async function create({ code, name, cat, price, qty, unit, cost }) {
  if ((await list()).some(p => p.code === String(code))) throw new Error('الكود ده مستخدم في السيستم: ' + code);
  cache = null;
  if (await useTables()) {
    const [row] = await json('/rest/v1/mk_products', { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ code: String(code), name, cat: cat || '', unit: unit || 'قطعة', qty: +qty || 0, price: +price || 0, min: 0, barcode: '' }) });
    if (+cost > 0) await json('/rest/v1/mk_product_costs', { method: 'POST', body: JSON.stringify({ product_id: row.id, cost: +cost }) });
    return;
  }
  const owner = await userId();
  for (let i = 0; i < 3; i++) {
    const [row] = await json(`/rest/v1/app_state?select=data,version&owner=eq.${owner}`);
    row.data.products.unshift({ id: require('crypto').randomUUID(), code: String(code), barcode: '', name, cat: cat || '', unit: unit || 'قطعة', qty: +qty || 0, price: +price || 0, min: 0, cost: +cost || 0 });
    const ok = await json(`/rest/v1/app_state?owner=eq.${owner}&version=eq.${row.version}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: row.data, version: row.version + 1, updated_at: new Date().toISOString() }) });
    if (ok.length) return;
  }
  throw new Error('السيستم اتعدل من مكان تاني، جرّب تاني');
}

const priceOf = async code => ((await list()).find(p => p.code === String(code)) || {}).price || 0;

module.exports = { findByName, rename, create, nextCode, priceOf, norm, score };
