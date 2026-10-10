// وصف المنتج بالعربي. بالترتيب: Claude (لو فيه مفتاح) ← Gemini (لو فيه مفتاح، مجاني) ← كاتب داخلي من الاسم والقسم (دايماً شغال)
// hint = أي معلومة كتبها صاحب المحل في خانة الوصف (بنكبّرها لوصف كامل)
let client;

const prompt = (name, hint, sec) =>
  `اكتب وصف منتج لمتجر إلكتروني بالعربي (لهجة مصرية بسيطة ومحترفة، من ٣ لـ ٥ جمل) للمنتج: "${name}".\n` +
  (sec ? `القسم: ${sec}.\n` : '') +
  (hint ? `معلومات من صاحب المحل (لازم تستخدمها): ${hint}\n` : '') +
  `المحل بيبيع إكسسوارات مطابخ وغرف دريسنج. اعتمد على الصورة والاسم والمعلومات دي بس، ومتخترعش مواصفات أو مقاسات أو خامات مش ظاهرة، ومتكتبش أسعار. رجّع نص الوصف فقط بدون عنوان.`;

async function viaClaude(name, img, hint, sec) {
  const Anthropic = require('@anthropic-ai/sdk');
  client ||= new Anthropic();
  const content = [];
  if (img) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.toString('base64') } });
  content.push({ type: 'text', text: prompt(name, hint, sec) });
  const r = await client.messages.create({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 600, messages: [{ role: 'user', content }] });
  return r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

// fetch بتعلّق مع الطلبات الكبيرة (الصورة) على الجهاز ده — https عادي على IPv4 شغال في ثانية
function post(url, body, timeout = 30e3) {
  return new Promise((ok, no) => {
    const q = require('https').request(url, { method: 'POST', family: 4, timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-goog-api-key': process.env.GEMINI_API_KEY } }, r => {
      let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c);
      r.on('end', () => { let json = {}; try { json = JSON.parse(d); } catch {} ok({ status: r.statusCode, json }); });
    });
    q.on('timeout', () => q.destroy(new Error('timeout'))); q.on('error', no); q.end(body);
  });
}

async function viaGemini(name, img, hint, sec) {
  const parts = [{ text: prompt(name, hint, sec) }];
  if (img) parts.unshift({ inline_data: { mime_type: 'image/jpeg', data: img.toString('base64') } });
  // لو موديل زحمة أو اتشال بنجرب اللي بعده
  const models = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'].filter(Boolean))];
  let last;
  for (const model of models) {
    try {
      const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.6, maxOutputTokens: 2000 } }));
      const j = r.json;
      if (r.status === 401 || r.status === 403) throw new Error('مفتاح Gemini مرفوض');
      if (r.status !== 200) { last = new Error('Gemini ' + model + ' ' + r.status); continue; }
      const t = ((((j.candidates || [])[0] || {}).content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
      if (t) return t;
      last = new Error('Gemini ' + model + ': رد فاضي');
    } catch (e) { if (/مرفوض/.test(e.message)) throw e; last = e; }
  }
  throw last || new Error('Gemini مش متاح');
}

