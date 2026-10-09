// 🎬 فيديو للسوشيال (مونتاج احترافي): بيشيل السكتات، ويكتب ترجمة على الشاشة، ويركّب جرافيك متحرك
// (لوجو + عنوان بيشد + الاسم والكود والواتساب + زووم + شريط تقدّم + «اطلب على الواتساب» + خاتمة)
// بكل مقاسات المنصات، وبيكتب العنوان والبوست والهاشتاجات بالعامية بالذكاء الاصطناعي. الخط الرسمي: Cairo.
process.env.FONTCONFIG_CACHE ||= require('os').tmpdir();
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const { post, aiOn } = require('./describe');
const { frameImage } = require('./frame');

const FRAME = path.join(__dirname, '..', 'assets', 'frame.png');
const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
const FORMATS = {
  v: { w: 1080, h: 1920, top: 380, bot: 300, cap: 64, label: 'طولي — ريلز وتيك توك وشورتس' },
  s: { w: 1080, h: 1080, top: 180, bot: 170, cap: 46, label: 'مربع — بوست فيسبوك وإنستجرام' },
  l: { w: 1920, h: 1080, top: 130, bot: 130, cap: 50, label: 'عرضي — يوتيوب' },
};
const TEAL = '#087f8c', GOLD = '#c9971f', INK = '#12343a', OUTRO = 2.5, FPS = 30;

// ---------- ffmpeg ----------
function ff(args, allowFail) {
  return new Promise((ok, no) => {
    const p = spawn(ffmpeg, ['-hide_banner', ...args], { windowsHide: true });
    let err = ''; p.stderr.on('data', d => { err += d; if (err.length > 200000) err = err.slice(-200000); });
    p.on('error', no);
    p.on('close', c => (c === 0 || allowFail) ? ok(err) : no(new Error('ffmpeg: ' + err.slice(-600))));
  });
}
async function probe(file) {
  const out = await ff(['-i', file], true);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out), v = /Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(out);
  const rot = /rotate\s*:\s*(-?\d+)|displaymatrix: rotation of (-?[\d.]+)/.exec(out), r = rot ? Math.abs(Math.round(+(rot[1] || rot[2]))) % 180 : 0;
  let w = v ? +v[1] : 1280, h = v ? +v[2] : 720; if (r === 90) [w, h] = [h, w];
  return { dur: m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0, audio: /Stream #[^\n]*Audio:/.test(out), w, h };
}

// ---------- نصوص وصور الجرافيك (بخط Cairo) ----------
const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const FW = { x: ['ExtraBold', 'Cairo-ExtraBold.ttf'], b: ['Bold', 'Cairo-Bold.ttf'], s: ['SemiBold', 'Cairo-SemiBold.ttf'] };
const text = (t, { size = 48, color = '#fff', width = 1000, weight = 'b', align = 'centre' } = {}) => {
  const [wn, wf] = FW[weight];
  return sharp({ text: { text: `<span foreground="${color}">${esc(t)}</span>`, font: `Cairo ${wn} ${size}`, fontfile: path.join(FONTS, wf), rgba: true, align, width, wrap: 'word', spacing: Math.round(size * -0.15) } }).png().toBuffer();
};
const svg = (w, h, inner) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);
const meta = async b => sharp(b).metadata();
const logo = async h => sharp(FRAME).extract({ left: 600, top: 6, width: 250, height: 110 }).flatten({ background: '#ffffff' }).resize({ height: h }).png().toBuffer();
const canvas = (w, h, layers, file) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toFile(file);
const ctr = async (buf, W, y) => ({ input: buf, top: Math.round(y), left: Math.round((W - (await meta(buf)).width) / 2) });

