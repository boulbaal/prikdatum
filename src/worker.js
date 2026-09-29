// Prikdatum — de volledige API in één Worker.
// Alle antwoorden zijn JSON met Cache-Control: no-store.
// Fouten: { "error": "<code>" } met HTTP 400/404; de frontend vertaalt de codes.

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const SITE = 'https://whenly.vanali.workers.dev';

// Titel en omschrijving per taal voor de taalpagina's (/nl/, /ar/ ...). Moeten
// gelijk zijn aan make.title en make.tagline in public/index.html (test bewaakt dit).
const META = {
  en: { rtl: false, title: 'When shall we meet?', desc: 'Pick a date together. No account, no fuss.' },
  nl: { rtl: false, title: 'Wanneer spreken we af?', desc: 'Prik samen een datum. Zonder account, zonder gedoe.' },
  fr: { rtl: false, title: 'Quand se voit-on ?', desc: 'Trouvez une date ensemble. Sans compte, sans tracas.' },
  de: { rtl: false, title: 'Wann treffen wir uns?', desc: 'Findet gemeinsam einen Termin. Ohne Konto, ohne Aufwand.' },
  es: { rtl: false, title: '¿Cuándo quedamos?', desc: 'Elegid una fecha juntos. Sin cuenta, sin complicaciones.' },
  pt: { rtl: false, title: 'Quando nos encontramos?', desc: 'Escolham uma data juntos. Sem conta, sem complicações.' },
  pl: { rtl: false, title: 'Kiedy się spotykamy?', desc: 'Wybierzcie datę razem. Bez konta, bez zachodu.' },
  uk: { rtl: false, title: 'Коли зустрічаємось?', desc: 'Оберіть дату разом. Без акаунта, без клопоту.' },
  ru: { rtl: false, title: 'Когда встречаемся?', desc: 'Выберите дату вместе. Без аккаунта, без хлопот.' },
  tr: { rtl: false, title: 'Ne zaman buluşuyoruz?', desc: 'Birlikte bir tarih seçin. Hesap yok, uğraş yok.' },
  ar: { rtl: true,  title: 'متى نلتقي؟', desc: 'اختاروا موعداً معاً. بدون حساب، بدون تعقيد.' },
  ur: { rtl: true,  title: 'ہم کب ملیں؟', desc: 'مل کر ایک تاریخ چنیں۔ کوئی اکاؤنٹ نہیں، کوئی جھنجھٹ نہیں۔' },
  hi: { rtl: false, title: 'हम कब मिलें?', desc: 'साथ मिलकर एक तारीख़ चुनें। कोई अकाउंट नहीं, कोई झंझट नहीं।' },
  bn: { rtl: false, title: 'আমরা কবে দেখা করব?', desc: 'একসাথে একটি তারিখ বেছে নিন। কোনো অ্যাকাউন্ট নেই, কোনো ঝামেলা নেই।' },
  id: { rtl: false, title: 'Kapan kita bertemu?', desc: 'Pilih tanggal bersama. Tanpa akun, tanpa ribet.' },
  vi: { rtl: false, title: 'Khi nào chúng ta gặp nhau?', desc: 'Cùng chọn một ngày. Không cần tài khoản, không rắc rối.' },
  zh: { rtl: false, title: '我们什么时候见面？', desc: '一起选个日期。无需账号，轻松搞定。' },
  ja: { rtl: false, title: 'いつ会いましょう？', desc: 'みんなで日程を決めよう。アカウント不要、手間なし。' },
  ko: { rtl: false, title: '언제 만날까요?', desc: '함께 날짜를 정하세요. 계정 없이, 번거로움 없이.' },
  sw: { rtl: false, title: 'Tukutane lini?', desc: 'Pangeni tarehe pamoja. Bila akaunti, bila usumbufu.' },
  zgh: { rtl: false, title: 'ⵎⴰⵏⴰⴳ ⴰⴷ ⵏⵎⵢⴰⴳⴰⵔ?', desc: 'ⵙⵜⵉⵜ ⴰⵙⵙ ⵙ ⵓⵎⵢⴰⵡⴰⵙ. ⴱⵍⴰ ⴰⵎⵉⴹⴰⵏ, ⴱⵍⴰ ⴰⵖⵓⵏ.' },
  ku: { rtl: false, title: 'Kengî em hev bibînin?', desc: 'Bi hev re rojekê hilbijêrin. Bê hesab, bê zehmet.' },
  sn: { rtl: false, title: 'Tosangana rinhi?', desc: 'Sarudzai zuva pamwe chete. Hapana account, hapana nyaya.' },
};
const OG_LOCALE = { en: 'en_GB', nl: 'nl_BE', fr: 'fr_BE', de: 'de_DE', es: 'es_ES', pt: 'pt_PT', pl: 'pl_PL', uk: 'uk_UA', ru: 'ru_RU', tr: 'tr_TR', ar: 'ar_EG', ur: 'ur_PK', hi: 'hi_IN', bn: 'bn_BD', id: 'id_ID', vi: 'vi_VN', zh: 'zh_CN', ja: 'ja_JP', ko: 'ko_KR', sw: 'sw_KE', zgh: 'zgh_MA', ku: 'ku_TR', sn: 'sn_ZW' };

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// hreflang-links voor alle talen plus x-default (de startpagina in het Engels).
function hreflangLinks() {
  const out = [`<link rel="alternate" hreflang="x-default" href="${SITE}/">`];
  for (const l of Object.keys(META)) out.push(`<link rel="alternate" hreflang="${l}" href="${SITE}/${l}/">`);
  return out.join('\n');
}

