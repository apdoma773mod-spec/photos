// The public shop (shop.html): products live in site_content(id='main').data.products, images in storage bucket site-images.
const { sb, json, url } = require('./supabase');
const uid = () => Math.random().toString(36).slice(2, 9);   // same id format shop.html uses

const getRow = async () => (await json('/rest/v1/site_content?id=eq.main&select=data,version'))[0];
async function sections() { const r = await getRow(); return ((r && r.data.sections) || []).map(s => ({ id: s.id, name: s.name })); }

async function upload(buf) {
  const path = `img/${Date.now().toString(36)}-${uid()}.jpg`;
  const r = await sb('/storage/v1/object/site-images/' + path, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'cache-control': 'max-age=31536000' }, body: buf });
  if (!r.ok) throw new Error('رفع الصورة فشل (' + r.status + ') ' + (await r.text()).slice(0, 150));
  return `${url()}/storage/v1/object/public/site-images/${path}`;
}

async function publish({ name, description, sec, code, images }) {
  const secs = await sections();
  if (!secs.some(s => s.id === sec)) throw new Error('اختار القسم الأول');
  if ((await getRow()).data.products.some(p => String(p.code) === String(code))) throw new Error('فيه منتج بنفس الكود في الموقع خلاص');
  const imgs = [];
  for (const b of images) imgs.push(await upload(b));
  const product = { id: uid(), name, desc: description || '', sec, imgs, img: imgs[0] || '', code: String(code) };
  for (let i = 0; i < 4; i++) {              // versioned save, like saveSite() in shop.html
    const row = await getRow();
    row.data.products.push(product);
    const ok = await json(`/rest/v1/site_content?id=eq.main&version=eq.${row.version}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: row.data, version: row.version + 1, updated_at: new Date().toISOString() }) });
    if (ok.length) return { id: product.id, url: (process.env.SHOP_URL || 'https://apdoma773mod-spec.github.io/mekanezm/shop.html') + '#p=' + product.id };
  }
  throw new Error('الموقع اتعدل من مكان تاني، جرّب تاني');
}

module.exports = { publish, sections };