// شريط فوق (لوجو) + شريط تحت (الاسم والكود والواتساب) + العنوان + «اطلب على الواتساب» + شريط التقدّم
async function graphics(F, o, dir, key) {
  const { w: W, top, bot } = F, P = n => path.join(dir, `${n}-${key}.png`), out = {};
  const isL = F === FORMATS.l, lh = F === FORMATS.v ? 120 : isL ? top - 44 : 76;
  const head = [{ input: svg(W, top, `<rect width="${W}" height="${top}" fill="#fff"/><rect y="${top - 7}" width="${W}" height="7" fill="${GOLD}"/>`), top: 0, left: 0 }];
  head.push(isL ? { input: await logo(lh), top: 22, left: 34 } : await ctr(await logo(lh), W, 24));
  await canvas(W, top, head, out.head = P('head'));
  if (o.hook) {
    const t = await text(o.hook, { size: F === FORMATS.v ? 66 : isL ? 50 : 46, color: TEAL, width: isL ? W - 480 : W - 90, weight: 'x', align: isL ? 'right' : 'centre' });
    const m = await meta(t); out.hookPng = P('hook'); await sharp(t).png().toFile(out.hookPng);
    out.hookX = isL ? W - 40 - m.width : Math.round((W - m.width) / 2); out.hookY = isL ? Math.round((top - m.height) / 2) : lh + 44;
  }
  const foot = [{ input: svg(W, bot, `<rect width="${W}" height="${bot}" fill="#fff"/><rect width="${W}" height="7" fill="${GOLD}"/>`), top: 0, left: 0 }];
  const nm = await text(o.name, { size: F === FORMATS.v ? 54 : 42, color: INK, width: W - 80, weight: 'x' }), nmH = (await meta(nm)).height;
  foot.push(await ctr(nm, W, 26));
  const line = [o.code ? 'كود ' + o.code : '', o.phone ? 'للطلب واتساب ' + o.phone : ''].filter(Boolean).join('   •   ');
  if (line) foot.push(await ctr(await text(line, { size: F === FORMATS.v ? 40 : 32, color: GOLD, width: W - 80 }), W, 26 + nmH + 14));
  await canvas(W, bot, foot, out.foot = P('foot'));
  await canvas(W, 10, [{ input: svg(W, 10, `<rect width="${W}" height="10" fill="${GOLD}"/>`), top: 0, left: 0 }], out.bar = P('bar'));
  const ct = await text('اطلبه على الواتساب', { size: F === FORMATS.v ? 46 : 36, color: '#fff', width: W - 200, weight: 'x' }), cm = await meta(ct);
  const bw = cm.width + 70, bh = cm.height + 36;
  await canvas(bw, bh, [{ input: svg(bw, bh, `<rect width="${bw}" height="${bh}" rx="${bh / 2}" fill="#1f9d55"/>`), top: 0, left: 0 }, { input: ct, top: 18, left: 35 }], out.cta = P('cta'));
  out.ctaW = bw; out.ctaH = bh;
  return out;
}
// الخاتمة: لوجو كبير + الاسم + اطلب على الواتساب + الرقم
async function outro(F, o, file) {
  const { w: W, h: H } = F, big = F === FORMATS.v;
  const lg = await logo(big ? 240 : 170), nm = await text(o.name, { size: big ? 64 : 48, color: INK, width: W - 160, weight: 'x' });
  const cta = await text('اطلبه دلوقتي على الواتساب', { size: big ? 54 : 42, color: TEAL, width: W - 160, weight: 'x' });
  const ph = o.phone ? await text(o.phone, { size: big ? 96 : 72, color: GOLD, width: W - 160, weight: 'x' }) : null;
  const hs = [await meta(lg), await meta(nm), await meta(cta), ph ? await meta(ph) : { height: 0 }].map(m => m.height);
  let y = (H - (hs[0] + 50 + hs[1] + 60 + hs[2] + 18 + hs[3])) / 2; const L = [{ input: svg(W, H, `<rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="44" fill="none" stroke="${GOLD}" stroke-width="10"/>`), top: 0, left: 0 }];
  L.push(await ctr(lg, W, y)); y += hs[0] + 50; L.push(await ctr(nm, W, y)); y += hs[1] + 60; L.push(await ctr(cta, W, y)); y += hs[2] + 18; if (ph) L.push(await ctr(ph, W, y));
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(L).jpeg({ quality: 92 }).toFile(file);
}