// ---------- الكاتب الداخلي (من غير إنترنت ولا مفاتيح) ----------
const N = s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const TYPES = [
  [/مفصل/, 'مفصلة لضلف المطابخ والدواليب، بتخلّي الضلفة تفتح وتقفل بسلاسة وثبات'],
  [/مقبض|مقابض|يد /, 'مقبض بشكل شيك بيدّي لمسة نهائية حلوة لضلف المطبخ والدولاب ومريح في الإيد'],
  [/مجر|مجاري|سك[هت]|تلسكوب|رولمان/, 'مجرى أدراج بيخلّي الدرج يتسحب ويتقفل بنعومة ويستحمل الاستخدام اليومي'],
  [/مطبقي|اطباق/, 'مطبقية لتنظيم الأطباق جوه دولاب المطبخ، بتوفر مساحة وتخلّي الأطباق تنشف وتتشال بسهولة'],
  [/شماع/, 'شماعة لتعليق الهدوم في الدولاب وغرفة الدريسنج، بتنظّم المساحة وتسهّل الوصول للهدوم'],
  [/بستم|جاك|رافع|ليفت/, 'رافع لضلف الدواليب العلوية، بيشيل الضلفة مفتوحة ويقفلها بهدوء'],
  [/رجل|رجول|قاعد/, 'رجل لقاعدة الدولاب قابلة للضبط، بتظبط ارتفاع الوحدة وتحميها من الرطوبة'],
  [/كالون|كوالين|قفل|كيلون/, 'قفل للأدراج والضلف بيحافظ على حاجتك بأمان'],
  [/كارجو|سل[هة]|سبت|باسكت/, 'كارجو لتنظيم المطبخ، بيستغل المساحة الضيقة ويخلّي كل حاجة قريبة من إيدك'],
  [/ركن|كورنر|زاوي/, 'وحدة للركنة بتستغل مساحة الزاوية اللي غالباً بتضيع في المطبخ'],
  [/ليد|لمب|اضاء|اناره/, 'إضاءة ليد للمطبخ والدواليب بتدّي شكل مودرن وإضاءة واضحة'],
  [/صفاي|حوض|خلاط/, 'إكسسوار للحوض بيسهّل الشغل اليومي في المطبخ'],
  [/حامل|ستاند|رف/, 'حامل عملي لتنظيم الحاجة وتوفير المساحة'],
  [/جزام|احذي/, 'وحدة تنظيم للجزم بتوفر مساحة وتحافظ عليها مترتبة']
];
const FEAT = [
  [/هيدرولي|هيدرول|كاتم|سوفت|soft/i, 'بنظام كاتم (هيدروليك) بيقفل بهدوء من غير خبط'],
  [/ستانلس|استانلس|انوكس/, 'خامة ستانلس مقاومة للصدأ'], [/الومنيوم|ألومنيوم/, 'خامة ألومنيوم خفيفة وقوية'],
  [/ذهبي|جولد/, 'لون ذهبي'], [/اسود|بلاك/, 'لون أسود مطفي'], [/كروم/, 'تشطيب كروم لامع'], [/فضي|سيلفر/, 'لون فضي'],
  [/تقيل|تقيله|هيفي/, 'تقيلة وتستحمل أوزان عالية'], [/تركي/, 'صناعة تركي'], [/الماني/, 'صناعة ألماني'], [/ايطالي/, 'صناعة إيطالي']
];
function local(name, hint, sec) {
  const n = ' ' + N(name) + ' ';
  const type = (TYPES.find(([re]) => re.test(n)) || [])[1];
  const feats = FEAT.filter(([re]) => re.test(n)).map(f => f[1]);
  const size = (String(name).match(/(\d+(?:[.,]\d+)?)\s*(مم|ملي|سم|cm|mm)/i) || [])[0] || ((String(name).match(/\s(\d{2,3})\s*$/) || [])[1] ? (String(name).match(/\s(\d{2,3})\s*$/))[1] + ' سم' : '');
  const out = [];
  out.push(type ? `${name}: ${type}.` : `${name} من إكسسوارات المطابخ وغرف الدريسنج، عملي وشكله نضيف.`);
  if (hint) out.push(String(hint).trim().replace(/[.。]*$/, '.'));
  if (feats.length) out.push('المميزات: ' + feats.join('، ') + '.');
  if (size) out.push(`المقاس: ${size}.`);
  out.push(sec ? `مناسب لقسم ${sec}، وسهل في التركيب.` : 'مناسب للمطابخ وغرف الدريسنج، وسهل في التركيب.');
  out.push('للطلب أو الاستفسار كلمنا على الواتساب.');
  return out.join(' ');
}

async function describe(name, imageBuf, { hint = '', sec = '' } = {}) {
  hint = String(hint || '').trim();
  try {
    if (process.env.ANTHROPIC_API_KEY) return await viaClaude(name, imageBuf, hint, sec);
    if (process.env.GEMINI_API_KEY) return await viaGemini(name, imageBuf, hint, sec);
  } catch (e) { console.error('describe AI:', e.message); }
  return local(name, hint, sec);
}

const aiOn = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
module.exports = { describe, aiOn, post };
