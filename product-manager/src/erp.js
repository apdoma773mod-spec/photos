// ERP adapter: finds the product code by name and pushes name updates back.
// Configured purely through env so any REST system can be plugged in.
const path_ = (o, p) => (p ? p.split('.').reduce((a, k) => (a == null ? a : a[k]), o) : o);

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

// token-order independent similarity
function score(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  const sorted = s => s.split(' ').sort().join(' ');
  return Math.max(sim(x, y), sim(sorted(x), sorted(y)));
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const raw = process.env.ERP_AUTH_HEADER;
  if (raw && raw.includes(':')) { const i = raw.indexOf(':'); h[raw.slice(0, i).trim()] = raw.slice(i + 1).trim(); }
  return h;
}

async function search(q) {
  const url = process.env.ERP_SEARCH_URL;
  if (!url) throw new Error('ERP_SEARCH_URL مش متظبط');
  const r = await fetch(url.replace('{q}', encodeURIComponent(q)), { headers: headers() });
  if (!r.ok) throw new Error('ERP search ' + r.status);
  const list = path_(await r.json(), process.env.ERP_LIST_PATH || '') || [];
  const cf = process.env.ERP_CODE_FIELD || 'code', nf = process.env.ERP_NAME_FIELD || 'name';
  return list.map(x => ({ code: String(path_(x, cf)), name: String(path_(x, nf)) }));
}

// Returns { match, candidates }. `match` only when confident, else the user picks from candidates.
async function findByName(name) {
  const all = await search(name);
  const ranked = all.map(c => ({ ...c, score: score(name, c.name) })).sort((a, b) => b.score - a.score).slice(0, 5);
  const [top, second] = ranked;
  const sure = top && top.score >= 0.85 && (!second || top.score - second.score >= 0.08);
  return { match: sure ? top : null, candidates: ranked };
}

async function rename(code, newName) {
  const url = process.env.ERP_UPDATE_URL;
  if (!url) throw new Error('ERP_UPDATE_URL مش متظبط');
  const nf = process.env.ERP_NAME_FIELD || 'name';
  const r = await fetch(url.replace('{code}', encodeURIComponent(code)), {
    method: process.env.ERP_UPDATE_METHOD || 'PUT', headers: headers(), body: JSON.stringify({ [nf]: newName })
  });
  if (!r.ok) throw new Error('ERP rename ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

module.exports = { findByName, rename, norm, score };
