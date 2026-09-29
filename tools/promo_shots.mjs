// Maakt promo-screenshots en de frames voor de demo-GIF.
// Gebruik: node tools/promo_shots.mjs            (Nederlands, tegen de live site)
//          SHOT_LANG=en node tools/promo_shots.mjs (Engels; bestanden krijgen -en)
//          SHOT_BASE=http://localhost:8787 ...      (tegen wrangler dev; de getoonde link wordt dan de echte domeinnaam)
import { chromium } from '@playwright/test';
import fs from 'fs';

const LIVE = 'https://whenly.vanali.workers.dev';
const BASE = process.env.SHOT_BASE || LIVE;
const LANG = process.env.SHOT_LANG || 'nl';
const SUF = LANG === 'nl' ? '' : '-' + LANG;
const OUT = 'promo/assets';
const T = LANG === 'en'
  ? { titel: 'Dinner with friends', ik: 'Maya', gif: 'Weekend by the sea', locale: 'en-GB' }
  : { titel: 'Etentje met vrienden', ik: 'Ali', gif: 'Weekend aan zee', locale: 'nl-BE' };

// de app onthoudt de taal in localStorage; zo staat de UI in de gevraagde taal
async function taal(ctx) {
  await ctx.addInitScript((l) => { try { localStorage.setItem('prikdatum.lang', l); } catch {} }, LANG);
}
// tegen localhost: toon de echte domeinnaam in de deel-link (alleen de tekst, niets anders)
async function echteLink(page) {
  if (BASE === LIVE) return;
  await page.evaluate((live) => {
    for (const n of document.querySelectorAll('.deel *')) {
      for (const c of n.childNodes) if (c.nodeType === 3 && c.textContent.includes(location.origin)) c.textContent = c.textContent.replace(location.origin, live);
    }
  }, LIVE);
}
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

async function api(path, method, body) {
  const r = await fetch(BASE + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// data zetten: een afspraak waar iedereen kan (groen) + een gedeelde dag
function dagen(start, n) {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() + start);
  for (let i = 0; i < n; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i * 7);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

const browser = await chromium.launch({ executablePath: exe });
try {
  // --- afspraak seeden ---
  const [d1, d2, d3] = dagen(6, 3);
  const poll = await api('/api/polls', 'POST', {
    title: T.titel, name: T.ik,
    options: [{ date: d1, time: '19:00' }, { date: d2, time: null }, { date: d3, time: null }],
  });
  const id = poll.id;
  const full = await api('/api/polls/' + id, 'GET');
  const mij = poll.participantId; // de maker; zo toont de browser "jij" i.p.v. het naamveld
  const o1 = full.options.find((o) => o.date === d1).id;
  // Sofie en Tom kunnen ook op de eerste dag -> groen "iedereen kan"
  const sofie = await api(`/api/polls/${id}/participants`, 'POST', { name: 'Sofie' });
  const tom = await api(`/api/polls/${id}/participants`, 'POST', { name: 'Tom' });
  await api(`/api/polls/${id}/participants/${sofie.participantId}/votes`, 'PUT', { optionIds: [o1] });
  await api(`/api/polls/${id}/participants/${tom.participantId}/votes`, 'PUT', { optionIds: [o1, full.options.find((o)=>o.date===d2).id] });

  // --- desktop homepage ---
  const dctx = await browser.newContext({ viewport: { width: 1270, height: 760 }, locale: T.locale, deviceScaleFactor: 2 });
  await taal(dctx);
  await dctx.addInitScript(([pid, me]) => { try { localStorage.setItem('prikdatum.p.' + pid, me); } catch {} }, [id, mij]);
  const dp = await dctx.newPage();
  await dp.goto(BASE + '/');
  await dp.fill('#titel', T.titel);
  await dp.fill('#naam', T.ik);
  await dp.waitForTimeout(400);
  await dp.screenshot({ path: `${OUT}/shot-desktop-home${SUF}.png` });

  // --- desktop afspraak (groen) ---
  await dp.goto(BASE + '/p/' + id);
  await dp.waitForTimeout(3500); // confetti laten uitvallen
  await echteLink(dp);
  await dp.screenshot({ path: `${OUT}/shot-desktop-poll${SUF}.png` });
  await dctx.close();

  // --- mobiel (telefoon) ---
  const mctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: T.locale, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await taal(mctx);
  await mctx.addInitScript(([pid, me]) => { try { localStorage.setItem('prikdatum.p.' + pid, me); } catch {} }, [id, mij]);
  const mp = await mctx.newPage();
  await mp.goto(BASE + '/p/' + id);
  await mp.waitForTimeout(3500);
  await echteLink(mp);
  await mp.screenshot({ path: `${OUT}/shot-mobiel-poll${SUF}.png` });

  // --- 3 frames voor de demo-GIF (telefoon) ---
  const g = await mctx.newPage();
  await g.goto(BASE + '/');
  await g.fill('#titel', T.gif);
  await g.fill('#naam', T.ik);
  await g.waitForTimeout(300);
  await g.screenshot({ path: `${OUT}/gif-1${SUF}.png` });

  const p2 = await api('/api/polls', 'POST', { title: T.gif, name: T.ik, options: [{ date: d1, time: null }, { date: d2, time: null }] });
  await g.addInitScript((pid) => { try { sessionStorage.setItem('prikdatum.justCreated', pid); localStorage.setItem('prikdatum.p.' + pid, 'seed'); } catch {} }, p2.id);
  await g.goto(BASE + '/p/' + p2.id);
  await g.waitForTimeout(1000);
  await echteLink(g);
  await g.screenshot({ path: `${OUT}/gif-2${SUF}.png` });

  const f2 = await api('/api/polls/' + p2.id, 'GET');
  const s = await api(`/api/polls/${p2.id}/participants`, 'POST', { name: 'Sofie' });
  await api(`/api/polls/${p2.id}/participants/${s.participantId}/votes`, 'PUT', { optionIds: f2.options.map((o) => o.id) });
  await g.goto(BASE + '/p/' + p2.id);
  await g.waitForTimeout(3500);
  await echteLink(g);
  await g.screenshot({ path: `${OUT}/gif-3${SUF}.png` });
  await mctx.close();

  console.log('screenshots klaar');
} finally {
  await browser.close();
}