// Startpagina in één taal: dezelfde app, met vertaalde <title>, omschrijving en
// OG-tags, zodat zoekmachines en deel-previews per taal iets zinnigs tonen.
async function taalPagina(env, request, lang) {
  const asset = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));
  if (!asset.ok) return asset;
  let html = await asset.text();
  const m = META[lang];
  const canon = `${SITE}/${lang}/`;
  const title = escHtml(m.title + ' · Whenly');
  const desc = escHtml(m.desc + ' ' + (lang === 'en' ? 'Free forever.' : ''));
  html = html
    .replace('<html lang="en">', `<html lang="${lang}"${m.rtl ? ' dir="rtl"' : ''}>`)
    .replace('<title>Whenly</title>', `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${desc.trim()}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${desc.trim()}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canon}">\n<meta property="og:locale" content="${OG_LOCALE[lang]}">`)
    .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`)
    .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${desc.trim()}">`)
    .replace('</head>', `<link rel="canonical" href="${canon}">\n${hreflangLinks()}\n</head>`);
  return htmlResponse(html, asset);
}

// Startpagina zelf: alleen hreflang + canonical toevoegen.
async function startPagina(env, request) {
  const asset = await env.ASSETS.fetch(request);
  if (!asset.ok) return asset;
  let html = await asset.text();
  html = html.replace('</head>', `<link rel="canonical" href="${SITE}/">\n${hreflangLinks()}\n</head>`);
  return htmlResponse(html, asset);
}

function htmlResponse(html, van) {
  const h = new Headers(van.headers);
  h.set('Content-Type', 'text/html; charset=utf-8');
  h.delete('Content-Length');
  h.delete('ETag');
  return new Response(html, { status: 200, headers: h });
}

// Afspraakpagina: de app zelf, maar niet indexeerbaar (titels en namen zijn privé).
async function afspraakPagina(env, request) {
  const asset = await env.ASSETS.fetch(request);
  const h = new Headers(asset.headers);
  h.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(asset.body, { status: asset.status, headers: h });
}

