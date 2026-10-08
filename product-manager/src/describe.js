// Arabic product description via Claude (looks at the first image + the name).
const Anthropic = require('@anthropic-ai/sdk');
let client;

async function describe(name, imageBuf) {
  if (!process.env.ANTHROPIC_API_KEY) return '';
  client ||= new Anthropic();
  const content = [];
  if (imageBuf) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBuf.toString('base64') } });
  content.push({ type: 'text', text:
    `اكتب وصف منتج لمتجر إلكتروني بالعربي (لهجة بسيطة ومحترفة، من ٣ لـ ٥ جمل) للمنتج: "${name}".\n` +
    `اعتمد على الصورة وعلى الاسم بس، ومتخترعش مواصفات أو مقاسات أو خامات مش ظاهرة. رجّع نص الوصف فقط بدون عنوان.` });
  const r = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 600, messages: [{ role: 'user', content }]
  });
  return r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

module.exports = { describe };
