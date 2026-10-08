// WhatsApp catalog = a Meta (Commerce Manager) catalog linked to the WhatsApp Business account.
// Adds/updates the product through the Catalog Batch API (upsert by retailer id = product code).
const configured = () => !!(process.env.WA_CATALOG_ID && process.env.WA_TOKEN);

async function upsert({ code, name, description, price, link, images }) {
  if (!configured()) return { skipped: 'كتالوج الواتساب مش متوصل (WA_CATALOG_ID / WA_TOKEN)' };
  if (!(+price > 0)) return { skipped: 'مفيش سعر للمنتج — ميتا بتطلب سعر عشان المنتج يظهر في الكتالوج' };
  const cur = process.env.WA_CURRENCY || 'EGP';
  const data = {
    id: String(code), title: String(name).slice(0, 150), description: String(description || name).slice(0, 5000),
    availability: 'in stock', condition: 'new', price: `${(+price).toFixed(2)} ${cur}`,
    link, image_link: images[0], brand: process.env.WA_BRAND || 'ميكانيزم'
  };
  if (images.length > 1) data.additional_image_link = images.slice(1, 11).join(',');
  const body = new URLSearchParams({
    access_token: process.env.WA_TOKEN, item_type: 'PRODUCT_ITEM', allow_upsert: 'true',
    requests: JSON.stringify([{ method: 'UPDATE', data }])
  });
  const r = await fetch(`${process.env.WA_API_BASE || 'https://graph.facebook.com'}/${process.env.WA_API_VERSION || 'v21.0'}/${process.env.WA_CATALOG_ID}/items_batch`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Meta ' + r.status + ' ' + ((j.error && j.error.message) || '').slice(0, 200));
  return { handle: (j.handles || [])[0] || null };
}

module.exports = { upsert, configured };