// Rate limiting per IP (Cloudflare Rate Limiting binding). Zonder binding of
// zonder CF-Connecting-IP (lokale dev) wordt niets beperkt.
async function teVeel(env, request, binding) {
  const rl = env[binding];
  const ip = request.headers.get('CF-Connecting-IP');
  if (!rl || !ip) return false;
  // lokale dev (wrangler dev geeft 127.0.0.1 mee): niet beperken, zodat de testsuite kan draaien.
  // In productie zet Cloudflare hier nooit een loopback-adres.
  if (ip === '127.0.0.1' || ip === '::1') return false;
  try {
    const { success } = await rl.limit({ key: ip });
    return !success;
  } catch (e) {
    console.error('ratelimit', binding, e);
    return false;
  }
}

// Wordt bij het deployen vervangen door het korte git-commitnummer.
const RAW_VERSION = '__VERSION__';
const APP_VERSION = RAW_VERSION.startsWith('__') ? 'dev' : RAW_VERSION;

const MAX_BODY = 20 * 1024; // 20 KB
const MAX_PARTICIPANTS = 100; // zachte grens tegen misbruik
const MAX_OPTIONS = 100;      // max aantal dagen per afspraak
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function fail(code, status = 400) {
  return json({ error: code }, status);
}

// 10 tekens uit [a-z0-9] met crypto.getRandomValues (≈ 52 bits).
// Verwerp bytes >= 252 zodat modulo 36 geen bias geeft.
function newId() {
  let out = '';
  while (out.length < 10) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < 252 && out.length < 10) out += ID_ALPHABET[b % 36];
    }
  }
  return out;
}

function now() {
  return new Date().toISOString();
}

function normKey(name) {
  return name.toLowerCase().replace(/\s+/g, ' ');
}

function cleanTitle(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length >= 1 && t.length <= 80 ? t : null;
}

function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const n = raw.trim();
  return n.length >= 1 && n.length <= 40 ? n : null;
}

function validDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}

function validTime(t) {
  if (t === null || t === undefined || t === '') return true; // wordt NULL
  if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// Leest en parset de body; null bij ongeldig of te groot.
async function readBody(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (text.length > MAX_BODY) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Zet ruwe opties om naar een gededupliceerde lijst [{date, time}].
// Ongeldige items worden stil overgeslagen; dubbels (zelfde dag) samengevoegd.
function cleanOptions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue;
    if (!validDate(o.date) || !validTime(o.time)) continue;
    const time = o.time ? o.time : null;
    if (seen.has(o.date)) continue;
    seen.add(o.date);
    out.push({ date: o.date, time });
  }
  return out;
}

async function getPoll(env, id) {
  return env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
}

// Elke wijziging of bezoek telt als activiteit; afspraken zonder activiteit
// worden na ACTIVITEIT_DAGEN opgeruimd (zie scheduled()).
const ACTIVITEIT_DAGEN = 365;
const WEGGEHAALD_DAGEN = 30;
function raak(env, pollId) {
  return env.DB.prepare('UPDATE polls SET last_activity_at = ? WHERE id = ?').bind(now(), pollId);
}

async function getFullPoll(env, id) {
  const poll = await getPoll(env, id);
  if (!poll) return null;
  const [optRes, partRes, voteRes] = await env.DB.batch([
    env.DB.prepare(
      'SELECT id, date, time, added_by FROM options WHERE poll_id = ? ORDER BY date, time'
    ).bind(id),
    env.DB.prepare(
      'SELECT id, name, deleted_at FROM participants WHERE poll_id = ? ORDER BY created_at, id'
    ).bind(id),
    env.DB.prepare(
      `SELECT v.participant_id, v.option_id
         FROM votes v JOIN options o ON o.id = v.option_id
        WHERE o.poll_id = ?`
    ).bind(id),
  ]);
  const actief = partRes.results.filter((p) => !p.deleted_at);
  const weggehaald = partRes.results.filter((p) => p.deleted_at);
  const votesByOption = new Map();
  for (const v of voteRes.results) {
    if (!votesByOption.has(v.option_id)) votesByOption.set(v.option_id, []);
    votesByOption.get(v.option_id).push(v.participant_id);
  }
  return {
    id: poll.id,
    title: poll.title,
    finalOptionId: poll.final_option_id,
    visits: poll.visits ?? 0,
    options: optRes.results.map((o) => ({
      id: o.id,
      date: o.date,
      time: o.time,
      addedBy: o.added_by,
      votes: votesByOption.get(o.id) || [],
    })),
    participants: actief.map((p) => ({ id: p.id, name: p.name })),
    // info voor de groep: "iemand heeft X weggehaald" (geen fout van de app)
    removed: weggehaald.map((p) => ({ name: p.name, deletedAt: p.deleted_at })),
  };
}