// ---------- ✂️ شيل السكتات ----------
async function cutSilence(src, dir, start, len) {
  const out = await ff(['-ss', String(start), '-t', String(len), '-i', src, '-af', 'silencedetect=noise=-32dB:d=0.55', '-f', 'null', '-'], true);
  const S = [...out.matchAll(/silence_start: ([\d.]+)/g)].map(m => +m[1]), E = [...out.matchAll(/silence_end: ([\d.]+)/g)].map(m => +m[1]);
  const sil = S.map((s, i) => [s, E[i] != null ? E[i] : len]).filter(([a, b]) => b - a >= 0.55);
  if (!sil.length) return null;
  const pad = 0.12, keep = []; let t = 0;
  for (const [a, b] of sil) { const k0 = Math.max(0, t - (t ? pad : 0)), k1 = Math.min(len, a + pad); if (k1 - k0 > 0.25) keep.push([k0, k1]); t = b; }
  if (len - t > 0.25) keep.push([Math.max(0, t - pad), len]);
  const kept = keep.reduce((s, [a, b]) => s + b - a, 0), removed = len - kept;
  if (removed < 0.8 || kept < len * 0.3 || keep.length > 80) return null;      // مفيش سكتات تذكر، أو الفيديو كله موسيقى
  const expr = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+'), file = path.join(dir, 'cut.mp4');
  await ff(['-y', '-ss', String(start), '-t', String(len), '-i', src, '-vf', `select='${expr}',setpts=N/FRAME_RATE/TB`, '-af', `aselect='${expr}',asetpts=N/SR/TB`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', file]);
  return { file, len: kept, removed };
}

// ---------- الذكاء الاصطناعي ----------
const MODELS = () => [...new Set([process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))];
async function gemini(parts, schema, temp) {
  let last = '';
  for (const m of MODELS()) {
    try {
      const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: temp, maxOutputTokens: 6000, responseMimeType: 'application/json', responseSchema: schema } }));
      if (r.status !== 200) { last = m + ' ' + r.status; continue; }
      return JSON.parse(((((r.json.candidates || [])[0] || {}).content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join(''));
    } catch (e) { last = e.message; }
  }
  throw new Error('الذكاء الاصطناعي مش متاح دلوقتي (' + last + ')');
}
async function frames(src, dir, start, len, n = 6) {
  await ff(['-y', '-ss', String(start), '-t', String(len), '-i', src, '-vf', `fps=${(n / Math.max(1, len)).toFixed(4)},scale=512:-2`, '-frames:v', String(n), '-q:v', '5', path.join(dir, 'ai-%d.jpg')]);
  const out = []; for (let i = 1; i <= n; i++) { try { out.push(await fs.readFile(path.join(dir, `ai-${i}.jpg`))); await fs.rm(path.join(dir, `ai-${i}.jpg`)); } catch {} }
  return out;
}
const TSCHEMA = { type: 'OBJECT', properties: { hook: { type: 'STRING' }, post: { type: 'STRING' }, tiktok: { type: 'STRING' }, yt_title: { type: 'STRING' }, yt_desc: { type: 'STRING' },
  names: { type: 'ARRAY', items: { type: 'STRING' } }, hashtags: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['hook', 'post', 'hashtags'] };
async function writeTexts(imgs, o, said) {
  const prompt = `أنت كاتب محتوى سوشيال ميديا محترف لمحل «ميكانيزم» لإكسسوارات المطابخ والدريسنج روم ولوازم الورش في مصر.\n` +
    `دي لقطات من فيديو للمنتج: "${o.name}"${o.code ? ` (كود ${o.code})` : ''}.\n` + (said ? `الكلام اللي اتقال في الفيديو: «${said.slice(0, 1500)}»\n` : '') + (o.notes ? `ملاحظات صاحب المحل: ${o.notes}\n` : '') +
    (o.title ? `العنوان اللي صاحب المحل اختاره (حطه في hook زي ما هو): ${o.title}\n` : '') +
    `اكتب بالعامية المصرية:\n- hook: عنوان قصير جداً (من ٤ لـ ٩ كلمات) بيشد، بيتكلم عن المشكلة اللي المنتج بيحلها أو فايدته، زي «حل مشكلة الضلفة اللي بتقع من الدراع» أو «عايز ترباس مخفي جوه الخشب ومش باين؟». من غير اسم المحل.\n` +
    `- post: بوست فيسبوك وإنستجرام من ٣ لـ ٦ سطور: يبدأ بالمشكلة، يشرح المنتج وفايدته من اللي باين في الفيديو، وينتهي بدعوة للطلب على الواتساب. إيموجي بسيط مسموح.\n` +
    `- tiktok: كابشن قصير لتيك توك والريلز (سطر أو اتنين).\n- yt_title: عنوان يوتيوب أقل من ٨٠ حرف فيه اسم المنتج والمشكلة.\n- yt_desc: وصف يوتيوب من ٣ لـ ٤ سطور.\n` +
    `- names: الأسماء اللي الناس في مصر بتدوّر بيها على المنتج: الاسم الرسمي والأسماء الدارجة بالعامية (زي «دراع باكم» أو «مكبس» أو «بستم» لو بتنطبق)، من ٣ لـ ٦.\n` +
    `- hashtags: من ١٠ لـ ١٥ هاشتاج بالعربي من غير علامة #، والكلمات متوصلة بـ _ ، فيها اسم الصنف وأسماؤه الدارجة واستخداماته (مطابخ، دريسنج، نجارة، ورش) وميكانيزم.\nمتخترعش مواصفات مش باينة، ومتكتبش أسعار.`;
  const j = await gemini([...imgs.map(b => ({ inline_data: { mime_type: 'image/jpeg', data: b.toString('base64') } })), { text: prompt }], TSCHEMA, 0.8);
  const tags = [...new Set([...(j.hashtags || []), 'ميكانيزم', 'اكسسوارات_مطابخ', 'دريسنج_روم'].map(h => String(h).replace(/^#/, '').trim().replace(/\s+/g, '_')).filter(Boolean))].slice(0, 18);
  return { hook: j.hook || '', post: j.post || '', tiktok: j.tiktok || '', yt_title: j.yt_title || '', yt_desc: j.yt_desc || '', names: j.names || [], hashtags: tags };
}
// 💬 ترجمة على الشاشة: الذكاء الاصطناعي بيسمع الكلام ويقسمه جمل قصيرة بمواعيدها
const CSCHEMA = { type: 'OBJECT', properties: { segments: { type: 'ARRAY', items: { type: 'OBJECT', properties: { s: { type: 'NUMBER' }, e: { type: 'NUMBER' }, t: { type: 'STRING' } }, required: ['s', 'e', 't'] } } }, required: ['segments'] };
async function transcribe(src, dir, start, len) {
  const a = path.join(dir, 'speech.mp3');
  await ff(['-y', '-ss', String(start), '-t', String(len), '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', a]);
  const buf = await fs.readFile(a); await fs.rm(a, { force: true });
  const j = await gemini([{ inline_data: { mime_type: 'audio/mp3', data: buf.toString('base64') } }, { text:
    `ده صوت فيديو قصير لمحل إكسسوارات مطابخ في مصر (مدته ${len.toFixed(1)} ثانية). اكتب الكلام اللي بيتقال بالعامية المصرية زي ما هو بالظبط، ` +
    `مقسم لجمل قصيرة (من ٢ لـ ٦ كلمات) عشان تتكتب ترجمة على الفيديو. لكل جملة s وقت البداية و e وقت النهاية بالثواني من أول الصوت. ` +
    `لو مفيش كلام (موسيقى أو صوت ماكينة بس) رجّع segments فاضية. متضيفش كلام مااتقالش.` }], CSCHEMA, 0.1);
  return (j.segments || []).map(x => ({ s: Math.max(0, +x.s || 0), e: Math.min(len, +x.e || 0), t: String(x.t || '').trim() })).filter(x => x.t && x.e - x.s > 0.2).sort((a, b) => a.s - b.s);
}
// الترجمة بتتحول لصور (عشان العربي يطلع صح) وتتجمع في شريط واحد بمواعيده
async function captionTrack(F, segs, dir, key, len) {
  const W = F.w, list = [], blank = path.join(dir, `cb-${key}.png`);
  const T = []; for (const g of segs) { const tx = await text(g.t, { size: F.cap, color: '#ffffff', width: W - 160, weight: 'x' }); T.push({ tx, m: await meta(tx) }); }
  const ch = Math.max(...T.map(x => x.m.height + 30), Math.round(F.cap * 2)) + 4;     // على قد أطول جملة (حتى لو سطرين)
  await canvas(W, ch, [], blank);
  let t = 0, i = 0;
  for (const g of segs) {
    if (g.s > t + 0.02) { list.push(`file '${blank.replace(/\\/g, '/')}'`, `duration ${(g.s - t).toFixed(3)}`); }
    const { tx, m } = T[i];
    const bw = Math.min(W - 40, m.width + 60), bh = m.height + 30, f = path.join(dir, `c${i++}-${key}.png`);
    await canvas(W, ch, [{ input: svg(bw, bh, `<rect width="${bw}" height="${bh}" rx="22" fill="#000" fill-opacity="0.62"/>`), top: ch - bh, left: Math.round((W - bw) / 2) },
      { input: tx, top: ch - bh + 15, left: Math.round((W - m.width) / 2) }], f);
    list.push(`file '${f.replace(/\\/g, '/')}'`, `duration ${(Math.max(g.e, g.s + 0.3) - Math.max(g.s, t)).toFixed(3)}`); t = Math.max(g.e, g.s + 0.3);
  }
  if (len > t) list.push(`file '${blank.replace(/\\/g, '/')}'`, `duration ${(len - t + 0.5).toFixed(3)}`);
  list.push(`file '${blank.replace(/\\/g, '/')}'`);
  const lf = path.join(dir, `caps-${key}.txt`); await fs.writeFile(lf, list.join('\n'));
  return { list: lf, h: ch };
}

// ---------- التجميع: فيديو بمقاس واحد ----------
async function render(work, dir, key, o, start, len, info, opts, segs, onProgress) {
  const F = FORMATS[key], { w: W, h: H, top, bot } = F, mh = H - top - bot;
  const g = await graphics(F, o, dir, key), en = path.join(dir, `end-${key}.jpg`), out = path.join(dir, `${key}.mp4`);
  await outro(F, o, en);
  // مقاس الفيديو في النص (بيتحسب عشان الزووم)
  const k = Math.min((W - 40) / info.w, mh / info.h), fw = Math.round(info.w * k / 2) * 2, fh = Math.round(info.h * k / 2) * 2;
  const inp = ['-ss', String(start), '-t', String(len), '-i', work], fc = [];
  const add = (args) => { inp.push(...args); return (inp.filter(x => x === '-i').length - 1); };
  const iHead = add(['-loop', '1', '-i', g.head]), iFoot = add(['-loop', '1', '-i', g.foot]), iBar = add(['-loop', '1', '-i', g.bar]), iCta = add(['-loop', '1', '-i', g.cta]);
  const iHook = g.hookPng ? add(['-loop', '1', '-i', g.hookPng]) : -1;
  const cap = segs && segs.length ? await captionTrack(F, segs, dir, key, len) : null;
  const iCap = cap ? add(['-f', 'concat', '-safe', '0', '-i', cap.list]) : -1;
  const iEnd = add(['-loop', '1', '-t', String(OUTRO), '-i', en]), iSil = add(['-f', 'lavfi', '-t', String(len + OUTRO + 1), '-i', 'anullsrc=r=44100:cl=stereo']);
  const mo = opts.motion !== false, L = len.toFixed(3);
  fc.push(`[0:v]fps=${FPS},split[a0][b0]`, `[a0]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=25:3,eq=brightness=-0.04[bg]`);
  fc.push(mo ? `[b0]scale=${fw}:${fh},zoompan=z='min(zoom+0.0005,1.07)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${fw}x${fh}:fps=${FPS}[fg]` : `[b0]scale=${fw}:${fh}[fg]`);
  fc.push(`[bg][fg]overlay=(W-w)/2:${top}+(${mh}-h)/2[m0]`);
  let cur = 'm0', n = 0; const ov = (inLbl, x, y, extra = '') => { const o2 = `m${++n}`; fc.push(`[${cur}][${inLbl}]overlay=x=${x}:y=${y}${extra}[${o2}]`); cur = o2; };
  if (iCap >= 0) { fc.push(`[${iCap}:v]format=rgba[cap]`); ov('cap', 0, `${top + mh - cap.h - 70}`, ':eof_action=pass'); }
  if (mo) { fc.push(`[${iCta}:v]format=rgba,fade=in:st=${(len * 0.55).toFixed(2)}:d=0.35:alpha=1,fade=out:st=${(len * 0.55 + 2.8).toFixed(2)}:d=0.35:alpha=1[cta]`); ov('cta', `(W-w)/2`, `${top + 40}`, ':shortest=1'); }
  ov(`${iHead}:v`, 0, mo ? `'if(lt(t,0.45),-h+h*t/0.45,0)'` : 0, ':shortest=1');
  if (iHook >= 0) { fc.push(`[${iHook}:v]format=rgba${mo ? ',fade=in:st=0.45:d=0.6:alpha=1' : ''}[hk]`); ov('hk', g.hookX, mo ? `'if(lt(t,0.45),${g.hookY}-30,if(lt(t,1.05),${g.hookY}-30+30*(t-0.45)/0.6,${g.hookY}))'` : g.hookY, ':shortest=1'); }
  ov(`${iFoot}:v`, 0, mo ? `'if(lt(t,0.5),H-h*t/0.5,H-h)'` : 'H-h', ':shortest=1');
  if (mo) ov(`${iBar}:v`, `'-w+w*t/${L}'`, `${H - bot - 10}`, ':shortest=1');
  fc.push(`[${cur}]setsar=1,format=yuv420p[main]`, `[${iEnd}:v]scale=${W}:${H},fps=${FPS},setsar=1,format=yuv420p${mo ? ',fade=in:st=0:d=0.3' : ''}[end]`);
  if (info.audio) fc.push(`[0:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=0:${L},asetpts=PTS-STARTPTS[ma]`, `[${iSil}:a]atrim=0:${OUTRO},asetpts=PTS-STARTPTS[ea]`);
  else fc.push(`[${iSil}:a]asplit=2[n1][n2]`, `[n1]atrim=0:${L},asetpts=PTS-STARTPTS[ma]`, `[n2]atrim=0:${OUTRO},asetpts=PTS-STARTPTS[ea]`);
  fc.push(`[main][ma][end][ea]concat=n=2:v=1:a=1[v][a]`);
  onProgress && onProgress(`بجهّز ${F.label}…`);
  await ff(['-y', ...inp, '-filter_complex', fc.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  for (const f of await fs.readdir(dir)) if (new RegExp(`-${key}\\.(png|jpg|txt)$`).test(f)) await fs.rm(path.join(dir, f), { force: true });
  return `${key}.mp4`;
}

// ---------- الشغل كله ----------
async function processVideo(dir, m, save) {
  const src = path.join(dir, m.src), opts = Object.assign({ silence: true, captions: true, motion: true }, m.opts || {});
  const set = async (step, extra) => { Object.assign(m, { step }, extra || {}); await save(m); };
  try {
    const p = await probe(src);
    if (!p.dur) throw new Error('الفيديو ده مش بيتقري، جرّب فيديو mp4 تاني');
    let start = Math.max(0, Math.min(+m.start || 0, p.dur - 1)), end = Math.min(+m.end || p.dur, p.dur), len = Math.max(1, end - start), work = src;
    Object.assign(m, { dur: p.dur });
    if (opts.silence && p.audio) {
      await set('✂️ بشيل السكتات…');
      try { const c = await cutSilence(src, dir, start, len); if (c) { work = c.file; start = 0; len = c.len; m.removed = Math.round(c.removed * 10) / 10; } } catch (e) { m.cutErr = e.message; }
    }
    m.len = Math.round(len * 10) / 10;
    let segs = [];
    if (aiOn() && opts.captions && p.audio) {
      await set('💬 الذكاء الاصطناعي بيسمع الكلام ويكتب الترجمة…');
      try { segs = await transcribe(work, dir, start, len); m.captions = segs; } catch (e) { m.capErr = e.message; }
    }
    if (aiOn() && !m.ai) {
      await set('🧠 الذكاء الاصطناعي بيتفرج على الفيديو ويكتب العنوان والبوست…');
      try { m.ai = await writeTexts(await frames(work, dir, start, len), m, segs.map(s => s.t).join(' ')); } catch (e) { m.aiErr = e.message; }
    }
    const o = { hook: m.title || (m.ai && m.ai.hook) || '', name: m.name, code: m.code, phone: m.phone };
    m.files = m.files || {};
    for (const k of m.formats) { m.files[k] = await render(work, dir, k, o, start, len, p, opts, segs, s => set('🎬 ' + s)); await save(m); }
    await set('🖼️ بعمل صورة الغلاف…');
    const ct = Math.min(Math.max(m.cover_t != null ? +m.cover_t : (+m.start || 0) + len / 3, 0), p.dur - 0.1), raw = path.join(dir, 'cover-raw.jpg');
    await ff(['-y', '-ss', String(ct), '-i', src, '-frames:v', '1', '-q:v', '2', raw]);
    await fs.writeFile(path.join(dir, 'cover.jpg'), await frameImage(await fs.readFile(raw), m.code));
    await fs.rm(raw, { force: true }); if (work !== src) await fs.rm(work, { force: true });
    m.files.cover = 'cover.jpg';
    await set('', { status: 'done', done: new Date().toISOString() });
  } catch (e) { await set('', { status: 'failed', err: e.message }); }
}

module.exports = { FORMATS, processVideo };
