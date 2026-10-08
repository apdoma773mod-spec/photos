// Creates the product (with framed images + description) on Shopify via the Admin REST API.
const API = '2025-01';

async function createProduct({ title, description, code, images }) {
  const { SHOPIFY_STORE: store, SHOPIFY_TOKEN: token } = process.env;
  if (!store || !token) throw new Error('بيانات Shopify مش متظبطة');
  const body = { product: {
    title,
    body_html: '<p>' + String(description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').split(/\n+/).join('</p><p>') + '</p>',
    status: 'draft',
    variants: [{ sku: code || undefined }],
    images: images.map((b, i) => ({ attachment: b.toString('base64'), filename: `${code || 'img'}-${i + 1}.jpg`, position: i + 1 }))
  } };
  const r = await fetch(`https://${store}/admin/api/${API}/products.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Shopify ' + r.status + ' ' + JSON.stringify(j.errors || j).slice(0, 300));
  return { id: j.product.id, url: `https://${store}/admin/products/${j.product.id}` };
}

module.exports = { createProduct };