// POST /api/polls — afspraak maken (opties zijn optioneel; die komen via de kalender)
async function createPoll(env, body) {
  const title = cleanTitle(body.title);
  if (!title) return fail('title_required');
  const name = cleanName(body.name);
  if (!name) return fail('name_required');
  const options = cleanOptions(body.options);
  if (options.length > 30) return fail('invalid_date');

  const pollId = newId();
  const participantId = newId();
  const ts = now();
  const stmts = [
    env.DB.prepare('INSERT INTO polls (id, title, final_option_id, created_at) VALUES (?, ?, NULL, ?)')
      .bind(pollId, title, ts),
    env.DB.prepare('INSERT INTO participants (id, poll_id, name, name_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(participantId, pollId, name, normKey(name), ts),
  ];
  for (const o of options) {
    const optionId = newId();
    stmts.push(
      env.DB.prepare('INSERT INTO options (id, poll_id, date, time, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(optionId, pollId, o.date, o.time, participantId, ts)
    );
    stmts.push(
      env.DB.prepare('INSERT INTO votes (participant_id, option_id) VALUES (?, ?)')
        .bind(participantId, optionId)
    );
  }
  await env.DB.batch(stmts);
  return json({ id: pollId, participantId }, 201);
}

// 5.3 POST /api/polls/:id/participants
async function joinPoll(env, pollId, body) {
  const poll = await getPoll(env, pollId);
  if (!poll) return fail('not_found', 404);
  const name = cleanName(body.name);
  if (!name) return fail('name_required');
  const key = normKey(name);
  const existing = await env.DB.prepare(
    'SELECT id, name, deleted_at FROM participants WHERE poll_id = ? AND name_key = ?'
  ).bind(pollId, key).first();
  if (existing) {
    if (existing.deleted_at) {
      // dezelfde naam komt terug: weer actief maken (zonder oude stemmen)
      await env.DB.batch([
        env.DB.prepare('UPDATE participants SET deleted_at = NULL, name = ? WHERE id = ?').bind(name, existing.id),
        raak(env, pollId),
      ]);
      return json({ participantId: existing.id, name });
    }
    return json({ participantId: existing.id, name: existing.name });
  }
  const aantal = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM participants WHERE poll_id = ? AND deleted_at IS NULL'
  ).bind(pollId).first();
  if (aantal && aantal.c >= MAX_PARTICIPANTS) return fail('limit_reached');
  const id = newId();
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO participants (id, poll_id, name, name_key, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, pollId, name, key, now()),
      raak(env, pollId),
    ]);
  } catch {
    // race op UNIQUE (poll_id, name_key): haal de winnaar op
    const winner = await env.DB.prepare(
      'SELECT id, name FROM participants WHERE poll_id = ? AND name_key = ?'
    ).bind(pollId, key).first();
    if (winner) return json({ participantId: winner.id, name: winner.name });
    return fail('generic');
  }
  return json({ participantId: id, name });
}

