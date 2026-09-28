// Prikdatum — de volledige API in één Worker.
// Alle antwoorden zijn JSON met Cache-Control: no-store.
// Fouten: { "error": "<code>" } met HTTP 400/404; de frontend vertaalt de codes.

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const MAX_BODY = 20 * 1024; // 20 KB
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

async function getFullPoll(env, id) {
  const poll = await getPoll(env, id);
  if (!poll) return null;
  const [optRes, partRes, voteRes] = await env.DB.batch([
    env.DB.prepare(
      'SELECT id, date, time, added_by FROM options WHERE poll_id = ? ORDER BY date, time'
    ).bind(id),
    env.DB.prepare(
      'SELECT id, name FROM participants WHERE poll_id = ? ORDER BY created_at, id'
    ).bind(id),
    env.DB.prepare(
      `SELECT v.participant_id, v.option_id
         FROM votes v JOIN options o ON o.id = v.option_id
        WHERE o.poll_id = ?`
    ).bind(id),
  ]);
  const votesByOption = new Map();
  for (const v of voteRes.results) {
    if (!votesByOption.has(v.option_id)) votesByOption.set(v.option_id, []);
    votesByOption.get(v.option_id).push(v.participant_id);
  }
  return {
    id: poll.id,
    title: poll.title,
    finalOptionId: poll.final_option_id,
    options: optRes.results.map((o) => ({
      id: o.id,
      date: o.date,
      time: o.time,
      addedBy: o.added_by,
      votes: votesByOption.get(o.id) || [],
    })),
    participants: partRes.results.map((p) => ({ id: p.id, name: p.name })),
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
    'SELECT id, name FROM participants WHERE poll_id = ? AND name_key = ?'
  ).bind(pollId, key).first();
  if (existing) return json({ participantId: existing.id, name: existing.name });
  const id = newId();
  try {
    await env.DB.prepare(
      'INSERT INTO participants (id, poll_id, name, name_key, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, pollId, name, key, now()).run();
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
    'SELECT id FROM participants WHERE id = ? AND poll_id = ?'
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
    'SELECT id FROM participants WHERE id = ? AND poll_id = ?'
  ).bind(body.participantId ?? '', pollId).first();
  if (!participant) return fail('not_found', 404);
  if (!validDate(body.date) || !validTime(body.time)) return fail('invalid_date');
  const time = body.time ? body.time : null;
  const existing = await env.DB.prepare(
    'SELECT id FROM options WHERE poll_id = ? AND date = ?'
  ).bind(pollId, body.date).first();
  if (existing) return fail('duplicate_option');
  const optionId = newId();
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO options (id, poll_id, date, time, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(optionId, pollId, body.date, time, participant.id, now()),
      env.DB.prepare('INSERT INTO votes (participant_id, option_id) VALUES (?, ?)')
        .bind(participant.id, optionId),
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
  const stmts = [env.DB.prepare('DELETE FROM options WHERE id = ?').bind(oid)];
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
    'SELECT id FROM participants WHERE id = ? AND poll_id = ?'
  ).bind(pid, pollId).first();
  if (!participant) return fail('not_found', 404);
  await env.DB.prepare('DELETE FROM participants WHERE id = ?').bind(pid).run();
  // votes verdwijnen via ON DELETE CASCADE; opties die hij toevoegde blijven
  return json({});
}

// PUT /api/polls/:id/title — titel aanpassen (iedereen mag)
async function putTitle(env, pollId, body) {
  const poll = await getPoll(env, pollId);
  if (!poll) return fail('not_found', 404);
  const title = cleanTitle(body.title);
  if (!title) return fail('title_required');
  await env.DB.prepare('UPDATE polls SET title = ? WHERE id = ?').bind(title, pollId).run();
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
  await env.DB.prepare('UPDATE options SET time = ? WHERE id = ?').bind(time, oid).run();
  return json({});
}

// 5.8 PUT /api/polls/:id/final
async function putFinal(env, pollId, body) {
  const poll = await getPoll(env, pollId);
  if (!poll) return fail('not_found', 404);
  if (body.optionId === null) {
    await env.DB.prepare('UPDATE polls SET final_option_id = NULL WHERE id = ?').bind(pollId).run();
    return json({});
  }
  const option = await env.DB.prepare(
    'SELECT id FROM options WHERE id = ? AND poll_id = ?'
  ).bind(body.optionId ?? '', pollId).first();
  if (!option) return fail('not_found', 404);
  await env.DB.prepare('UPDATE polls SET final_option_id = ? WHERE id = ?')
    .bind(option.id, pollId).run();
  return json({});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // ['api', 'polls', <id>, <sub>, <subid>, ...]
    const p = url.pathname.split('/').filter(Boolean);
    const method = request.method;

    if (p[0] !== 'api' || p[1] !== 'polls') return fail('not_found', 404);

    try {
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
      return fail('generic', 400);
    }
  },
};
