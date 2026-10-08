// Generates the candidate frames (1080x1080 transparent PNG, product window = 12% inset, code band at the bottom).
const sharp = require('sharp'), path = require('path');
const N = 1080, I = 130, W = N - 2 * I;
const hole = (r = 0) => `M0 0H${N}V${N}H0Z M${I + r} ${I}H${I + W - r}A${r} ${r} 0 0 1 ${I + W} ${I + r}V${I + W - r}A${r} ${r} 0 0 1 ${I + W - r} ${I + W}H${I + r}A${r} ${r} 0 0 1 ${I} ${I + W - r}V${I + r}A${r} ${r} 0 0 1 ${I + r} ${I}Z`;
const F = {
  // 1) أبيض مع إطار دهبي رفيع ولوحة للكود
  'gold-classic': `<path fill="#fff" fill-rule="evenodd" d="${hole()}"/>
    <rect x="${I - 14}" y="${I - 14}" width="${W + 28}" height="${W + 28}" fill="none" stroke="#c9a24b" stroke-width="5"/>
    <rect x="${I - 28}" y="${I - 28}" width="${W + 56}" height="${W + 56}" fill="none" stroke="#c9a24b" stroke-width="2"/>
    <rect x="${N / 2 - 170}" y="${N - 96}" width="340" height="64" rx="32" fill="none" stroke="#c9a24b" stroke-width="3"/>`,
  // 2) كحلي غامق مع نافذة بحواف مدورة
  'navy-modern': `<path fill="#14213d" fill-rule="evenodd" d="${hole(36)}"/>
    <rect x="${I}" y="${I}" width="${W}" height="${W}" rx="36" fill="none" stroke="#fca311" stroke-width="6"/>
    <rect x="${N / 2 - 170}" y="${N - 96}" width="340" height="64" rx="32" fill="#fca311"/>`,
  // 3) بيج دافي مع زوايا زخرفية
  'soft-beige': `<path fill="#f6efe6" fill-rule="evenodd" d="${hole(18)}"/>
    <rect x="${I}" y="${I}" width="${W}" height="${W}" rx="18" fill="none" stroke="#d8c3a5" stroke-width="4"/>
    ${[[60, 60, 1, 1], [N - 60, 60, -1, 1], [60, N - 60, 1, -1], [N - 60, N - 60, -1, -1]].map(([x, y, a, b]) => `<path d="M${x} ${y + 40 * b}V${y}H${x + 40 * a}" fill="none" stroke="#b08968" stroke-width="5" stroke-linecap="round"/>`).join('')}
    <rect x="${N / 2 - 170}" y="${N - 96}" width="340" height="64" rx="12" fill="#b08968"/>`
};
// code colour that reads well on each plaque
const CODE = { 'gold-classic': '#8a6a1f', 'navy-modern': '#14213d', 'soft-beige': '#ffffff' };
(async () => {
  for (const [k, body] of Object.entries(F))
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">${body}</svg>`)).png().toFile(path.join(__dirname, k + '.png'));
  console.log(JSON.stringify(CODE));
})();