// 5.4 PUT /api/polls/:id/participants/:pid/votes
async function putVotes(env, pollId, pid, body) {
  const participant = await env.DB.prepare(
    'SELECT id FROM participants WHERE id = ? AND poll_id = ? AND deleted_at IS NULL'
  ).bind(pid, pollId).first();
  if (!participant) return fail('not_found', 404);
  if (!Array.isArray(body.optionIds)) return fail('generic');
  const wanted = [...new Set(body.optionIds.filter((x) => typeof x === 'string'))];
  let valid = [];
  if (wanted.length) {
    const placeholders = wanted.map(() => '?').join(',');
    const res = await env.DB.prepare(
      `SELECT id FROM options WHERE poll_id = ? AND id IN (${placeholders})`
    ).bind(pollId, ...wanted).all();
    valid = res.results.map((r) => r.id);
  }
  const stmts = [
    env.DB.prepare('DELETE FROM votes WHERE participant_id = ?').bind(pid),
    raak(env, pollId),
  ];
  for (const oid of valid) {
    stmts.push(
      env.DB.prepare('INSERT INTO votes (participant_id, option_id) VALUES (?, ?)').bind(pid, oid)
    );
  }
  await env.DB.batch(stmts); // atomisch
  return json({});
}

// POST /api/polls/:id/options — dag toevoegen (uniek per dag)
async function addOption(env, pollId, body) {
  const poll = await getPoll(env, pollId);
  if (!poll) return fail('not_found', 404);
  const participant = await env.DB.prepare(
    'SELECT id FROM participants WHERE id = ? AND poll_id = ? AND deleted_at IS NULL'
  ).bind(body.participantId ?? '', pollId).first();
  if (!participant) return fail('not_found', 404);
  if (!validDate(body.date) || !validTime(body.time)) return fail('invalid_date');
  const time = body.time ? body.time : null;
  const existing = await env.DB.prepare(
    'SELECT id FROM options WHERE poll_id = ? AND date = ?'
  ).bind(pollId, body.date).first();
  if (existing) return fail('duplicate_option');
  const aantal = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM options WHERE poll_id = ?'
  ).bind(pollId).first();
  if (aantal && aantal.c >= MAX_OPTIONS) return fail('limit_reached');
  const optionId = newId();
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO options (id, poll_id, date, time, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(optionId, pollId, body.date, time, participant.id, now()),
      env.DB.prepare('INSERT INTO votes (participant_id, option_id) VALUES (?, ?)')
        .bind(participant.id, optionId),
      raak(env, pollId),
    ]);
  } catch {
    return fail('duplicate_option'); // race op UNIQUE (poll_id, date, time)
  }
  return json({ optionId }, 201);
}

// 5.6 DELETE /api/polls/:id/options/:oid?participantId=…
async function deleteOption(env, pollId, oid, requesterId) {
  const option = await env.DB.prepare(
    'SELECT id FROM options WHERE id = ? AND poll_id = ?'
  ).bind(oid, pollId).first();
  if (!option) return fail('not_found', 404);
  const votes = await env.DB.prepare(
    'SELECT participant_id FROM votes WHERE option_id = ?'
  ).bind(oid).all();
  const foreign = votes.results.some((v) => v.participant_id !== requesterId);
  if (foreign) return fail('option_in_use');
  const stmts = [env.DB.prepare('DELETE FROM options WHERE id = ?').bind(oid), raak(env, pollId)];
  const poll = await getPoll(env, pollId);
  if (poll && poll.final_option_id === oid) {
    stmts.push(
      env.DB.prepare('UPDATE polls SET final_option_id = NULL WHERE id = ?').bind(pollId)
    );
  }
  await env.DB.batch(stmts);
  return json({});
}

// 5.7 DELETE /api/polls/:id/participants/:pid
async function deleteParticipant(env, pollId, pid) {
  const participant = await env.DB.prepare(
    'SELECT id FROM participants WHERE id = ? AND poll_id = ? AND deleted_at IS NULL'
  ).bind(pid, pollId).first();
  if (!participant) return fail('not_found', 404);
  // zacht weghalen: de naam blijft WEGGEHAALD_DAGEN als info zichtbaar
  // ("iemand heeft X weggehaald"), de stemmen verdwijnen meteen.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM votes WHERE participant_id = ?').bind(pid),
    env.DB.prepare('UPDATE participants SET deleted_at = ? WHERE id = ?').bind(now(), pid),
    raak(env, pollId),
  ]);
  return json({});
}

// POST /api/polls/:id/visit — bezoekteller +1 (frontend telt 1x per browser)
async function bumpVisit(env, pollId) {
  const poll = await getPoll(env, pollId);
  if (!poll) return fail('not_found', 404);
  await env.DB.prepare('UPDATE polls SET visits = visits + 1, last_activity_at = ? WHERE id = ?').bind(now(), pollId).run();
  return json({});
}

// PUT /api/polls/:id/title — titel aanpassen (iedereen mag)
async function putTitle(env, pollId, body) {
  const poll = await getPoll(env, pollId);
  if (!poll) return fail('not_found', 404);
  const title = cleanTitle(body.title);
  if (!title) return fail('title_required');
  await env.DB.prepare('UPDATE polls SET title = ?, last_activity_at = ? WHERE id = ?').bind(title, now(), pollId).run();
  return json({});
}

// PUT /api/polls/:id/options/:oid/time — uur van een dag aanpassen (iedereen mag)
async function putOptionTime(env, pollId, oid, body) {
  const option = await env.DB.prepare(
    'SELECT id FROM options WHERE id = ? AND poll_id = ?'
  ).bind(oid, pollId).first();
  if (!option) return fail('not_found', 404);
  if (!validTime(body.time)) return fail('invalid_date');
  const time = body.time ? body.time : null;
  await env.DB.batch([env.DB.prepare('UPDATE options SET time = ? WHERE id = ?').bind(time, oid), raak(env, pollId)]);
  return json({});
}

// 5.8 PUT /api/polls/:id/final
async function putFinal(env, pollId, body) {
  const poll = await getPoll(env, pollId);
  if (!poll) return fail('not_found', 404);
  if (body.optionId === null) {
    await env.DB.prepare('UPDATE polls SET final_option_id = NULL, last_activity_at = ? WHERE id = ?').bind(now(), pollId).run();
    return json({});
  }
  const option = await env.DB.prepare(
    'SELECT id FROM options WHERE id = ? AND poll_id = ?'
  ).bind(body.optionId ?? '', pollId).first();
  if (!option) return fail('not_found', 404);
  await env.DB.prepare('UPDATE polls SET final_option_id = ?, last_activity_at = ? WHERE id = ?')
    .bind(option.id, now(), pollId).run();
  return json({});
}

// Dagelijkse opruiming (Cron Trigger): afspraken zonder activiteit sinds ACTIVITEIT_DAGEN
// verdwijnen volledig (opties, deelnemers en stemmen via ON DELETE CASCADE);
// weggehaalde deelnemers verdwijnen na WEGGEHAALD_DAGEN definitief.
async function opruimen(env) {
  const grensPoll = new Date(Date.now() - ACTIVITEIT_DAGEN * 86400000).toISOString();
  const grensWeg = new Date(Date.now() - WEGGEHAALD_DAGEN * 86400000).toISOString();
  const [a, b] = await env.DB.batch([
    env.DB.prepare('DELETE FROM polls WHERE COALESCE(last_activity_at, created_at) < ?').bind(grensPoll),
    env.DB.prepare('DELETE FROM participants WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(grensWeg),
  ]);
  const uit = { polls: a.meta.changes, participants: b.meta.changes };
  console.log('opruimen', JSON.stringify(uit));
  return uit;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(opruimen(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    // ['api', 'polls', <id>, <sub>, <subid>, ...]
    const p = url.pathname.split('/').filter(Boolean);
    const method = request.method;

    // --- pagina's (alleen de paden uit run_worker_first komen hier) ---
    if (p[0] !== 'api' && (method === 'GET' || method === 'HEAD')) {
      if (p.length === 0) return startPagina(env, request);
      if (p.length === 1 && META[p[0]]) return taalPagina(env, request, p[0]);
      if (p[0] === 'p') return afspraakPagina(env, request);
      return env.ASSETS.fetch(request);
    }

    // GET /api/version — huidige serverversie (voor de update-check in de app)
    if (p[0] === 'api' && p[1] === 'version' && p.length === 2 && method === 'GET') {
      return json({ version: APP_VERSION });
    }
    // GET /api/health — werkt de database?
    if (p[0] === 'api' && p[1] === 'health' && p.length === 2 && method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return json({ ok: true, version: APP_VERSION });
      } catch (e) {
        console.error('health', e);
        return json({ ok: false }, 503);
      }
    }

    if (p[0] !== 'api' || p[1] !== 'polls') return fail('not_found', 404);

    try {
      // te veel verzoeken van één IP: 429 (aanmaken strenger dan de rest)
      if (method !== 'GET') {
        const binding = (p.length === 2 && method === 'POST') ? 'RL_CREATE' : 'RL_WRITE';
        if (await teVeel(env, request, binding)) return fail('too_many_requests', 429);
      }

      // POST /api/polls
      if (p.length === 2 && method === 'POST') {
        const body = await readBody(request);
        if (!body) return fail('generic');
        return await createPoll(env, body);
      }

      const pollId = p[2];
      if (!pollId) return fail('not_found', 404);

      // GET /api/polls/:id
      if (p.length === 3 && method === 'GET') {
        const full = await getFullPoll(env, pollId);
        return full ? json(full) : fail('not_found', 404);
      }

      // POST /api/polls/:id/participants
      if (p.length === 4 && p[3] === 'participants' && method === 'POST') {
        const body = await readBody(request);
        if (!body) return fail('generic');
        return await joinPoll(env, pollId, body);
      }

      // PUT /api/polls/:id/participants/:pid/votes
      if (p.length === 6 && p[3] === 'participants' && p[5] === 'votes' && method === 'PUT') {
        const body = await readBody(request);
        if (!body) return fail('generic');
        return await putVotes(env, pollId, p[4], body);
      }

      // DELETE /api/polls/:id/participants/:pid
      if (p.length === 5 && p[3] === 'participants' && method === 'DELETE') {
        return await deleteParticipant(env, pollId, p[4]);
      }

      // POST /api/polls/:id/options
      if (p.length === 4 && p[3] === 'options' && method === 'POST') {
        const body = await readBody(request);
        if (!body) return fail('generic');
        return await addOption(env, pollId, body);
      }

      // DELETE /api/polls/:id/options/:oid?participantId=…
      if (p.length === 5 && p[3] === 'options' && method === 'DELETE') {
        return await deleteOption(env, pollId, p[4], url.searchParams.get('participantId') || '');
      }

      // POST /api/polls/:id/visit
      if (p.length === 4 && p[3] === 'visit' && method === 'POST') {
        return await bumpVisit(env, pollId);
      }

      // PUT /api/polls/:id/title
      if (p.length === 4 && p[3] === 'title' && method === 'PUT') {
        const body = await readBody(request);
        if (!body) return fail('generic');
        return await putTitle(env, pollId, body);
      }

      // PUT /api/polls/:id/options/:oid/time
      if (p.length === 6 && p[3] === 'options' && p[5] === 'time' && method === 'PUT') {
        const body = await readBody(request);
        if (!body) return fail('generic');
        return await putOptionTime(env, pollId, p[4], body);
      }

      // PUT /api/polls/:id/final
      if (p.length === 4 && p[3] === 'final' && method === 'PUT') {
        const body = await readBody(request);
        if (!body) return fail('generic');
        return await putFinal(env, pollId, body);
      }

      return fail('not_found', 404);
    } catch (e) {
      // serverfout (D1, quotum ...): loggen en als 500 melden, niet als clientfout
      console.error(method, url.pathname, e && e.message ? e.message : e);
      return fail('generic', 500);
    }
  },
};
