// Testen voor Prikdatum v3 (klikkalender, kleur per persoon, tijdelijk wisselen).
// Draait tegen wrangler dev op http://localhost:8787 (zie playwright.config.js).
// Elke "persoon" krijgt een eigen browsercontext (eigen localStorage).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

test.describe.configure({ mode: 'serial' });

const D1 = '2026-10-09'; // vr
const T1 = '18:00';
const D2 = '2026-10-16'; // vr
const D3 = '2026-10-23'; // vr
const MAAND = '2026-10';

function ctxOpties(testInfo, extra) {
  const use = testInfo.project.use || {};
  return {
    viewport: use.viewport,
    hasTouch: use.hasTouch,
    locale: 'nl-BE', // de scenario's verwachten de Nederlandse standaardtaal
    permissions: ['clipboard-read', 'clipboard-write'],
    ...extra,
  };
}

async function apiMaakPoll(request, body) {
  const res = await request.post('/api/polls', { data: body });
  expect(res.status()).toBe(201);
  return await res.json();
}

// Bladert de kalender naar de gevraagde maand ('YYYY-MM').
async function toonMaand(page, doel) {
  for (let i = 0; i < 24; i++) {
    const m = await page.locator('#kalmaand').getAttribute('data-maand');
    if (m === doel) return;
    await page.locator('.kalkop button').nth(m < doel ? 1 : 0).click();
  }
  throw new Error('maand niet gevonden: ' + doel);
}

function dag(page, datum) {
  return page.locator('.dag[data-date="' + datum + '"]');
}

/* ================================================================
   API-testen (met fetch, geen browser)
   ================================================================ */

test.describe('API', () => {
  test('A1 zonder title -> 400 title_required', async ({ request }) => {
    const res = await request.post('/api/polls', { data: { name: 'Ali' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('title_required');
  });

  test('A2 zonder name -> 400 name_required', async ({ request }) => {
    const res = await request.post('/api/polls', { data: { title: 'Etentje' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('name_required');
  });

  test('A3 aanmaken zonder opties kan; opties komen later via de kalender', async ({ request }) => {
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali' });
    const poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.options.length).toBe(0);
    expect(poll.participants.length).toBe(1);
    expect(poll.title).toBe('Etentje');
  });

  test('A4 dubbele dagen bij aanmaken worden stil samengevoegd', async ({ request }) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali',
      options: [{ date: D1, time: T1 }, { date: D1, time: null }, { date: D2, time: null }],
    });
    const poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.options.length).toBe(2);
    for (const o of poll.options) expect(o.votes.length).toBe(1);
  });

  test('A5 onbekende poll -> 404 not_found', async ({ request }) => {
    const res = await request.get('/api/polls/onbekend');
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  test('A6 zelfde naam (case/spaties) -> zelfde participant', async ({ request }) => {
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali' });
    const r1 = await (await request.post(`/api/polls/${id}/participants`, { data: { name: ' sofie  ' } })).json();
    const r2 = await (await request.post(`/api/polls/${id}/participants`, { data: { name: 'SOFIE' } })).json();
    expect(r2.participantId).toBe(r1.participantId);
    expect(r2.name).toBe('sofie');
  });

  test('A7 PUT votes vervangt de volledige set', async ({ request }) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali', options: [{ date: D1, time: null }],
    });
    const poll = await (await request.get('/api/polls/' + id)).json();
    const optieA = poll.options[0].id;
    const sofie = await (await request.post(`/api/polls/${id}/participants`, { data: { name: 'Sofie' } })).json();
    let res = await request.put(`/api/polls/${id}/participants/${sofie.participantId}/votes`, {
      data: { optionIds: [optieA] },
    });
    expect(res.status()).toBe(200);
    let na = await (await request.get('/api/polls/' + id)).json();
    expect(na.options[0].votes).toContain(sofie.participantId);
    res = await request.put(`/api/polls/${id}/participants/${sofie.participantId}/votes`, {
      data: { optionIds: [] },
    });
    expect(res.status()).toBe(200);
    na = await (await request.get('/api/polls/' + id)).json();
    expect(na.options[0].votes).not.toContain(sofie.participantId);
  });

  test('A8-A14 opties, final en participants', async ({ request }) => {
    const { id, participantId: ali } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali', options: [{ date: D1, time: T1 }],
    });
    // A8: zelfde dag nog eens -> duplicate_option (uniek per dag, los van het uur)
    let res = await request.post(`/api/polls/${id}/options`, {
      data: { participantId: ali, date: D1, time: '20:00' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('duplicate_option');

    // A9: nieuwe dag door Sofie -> 201 met haar vote
    const sofie = await (await request.post(`/api/polls/${id}/participants`, { data: { name: 'Sofie' } })).json();
    res = await request.post(`/api/polls/${id}/options`, {
      data: { participantId: sofie.participantId, date: D3, time: null },
    });
    expect(res.status()).toBe(201);
    const { optionId: sofieOptie } = await res.json();
    let poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.options.find((o) => o.id === sofieOptie).votes).toEqual([sofie.participantId]);

    // A10: Ali probeert Sofie's dag weg te halen terwijl Sofie erop staat
    res = await request.delete(`/api/polls/${id}/options/${sofieOptie}?participantId=${ali}`);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('option_in_use');

    // A11: Sofie zelf (enkel haar eigen vote) -> 200, dag weg
    res = await request.delete(`/api/polls/${id}/options/${sofieOptie}?participantId=${sofie.participantId}`);
    expect(res.status()).toBe(200);
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.options.find((o) => o.id === sofieOptie)).toBeUndefined();

    // A12: final zetten en loslaten
    const eerste = poll.options[0].id;
    res = await request.put(`/api/polls/${id}/final`, { data: { optionId: eerste } });
    expect(res.status()).toBe(200);
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.finalOptionId).toBe(eerste);
    res = await request.put(`/api/polls/${id}/final`, { data: { optionId: null } });
    expect(res.status()).toBe(200);
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.finalOptionId).toBeNull();

    // A13: final met onbestaande optie -> 404
    res = await request.put(`/api/polls/${id}/final`, { data: { optionId: 'bestaatniet' } });
    expect(res.status()).toBe(404);

    // A14: participant weghalen -> votes weg (cascade), toegevoegde dagen blijven
    res = await request.post(`/api/polls/${id}/options`, {
      data: { participantId: sofie.participantId, date: '2026-10-30', time: null },
    });
    expect(res.status()).toBe(201);
    const { optionId: blijft } = await res.json();
    res = await request.delete(`/api/polls/${id}/participants/${sofie.participantId}`);
    expect(res.status()).toBe(200);
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.participants.find((p) => p.id === sofie.participantId)).toBeUndefined();
    const over = poll.options.find((o) => o.id === blijft);
    expect(over).toBeDefined();
    expect(over.votes).toEqual([]);
  });

  test('A15 titel van 81 tekens -> 400 title_required', async ({ request }) => {
    const res = await request.post('/api/polls', {
      data: { title: 'x'.repeat(81), name: 'Ali' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('title_required');
  });

  test('A16 titel aanpassen (iedereen mag)', async ({ request }) => {
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali' });
    let res = await request.put(`/api/polls/${id}/title`, { data: { title: 'Etentje bij Ali' } });
    expect(res.status()).toBe(200);
    let poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.title).toBe('Etentje bij Ali');
    res = await request.put(`/api/polls/${id}/title`, { data: { title: '   ' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('title_required');
  });

  test('A19 /api/version geeft een versie terug', async ({ request }) => {
    const res = await request.get('/api/version');
    expect(res.status()).toBe(200);
    const d = await res.json();
    expect(typeof d.version).toBe('string');
    expect(d.version.length).toBeGreaterThan(0);
  });

  test('A18 bezoekteller telt op', async ({ request }) => {
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali' });
    let poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.visits).toBe(0);
    for (let i = 0; i < 3; i++) {
      const res = await request.post(`/api/polls/${id}/visit`);
      expect(res.status()).toBe(200);
    }
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.visits).toBe(3);
  });

  test('A17 uur van een dag aanpassen (iedereen mag)', async ({ request }) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali', options: [{ date: D1, time: null }],
    });
    let poll = await (await request.get('/api/polls/' + id)).json();
    const oid = poll.options[0].id;
    let res = await request.put(`/api/polls/${id}/options/${oid}/time`, { data: { time: T1 } });
    expect(res.status()).toBe(200);
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.options[0].time).toBe(T1);
    res = await request.put(`/api/polls/${id}/options/${oid}/time`, { data: { time: null } });
    expect(res.status()).toBe(200);
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.options[0].time).toBeNull();
    res = await request.put(`/api/polls/${id}/options/${oid}/time`, { data: { time: '25:99' } });
    expect(res.status()).toBe(400);
  });

  test('A20 rate limit: 21e afspraak per minuut van één IP -> 429', async ({ request }) => {
    const ip = '203.0.113.' + Math.floor(Math.random() * 200 + 1);
    const codes = [];
    for (let i = 0; i < 22; i++) {
      const res = await request.post('/api/polls', {
        data: { title: 'Limiet', name: 'Ali' },
        headers: { 'CF-Connecting-IP': ip },
      });
      codes.push(res.status());
    }
    expect(codes.slice(0, 20).every((c) => c === 201)).toBe(true);
    expect(codes[20]).toBe(429);
    expect(codes[21]).toBe(429);
    // een ander IP mag gewoon door
    const ander = await request.post('/api/polls', {
      data: { title: 'Limiet', name: 'Ali' }, headers: { 'CF-Connecting-IP': '198.51.100.7' },
    });
    expect(ander.status()).toBe(201);
  });

  test('A21 health en versie', async ({ request }) => {
    const h = await request.get('/api/health');
    expect(h.status()).toBe(200);
    expect((await h.json()).ok).toBe(true);
  });

  test('A22 taalpagina\'s: vertaalde titel, lang/dir, hreflang en canonical', async ({ request }) => {
    const de = await (await request.get('/de/')).text();
    expect(de).toContain('<html lang="de">');
    expect(de).toContain('<title>Wann treffen wir uns? · Whenly</title>');
    expect(de).toContain('<link rel="canonical" href="https://whenly.vanali.workers.dev/de/">');
    expect((de.match(/hreflang="/g) || []).length).toBe(24); // 23 talen + x-default
    const ar = await (await request.get('/ar')).text();
    expect(ar).toContain('<html lang="ar" dir="rtl">');
    expect(ar).toContain('<meta property="og:locale" content="ar_EG">');
    const home = await (await request.get('/')).text();
    expect(home).toContain('<html lang="en">');
    expect((home.match(/hreflang="/g) || []).length).toBe(24);
    expect(home).toContain('"@type":"WebApplication"');
    // een onbekende taalcode is gewoon de app (SPA-fallback), geen 500
    expect((await request.get('/xx/')).status()).toBe(200);
  });

  test('A24 weghalen is zacht: naam verdwijnt uit de lijst, blijft als "weggehaald"-info, komt terug bij opnieuw meedoen', async ({ request }) => {
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali', options: [{ date: D1, time: null }] });
    const s = await (await request.post('/api/polls/' + id + '/participants', { data: { name: 'Sofie' } })).json();
    const full1 = await (await request.get('/api/polls/' + id)).json();
    await request.put(`/api/polls/${id}/participants/${s.participantId}/votes`, { data: { optionIds: [full1.options[0].id] } });
    expect((await request.delete(`/api/polls/${id}/participants/${s.participantId}`)).status()).toBe(200);
    const full2 = await (await request.get('/api/polls/' + id)).json();
    expect(full2.participants.map((p) => p.name)).toEqual(['Ali']);
    expect(full2.removed.map((r) => r.name)).toEqual(['Sofie']);
    expect(full2.removed[0].deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(full2.options[0].votes).not.toContain(s.participantId); // stemmen zijn weg
    // een weggehaalde deelnemer kan niets meer doen
    expect((await request.put(`/api/polls/${id}/participants/${s.participantId}/votes`, { data: { optionIds: [] } })).status()).toBe(404);
    // dezelfde naam komt terug: weer actief, zonder oude stemmen, en niet meer "weggehaald"
    const terug = await (await request.post('/api/polls/' + id + '/participants', { data: { name: 'sofie' } })).json();
    expect(terug.participantId).toBe(s.participantId);
    const full3 = await (await request.get('/api/polls/' + id)).json();
    expect(full3.participants.map((p) => p.name)).toEqual(['Ali', 'sofie']);
    expect(full3.removed).toEqual([]);
    expect(full3.options[0].votes).not.toContain(s.participantId);
  });

  test('A25 opruiming: afspraak zonder activiteit sinds 12 maanden verdwijnt, actieve blijft', async ({ request }) => {
    const oud = await apiMaakPoll(request, { title: 'Oud', name: 'Ali', options: [{ date: D1, time: null }] });
    const nieuw = await apiMaakPoll(request, { title: 'Nieuw', name: 'Ali', options: [{ date: D1, time: null }] });
    // activiteit 400 dagen terugzetten in de lokale database
    execSync(`npx wrangler d1 execute prikdatum --local --command "UPDATE polls SET last_activity_at = '2025-01-01T00:00:00.000Z' WHERE id = '${oud.id}'"`, {
      cwd: path.join(__dirname, '..'), stdio: 'pipe', timeout: 60_000,
    });
    const cron = await request.get('/__scheduled?cron=17+3+*+*+*');
    expect(cron.status()).toBe(200);
    expect((await request.get('/api/polls/' + oud.id)).status()).toBe(404);
    expect((await request.get('/api/polls/' + nieuw.id)).status()).toBe(200);
  });

  test('A26 DELETE /api/polls/:id: meteen en volledig weg', async ({ request }) => {
    const { id } = await apiMaakPoll(request, { title: 'Weg', name: 'Ali', options: [{ date: D1, time: T1 }] });
    await request.post('/api/polls/' + id + '/participants', { data: { name: 'Sofie' } });
    expect((await request.delete('/api/polls/' + id)).status()).toBe(200);
    expect((await request.get('/api/polls/' + id)).status()).toBe(404);
    expect((await request.delete('/api/polls/' + id)).status()).toBe(404);
    expect((await request.post('/api/polls/' + id + '/participants', { data: { name: 'Tom' } })).status()).toBe(404);
  });

  test('A23 afspraakpagina niet indexeerbaar, statische pagina\'s en headers', async ({ request }) => {
    const p = await request.get('/p/abcdefghij');
    expect(p.status()).toBe(200);
    expect(p.headers()['x-robots-tag']).toBe('noindex, nofollow');
    const faq = await request.get('/faq');
    expect(faq.status()).toBe(200);
    expect(faq.headers()['content-type']).toContain('text/html');
    expect(faq.headers()['x-content-type-options']).toBe('nosniff');
    expect(faq.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(await faq.text()).toContain('"@type": "FAQPage"');
    expect(await (await request.get('/privacy')).text()).toContain('Afspraak volledig verwijderen');
    const robots = await request.get('/robots.txt');
    expect(robots.headers()['content-type']).toContain('text/plain');
    expect(await robots.text()).toContain('Sitemap: https://whenly.vanali.workers.dev/sitemap.xml');
    const sm = await request.get('/sitemap.xml');
    expect(sm.headers()['content-type']).toContain('xml');
    const smt = await sm.text();
    expect(smt).toContain('<loc>https://whenly.vanali.workers.dev/sw/</loc>');
    expect(smt).toContain('<loc>https://whenly.vanali.workers.dev/blog/gratis-doodle-alternatieven</loc>');
    for (const pad of ['/vergelijking', '/privacy', '/blog/gratis-doodle-alternatieven', '/blog/datum-prikken-met-een-grote-groep', '/fonts/noto-sans-tifinagh-tifinagh-400-normal.woff2', '/icon-maskable-512.png', '/screenshots/phone.png']) {
      expect((await request.get(pad)).status(), pad).toBe(200);
    }
  });
});

/* ================================================================
   Scenario's in de browser
   ================================================================ */

test.describe("Scenario's", () => {
  test('S1-S9 het volledige verhaal', async ({ browser }, testInfo) => {
    test.setTimeout(300_000);

    /* ---------- S1: maken en dagen aanklikken ---------- */
    const aliCtx = await browser.newContext(ctxOpties(testInfo));
    const ali = await aliCtx.newPage();
    await ali.goto('/');
    await expect(ali.locator('#titel')).toBeFocused();
    const maakKnop = ali.locator('button', { hasText: 'Maak de afspraak' });
    await ali.fill('#titel', 'Etentje');
    await expect(maakKnop).toBeDisabled();
    await ali.fill('#naam', 'Ali');
    await expect(maakKnop).toBeEnabled();
    await maakKnop.click();
    await ali.waitForURL(/\/p\/[a-z0-9]{10}$/);
    const pollUrl = ali.url();

    await expect(ali.locator('.deel')).toBeVisible();
    await expect(ali.locator('.deel .url')).toHaveText(pollUrl);
    await ali.locator('.deel button').click();
    await expect(ali.locator('.deel button')).toHaveText('Gekopieerd');
    await expect(ali.locator('h1')).toHaveText('Etentje');
    await expect(ali.locator('#voet')).toContainText('vdev'); // versie-label (dev in de testomgeving)
    await expect(ali.locator('.wie')).toContainText('Jij klikt aan als');
    await expect(ali.locator('.wie b')).toHaveText('Ali');
    await expect(ali.locator('.chip', { hasText: 'Ali (jij)' })).toHaveClass(/ik/);
    await expect(ali.locator('#joinnaam')).toBeHidden();
    await expect(ali.locator('.status .balk')).toHaveClass(/rood/); // nog geen datum -> rood
    await expect(ali.locator('.status .groot')).toHaveText('Nog geen datum. Klik je dagen aan.');

    await toonMaand(ali, MAAND);
    await dag(ali, D1).click();
    await expect(dag(ali, D1)).toHaveClass(/mijn/);
    await expect(dag(ali, D1).locator('.dvink')).toHaveCount(1); // je eigen vinkje
    await expect(ali.locator('.taplijn')).toContainText('9 okt');
    await expect(ali.locator('.taplijn')).toContainText('jij');
    await dag(ali, D2).click();
    await expect(dag(ali, D2)).toHaveClass(/mijn/);
    // Ali alleen kan op beide -> iedereen (1 van 1) -> GROEN, tie
    await expect(ali.locator('.status .balk')).toHaveClass(/groen/);
    await expect(ali.locator('.status .groot')).toHaveText('Meerdere dagen lukken voor iedereen');
    await expect(ali.locator('.status .sub')).toHaveText('1 van 1 kan op elk van deze:');

    /* ---------- S2: Sofie komt binnen, ziet de namen en typt haar eigen ---------- */
    const sofieCtx = await browser.newContext(ctxOpties(testInfo));
    const sofie = await sofieCtx.newPage();
    await sofie.goto(pollUrl);
    await expect(sofie.locator('.deel')).toBeHidden();
    await expect(sofie.locator('#joinnaam')).toBeVisible();
    await expect(sofie.locator('.kal')).toHaveClass(/inactief/);
    await expect(sofie.locator('#kalhint')).toHaveText('Vul eerst je naam in om aan te klikken.');
    // een nieuwe bezoeker ziet de bestaande namen al staan (Ali)
    await expect(sofie.locator('.chips .chip')).toHaveCount(1);
    await expect(sofie.locator('.chip', { hasText: 'Ali' })).toBeVisible();
    await toonMaand(sofie, MAAND);
    await dag(sofie, D1).click();
    await expect(sofie.locator('#joinnaam')).toBeFocused();
    await sofie.fill('#joinnaam', 'Sofie');
    await sofie.press('#joinnaam', 'Enter');
    await expect(sofie.locator('.kal')).not.toHaveClass(/inactief/);
    await expect(sofie.locator('.wie b')).toHaveText('Sofie');
    await toonMaand(sofie, MAAND);
    await dag(sofie, D1).click();
    await expect(dag(sofie, D1)).toHaveClass(/mijn/);
    await expect(dag(sofie, D1).locator('.dvink')).toHaveCount(1); // haar vinkje
    await expect(dag(sofie, D1).locator('.ddot')).toHaveCount(1);  // stipje van Ali
    // 9 okt springt eruit, iedereen (2 van 2) kan -> GROEN
    await expect(sofie.locator('.status .balk')).toHaveClass(/groen/);
    await expect(sofie.locator('.status .groot')).toHaveText(/Iedereen kan op vr 9 okt/);
    await expect(sofie.locator('.status .sub')).toHaveText('2 van 2 kunnen');
    await expect(sofie.locator('.status .namenlijn')).toContainText('jij');
    await expect(sofie.locator('.status .namenlijn')).toContainText('Ali');
    await sofie.locator('.status input[type="time"]').fill(T1);
    await expect(sofie.locator('.status .groot')).toHaveText(/Iedereen kan op vr 9 okt om 18:00/);

    /* ---------- S3: live bij Ali, zonder herladen ---------- */
    await expect(dag(ali, D1).locator('.ddot')).toHaveCount(1, { timeout: 13_000 }); // stipje van Sofie
    await expect(ali.locator('.status .groot')).toHaveText(/Iedereen kan op vr 9 okt om 18:00/);
    await expect(ali.locator('.status .namenlijn')).toContainText('Sofie');

    if (testInfo.project.name === 'desktop') {
      fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
      await ali.screenshot({ path: path.join(__dirname, '..', 'docs', 'screenshot.png'), fullPage: true });
    }

    /* ---------- S4: tijdelijk namens iemand anders (Tom) ---------- */
    await sofie.locator('.wie button', { hasText: 'iemand anders invullen' }).click();
    await sofie.locator('.nieuw input').fill('Tom');
    await sofie.locator('.nieuw button').click();
    await expect(sofie.locator('.wie b')).toHaveText('Tom');
    await expect(sofie.locator('.chip')).toHaveCount(3);
    await expect(sofie.locator('.chip', { hasText: 'Tom' })).toHaveClass(/ik/);
    await expect(sofie.locator('.chip', { hasText: 'Sofie (jij)' })).toBeVisible();
    await toonMaand(sofie, MAAND);
    await expect(dag(sofie, D1)).not.toHaveClass(/mijn/); // Tom heeft 9 okt niet aangeklikt
    await dag(sofie, D2).click();
    await expect(dag(sofie, D2)).toHaveClass(/mijn/);
    await expect(dag(sofie, D2).locator('.ddot')).toHaveCount(1); // Ali als stipje

    /* ---------- S5: uitklikken ---------- */
    await dag(sofie, D2).click(); // Tom klikt 16 okt weer uit
    await expect(dag(sofie, D2)).not.toHaveClass(/mijn/);
    await expect(dag(sofie, D2)).toHaveClass(/optie/); // dag blijft: Ali staat erop
    await dag(sofie, D3).click(); // nieuwe dag, enkel Tom
    await expect(dag(sofie, D3)).toHaveClass(/mijn/);
    await dag(sofie, D3).click(); // weer uit -> dag verdwijnt helemaal
    await expect(dag(sofie, D3)).not.toHaveClass(/optie/);

    /* ---------- S6: titel aanpassen (iedereen mag) ---------- */
    await ali.locator('button', { hasText: 'titel aanpassen' }).click();
    await ali.locator('.titeleditor input').fill('Etentje bij Ali');
    await ali.locator('.titeleditor button').click();
    await expect(ali.locator('h1')).toHaveText('Etentje bij Ali');
    await expect(sofie.locator('h1')).toHaveText('Etentje bij Ali', { timeout: 13_000 });

    /* ---------- S7: vastleggen en weer loslaten ---------- */
    // stand: 9 okt = Ali+Sofie (2), 16 okt = Ali (1), 3 deelnemers -> nog niet iedereen -> ORANJE
    await expect(ali.locator('.status .balk')).toHaveClass(/oranje/, { timeout: 13_000 });
    await expect(ali.locator('.status .groot')).toHaveText(/Beste dag tot nu: vr 9 okt om 18:00/);
    await expect(ali.locator('.status .sub')).toHaveText('2 van 3 kunnen');
    await ali.locator('.status button', { hasText: 'Vastleggen' }).click();
    // vastgelegd -> GROEN
    await expect(ali.locator('.status .balk')).toHaveClass(/groen/);
    await expect(ali.locator('.status .groot')).toHaveText(/Afgesproken: vr 9 okt om 18:00/);
    await expect(dag(ali, D1)).toHaveClass(/definitief/);
    await expect(sofie.locator('.status .groot')).toHaveText(/Afgesproken/, { timeout: 13_000 });
    await sofie.locator('.status button', { hasText: 'Toch niet' }).click();
    await expect(sofie.locator('.status .groot')).toHaveText(/Beste dag tot nu/);
    await expect(ali.locator('.status .groot')).toHaveText(/Beste dag tot nu/, { timeout: 13_000 });

    /* ---------- S8: terugkomen; je eigen naam blijft de jouwe ---------- */
    await sofie.reload();
    await expect(sofie.locator('#joinnaam')).toBeHidden();
    // klik op je eigen chip en je bent weer gewoon jezelf
    await sofie.locator('.chip', { hasText: 'Sofie (jij)' }).click();
    await expect(sofie.locator('.wie b')).toHaveText('Sofie');
    await toonMaand(sofie, MAAND);
    await expect(dag(sofie, D1)).toHaveClass(/mijn/);
    // het invullen voor Tom heeft je opgeslagen eigen naam NIET overschreven
    const nieuwTab = await sofieCtx.newPage();
    await nieuwTab.goto('/');
    await expect(nieuwTab.locator('#naam')).toHaveValue('Sofie');
    await nieuwTab.close();
    // in een nieuw tabblad ben je meteen weer jezelf, niet Tom
    const zelfdeBrowser = await sofieCtx.newPage();
    await zelfdeBrowser.goto(pollUrl);
    await expect(zelfdeBrowser.locator('.wie b')).toHaveText('Sofie');
    await zelfdeBrowser.close();

    // ander "toestel", zelfde naam in kleine letters -> eigen vinkjes terug
    const toestel2 = await browser.newContext(ctxOpties(testInfo));
    const sofie2 = await toestel2.newPage();
    await sofie2.goto(pollUrl);
    await sofie2.fill('#joinnaam', 'sofie');
    await sofie2.press('#joinnaam', 'Enter');
    await expect(sofie2.locator('.wie b')).toHaveText('Sofie');
    await toonMaand(sofie2, MAAND);
    await expect(dag(sofie2, D1)).toHaveClass(/mijn/);

    /* ---------- S9: weggaan ---------- */
    await expect(sofie2.locator('.wie b')).toHaveText('Sofie');
    await sofie2.locator('.weg:not(.alles) > button').click(); // "Haal Sofie weg uit deze afspraak"
    await sofie2.locator('.weg:not(.alles) .bevestig button.ja').click(); // "Ja, haal Sofie weg"
    await expect(sofie2.locator('#joinnaam')).toBeVisible();
    await sofie2.fill('#joinnaam', 'Sofie');
    await sofie2.press('#joinnaam', 'Enter');
    await toonMaand(sofie2, MAAND);
    await expect(dag(sofie2, D1)).not.toHaveClass(/mijn/); // verse deelnemer, geen vinkjes

    await aliCtx.close();
    await sofieCtx.close();
    await toestel2.close();
  });

  test('S9b nieuwe bezoeker kiest een bestaande naam via een chip', async ({ browser, request }, testInfo) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Padel', name: 'Ali', options: [{ date: D1, time: null }],
    });
    await request.post(`/api/polls/${id}/participants`, { data: { name: 'Sofie' } });
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    // fris toestel: naamveld zichtbaar én de twee namen staan er al
    await expect(page.locator('#joinnaam')).toBeVisible();
    await expect(page.locator('.chips .chip')).toHaveCount(2);
    await expect(page.locator('.kopje', { hasText: 'Ben je een van hen' })).toBeVisible();
    await page.locator('.chip', { hasText: 'Sofie' }).click();
    // nu ben je Sofie: kalender actief, naamveld weg, jouw chip gemarkeerd
    await expect(page.locator('#joinnaam')).toBeHidden();
    await expect(page.locator('.wie b')).toHaveText('Sofie');
    await expect(page.locator('.chip', { hasText: 'Sofie (jij)' })).toHaveClass(/ik/);
    await expect(page.locator('.kal')).not.toHaveClass(/inactief/);
    await toonMaand(page, MAAND);
    await dag(page, D1).click();
    await expect(dag(page, D1)).toHaveClass(/mijn/);
    await ctx.close();
  });

  test('S9c stoplicht: rood -> oranje -> groen', async ({ browser, request }, testInfo) => {
    // drie deelnemers, geen stemmen -> ROOD
    const { id, participantId: ali } = await apiMaakPoll(request, { title: 'Kleuren', name: 'Ali' });
    const r = await (await request.post(`/api/polls/${id}/participants`, { data: { name: 'Ridwane' } })).json();
    const i = await (await request.post(`/api/polls/${id}/participants`, { data: { name: 'Ilyas' } })).json();

    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await page.locator('.chip', { hasText: 'Ali' }).click(); // word Ali
    await expect(page.locator('.status .balk')).toHaveClass(/rood/);
    await expect(page.locator('.status .groot')).toHaveText('Nog geen datum. Klik je dagen aan.');

    // Ali klikt een dag -> 1 van 3 kan -> ORANJE
    await toonMaand(page, MAAND);
    await dag(page, D1).click();
    await expect(page.locator('.status .balk')).toHaveClass(/oranje/);
    await expect(page.locator('.status .groot')).toHaveText(/Beste dag tot nu: vr 9 okt/);
    await expect(page.locator('.status .sub')).toHaveText('1 van 3 kan');

    // Ridwane en Ilyas kunnen ook op 9 okt -> 3 van 3 -> GROEN
    const o9 = (await (await request.get('/api/polls/' + id)).json()).options.find((x) => x.date === D1).id;
    await request.put(`/api/polls/${id}/participants/${r.participantId}/votes`, { data: { optionIds: [o9] } });
    await request.put(`/api/polls/${id}/participants/${i.participantId}/votes`, { data: { optionIds: [o9] } });
    await expect(page.locator('.status .balk')).toHaveClass(/groen/, { timeout: 13_000 });
    await expect(page.locator('.status .groot')).toHaveText(/Iedereen kan op vr 9 okt/);
    await expect(page.locator('.status .sub')).toHaveText('3 van 3 kunnen');
    await ctx.close();
  });

  test('S13 update-melding verschijnt bij een nieuwere serverversie', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.route('**/api/version', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ version: 'nieuw-999' }),
    }));
    await page.goto('/');
    await expect(page.locator('#updateBar')).toBeVisible();
    await expect(page.locator('#updateBtn')).toHaveText('Updaten');
    await expect(page.locator('#updateTekst')).toHaveText('Er is een nieuwe versie van Whenly.');
    await ctx.close();
  });

  test('S14 tagline, legenda en voorbije dagen', async ({ browser, request }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('.tagline')).toContainText('Prik samen een datum');
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali', options: [{ date: D1, time: null }] });
    await page.goto('/p/' + id);
    await expect(page.locator('.legenda')).toContainText('jij kan');
    await expect(page.locator('.legenda')).toContainText('iemand anders kan');
    // blader naar de huidige maand (de kalender opent op de eerste komende dag);
    // een dag vroeg in de huidige maand ligt in het verleden. Lokale tijd, zoals de app.
    const nu = new Date();
    const mm = String(nu.getMonth() + 1).padStart(2, '0');
    const eersteVanDeMaand = nu.getFullYear() + '-' + mm + '-01';
    const vandaag = eersteVanDeMaand.slice(0, 8) + String(nu.getDate()).padStart(2, '0');
    await toonMaand(page, nu.getFullYear() + '-' + mm);
    if (eersteVanDeMaand !== vandaag) {
      await expect(dag(page, eersteVanDeMaand)).toHaveClass(/verleden/);
    }
    await ctx.close();
  });

  test('S15 donatieknop toont bedragen en PayPal-links', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/');
    const doneer = page.locator('#doneerBtn');
    await expect(doneer).toBeVisible();
    await expect(doneer).toHaveText('Doneer');
    await expect(page.locator('#doneerPaneel')).toBeHidden();
    await doneer.click();
    await expect(page.locator('#doneerPaneel')).toBeVisible();
    // gewone bedragen en de grap-bedragen (exacte tekst, zodat €5 niet ook €50 pakt)
    for (const b of [1, 2, 5, 20, 50]) {
      await expect(page.locator('.doneer-bedrag', { hasText: new RegExp('^\\u20AC' + b + '$') })).toBeVisible();
    }
    // link wijst naar PayPal.me met het juiste bedrag
    const vijf = page.locator('.doneer-bedrag', { hasText: /^€5$/ });
    const href = await vijf.getAttribute('href');
    expect(href).toContain('paypal.com/paypalme/');
    expect(href).toContain('/5EUR');
    await ctx.close();
  });

  test('S10 onbekende link', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/p/bestaatniet');
    await expect(page.locator('h1')).toHaveText('Deze afspraak bestaat niet');
    await page.locator('button', { hasText: 'Nieuwe afspraak' }).click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('h1')).toHaveText('Wanneer spreken we af?');
    await ctx.close();
  });

  test('S11 taal wisselen met het vlaggetje', async ({ browser, request }, testInfo) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali', options: [{ date: D1, time: T1 }],
    });
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await expect(page.locator('.status .groot')).toHaveText(/vr 9 okt om 18:00/);
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'English' }).click();
    await expect(page.locator('#kalhint')).toHaveText('Enter your name first to start ticking.');
    await expect(page.locator('.status .groot')).toHaveText(/Fri,? 9 Oct at 18:00/);
    await page.reload();
    await expect(page.locator('#kalhint')).toHaveText('Enter your name first to start ticking.');
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'Français' }).click();
    await expect(page.locator('.status .groot')).toHaveText(/ven\.?.*9 oct\.?.*à 18:00/);
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'Nederlands' }).click();
    await expect(page.locator('.status .groot')).toHaveText(/vr 9 okt om 18:00/);
    await ctx.close();
  });

  test('S16 taaldetectie: browsertaal bepaalt de taal, onbekend -> Engels', async ({ browser }, testInfo) => {
    // Duits
    let ctx = await browser.newContext(ctxOpties(testInfo, { locale: 'de-DE' }));
    let page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Wann treffen wir uns?');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
    await ctx.close();
    // Japans
    ctx = await browser.newContext(ctxOpties(testInfo, { locale: 'ja-JP' }));
    page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('いつ会いましょう？');
    await ctx.close();
    // onbekende taal -> Engels, links-naar-rechts
    ctx = await browser.newContext(ctxOpties(testInfo, { locale: 'is-IS' }));
    page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('When shall we meet?');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');
    await ctx.close();
  });

  test('S17 Arabisch: rechts-naar-links, weekstart zaterdag, één letter per weekdag', async ({ browser, request }, testInfo) => {
    const { id } = await apiMaakPoll(request, {
      title: 'عشاء', name: 'علي', options: [{ date: D1, time: T1 }],
    });
    const ctx = await browser.newContext(ctxOpties(testInfo, { locale: 'ar-EG' }));
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await expect(page.locator('h1')).toHaveText('عشاء');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ar');
    await expect(page.locator('#kalhint')).toHaveText('أدخل اسمك أولاً لتحديد الأيام.');
    // Egypte: de week begint op zaterdag; korte weekdag = één letter
    const kop = await page.locator('.maandblok').first().locator('.kalwd').allTextContents();
    expect(kop.length).toBe(7);
    expect(kop[0]).toBe('س'); // zaterdag
    expect(kop.every((w) => w.length <= 2)).toBe(true);
    // Latijnse cijfers in de datum (raster en tijd zijn dat ook)
    await expect(page.locator('.status .groot')).toContainText('9');
    await ctx.close();
  });

  test('S18 en-US: week begint op zondag, 12-uursklok, maand-dag volgorde', async ({ browser, request }, testInfo) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Dinner', name: 'Ali', options: [{ date: D1, time: T1 }],
    });
    const ctx = await browser.newContext(ctxOpties(testInfo, { locale: 'en-US' }));
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await expect(page.locator('.status .groot')).toHaveText(/Fri, Oct 9 at 6:00 PM/);
    const kop = await page.locator('.maandblok').first().locator('.kalwd').allTextContents();
    expect(kop[0]).toBe('Sun');
    expect(kop[6]).toBe('Sat');
    // 1 oktober 2026 is een donderdag: bij zondagstart 4 lege cellen ervoor
    await toonMaand(page, MAAND);
    const leeg = await page.locator('.maandblok').first().locator('.dag.leeg').count();
    expect(leeg).toBe(4);
    await ctx.close();
  });

  test('S19 taalmenu: 20 talen, sluit met Escape en met een klik erbuiten', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/');
    await page.locator('#vlag').click();
    await expect(page.locator('#talen')).toBeVisible();
    expect(await page.locator('#talen button').count()).toBe(23);
    await expect(page.locator('#vlag')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#talen')).toBeHidden();
    await page.locator('#vlag').click();
    await expect(page.locator('#talen')).toBeVisible();
    await page.mouse.click(4, 4); // buiten het menu
    await expect(page.locator('#talen')).toBeHidden();
    // kiezen: Hindi
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'हिन्दी' }).click();
    await expect(page.locator('h1')).toHaveText('हम कब मिलें?');
    await expect(page.locator('#vlag')).toContainText('HI');
    await page.reload();
    await expect(page.locator('h1')).toHaveText('हम कब मिलें?');
    await ctx.close();
  });

  test('S20 /ja/ zet de taal ook met een Nederlandse browser; voetnoot linkt naar de start; na vastleggen "nog een datum"', async ({ browser, request }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo)); // nl-BE
    const page = await ctx.newPage();
    await page.goto('/ja/');
    await expect(page.locator('h1')).toHaveText('いつ会いましょう？');
    await expect(page.locator('#voet a').first()).toHaveAttribute('href', '/');
    // keuze blijft bewaard op de gewone startpagina
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('いつ会いましょう？');
    // terug naar Nederlands via het menu, dan een vastgelegde afspraak
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'Nederlands' }).click();
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali', options: [{ date: D1, time: T1 }] });
    const full = await (await request.get('/api/polls/' + id)).json();
    await request.put('/api/polls/' + id + '/final', { data: { optionId: full.options[0].id } });
    await page.goto('/p/' + id);
    await expect(page.locator('.status .balk')).toHaveClass(/definitief/);
    await expect(page.locator('.status .nog')).toHaveText('Nog een datum prikken?');
    await expect(page.locator('.status .nog')).toHaveAttribute('href', '/');
    await ctx.close();
  });

  test('S21 server antwoordt niet: melding met "opnieuw", daarna weer gewoon', async ({ browser, request }, testInfo) => {
    const { id } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali', options: [{ date: D1, time: T1 }] });
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.route('**/api/polls/' + id, (route) => route.abort());
    await page.goto('/p/' + id);
    await expect(page.locator('.melding.fout')).toBeVisible();
    await expect(page.locator('.melding.fout')).toContainText('De server antwoordt even niet.');
    await page.unroute('**/api/polls/' + id);
    await page.locator('.melding.fout button').click();
    await expect(page.locator('.melding.fout')).toBeHidden();
    await expect(page.locator('h1')).toHaveText('Etentje');
    await ctx.close();
  });

  test('S22 snel klikken: dubbelklik op een nieuwe dag en twee dagen vlak na elkaar verliezen geen stem', async ({ browser, request }, testInfo) => {
    const { id, participantId } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali', options: [] });
    const ctx = await browser.newContext(ctxOpties(testInfo));
    await ctx.addInitScript(([pid, pol]) => { localStorage.setItem('prikdatum.p.' + pol, pid); }, [participantId, id]);
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await toonMaand(page, MAAND);
    // dubbelklik = aan en meteen weer uit: geen fout, geen halve toestand
    await dag(page, D1).dblclick();
    await page.waitForTimeout(1500);
    await expect(page.locator('.fout:visible')).toHaveCount(0);
    let full = await (await request.get('/api/polls/' + id)).json();
    const d1 = full.options.find((o) => o.date === D1);
    const uiMijn = await dag(page, D1).evaluate((n) => n.classList.contains('mijn'));
    expect(!!(d1 && d1.votes.includes(participantId))).toBe(uiMijn); // server en scherm zijn het eens
    // twee nieuwe dagen vlak na elkaar (zonder te wachten): allebei aangevinkt
    await dag(page, D2).click({ noWaitAfter: true });
    await dag(page, D3).click({ noWaitAfter: true });
    await page.waitForTimeout(2000);
    full = await (await request.get('/api/polls/' + id)).json();
    for (const dt of [D2, D3]) {
      const o = full.options.find((x) => x.date === dt);
      expect(o && o.votes.includes(participantId), dt).toBe(true);
    }
    await expect(dag(page, D2)).toHaveClass(/mijn/);
    await expect(dag(page, D3)).toHaveClass(/mijn/);
    await ctx.close();
  });

  test('S23 kalender opent op de eerste komende dag, of op de definitieve dag', async ({ browser, request }, testInfo) => {
    // opties in oktober 2026 (in de toekomst): de kalender opent daar, niet op de huidige maand
    const { id } = await apiMaakPoll(request, { title: 'Later', name: 'Ali', options: [{ date: D2, time: null }, { date: D1, time: null }] });
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await expect(page.locator('#kalmaand')).toHaveAttribute('data-maand', MAAND);
    // definitieve dag wint
    const ver = '2027-03-12';
    const p2 = await apiMaakPoll(request, { title: 'Definitief', name: 'Ali', options: [{ date: D1, time: null }, { date: ver, time: null }] });
    const f2 = await (await request.get('/api/polls/' + p2.id)).json();
    await request.put('/api/polls/' + p2.id + '/final', { data: { optionId: f2.options.find((o) => o.date === ver).id } });
    await page.goto('/p/' + p2.id);
    await expect(page.locator('#kalmaand')).toHaveAttribute('data-maand', '2027-03');
    // bladeren blijft werken
    await page.locator('.kalkop button').nth(0).click();
    await expect(page.locator('#kalmaand')).toHaveAttribute('data-maand', '2027-02');
    await ctx.close();
  });

  test('S24 toegankelijkheid: dagen hebben een volledige naam en toestand, focus blijft staan na Enter, "weggehaald"-info', async ({ browser, request }, testInfo) => {
    const { id, participantId } = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali', options: [{ date: D1, time: null }] });
    const sofie = await (await request.post('/api/polls/' + id + '/participants', { data: { name: 'Sofie' } })).json();
    const ctx = await browser.newContext(ctxOpties(testInfo));
    await ctx.addInitScript(([pid, pol]) => { localStorage.setItem('prikdatum.p.' + pol, pid); }, [participantId, id]);
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await toonMaand(page, MAAND);
    await expect(dag(page, D1)).toHaveAttribute('aria-label', 'vrijdag 9 oktober 2026: jij');
    await expect(dag(page, D1)).toHaveAttribute('aria-pressed', 'true');
    await expect(dag(page, D2)).toHaveAttribute('aria-label', /vrijdag 16 oktober 2026: nog niemand/);
    await expect(dag(page, D2)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.chip', { hasText: 'Ali' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.chip', { hasText: 'Sofie' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.status')).toHaveAttribute('aria-live', 'polite');
    // toetsenbord: focus op een dag, Enter, de focus blijft op dezelfde dag
    await dag(page, D2).focus();
    await page.keyboard.press('Enter');
    await expect(dag(page, D2)).toHaveClass(/mijn/);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.dataset.date)).toBe(D2);
    // iemand haalt Sofie weg: info voor de groep
    await request.delete(`/api/polls/${id}/participants/${sofie.participantId}`);
    await page.reload();
    await expect(page.locator('.weggehaald')).toContainText('Iemand heeft Sofie weggehaald');
    await expect(page.locator('.chip', { hasText: 'Sofie' })).toHaveCount(0);
    // voettekst: privacy-link
    await expect(page.locator('#voet a.privacy')).toHaveAttribute('href', '/privacy');
    await ctx.close();
  });

  test('S25 Tamazight, Koerdisch en Shona: eigen datumnamen als de browser de taal niet kent', async ({ browser, request }, testInfo) => {
    const { id } = await apiMaakPoll(request, { title: 'Imnsi', name: 'Kushim', options: [{ date: D1, time: T1 }] });
    const gevallen = [
      ['zgh', 'ⵎⴰⵏⴰⴳ ⴰⴷ ⵏⵎⵢⴰⴳⴰⵔ?', /ⴰⵙⵉⵎ 9 ⴽⵜⵓ ⴳ 18:00/, 'ⴰⵢⵏ', 'ⴽⵜⵓⴱⵔ 2026'],
      ['ku', 'Kengî em hev bibînin?', /9 cot, înî saet 18:00/, 'dşm', 'cotmeh 2026'],
      ['sn', 'Tosangana rinhi?', /Gum 9, Chs na 18:00/, 'Svo', 'Gumiguru 2026'],
    ];
    for (const [taal, titel, datum, eersteWd, maand] of gevallen) {
      const ctx = await browser.newContext(ctxOpties(testInfo)); // nl-BE-browser: mag niet doorsijpelen
      const page = await ctx.newPage();
      await page.goto('/' + taal + '/');
      await expect(page.locator('h1')).toHaveText(titel);
      await page.goto('/p/' + id);
      await expect(page.locator('.status .groot'), taal).toHaveText(datum);
      const wd = await page.locator('.maandblok').first().locator('.kalwd').allTextContents();
      expect(wd[0], taal + ' weekstart').toBe(eersteWd);
      await expect(page.locator('.maandblok').first().locator('.maandnaam'), taal).toHaveText(maand);
      await ctx.close();
    }
  });

  test('S26 "Nieuwe afspraak" op de afspraak; de startpagina toont je eerdere afspraken (alleen deze browser)', async ({ browser, request }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    // nog niets bezocht: geen lijst
    await page.goto('/');
    await expect(page.locator('.recent')).toHaveCount(0);
    const a = await apiMaakPoll(request, { title: 'Etentje', name: 'Ali', options: [{ date: D1, time: null }] });
    const b = await apiMaakPoll(request, { title: 'Weekend aan zee', name: 'Ali', options: [{ date: D2, time: null }] });
    await page.goto('/p/' + a.id);
    await expect(page.locator('h1')).toHaveText('Etentje');
    await page.goto('/p/' + b.id);
    await expect(page.locator('h1')).toHaveText('Weekend aan zee');
    // knop "Nieuwe afspraak" naast "Deel" brengt je naar de start
    const nieuw = page.locator('.knoppenrij a', { hasText: 'Nieuwe afspraak' });
    await expect(nieuw).toHaveAttribute('href', '/');
    await nieuw.click();
    await page.waitForURL(/\/$/);
    // beide afspraken staan er, nieuwste eerst, en linken naar de juiste pagina
    await expect(page.locator('.recent h2')).toHaveText('Jouw afspraken');
    await expect(page.locator('.recent .hint')).toHaveText('Alleen op dit toestel');
    const links = page.locator('.recent a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText('Weekend aan zee');
    await expect(links.nth(0)).toHaveAttribute('href', '/p/' + b.id);
    await expect(links.nth(1)).toHaveText('Etentje');
    await links.nth(1).click();
    await expect(page.locator('h1')).toHaveText('Etentje');
    // een andere browser ziet niets (alleen dit toestel)
    const ctx2 = await browser.newContext(ctxOpties(testInfo));
    const page2 = await ctx2.newPage();
    await page2.goto('/');
    await expect(page2.locator('.recent')).toHaveCount(0);
    await ctx2.close();
    await ctx.close();
  });

  test('S27 afspraak volledig verwijderen: bevestiging, terug naar start met melding, uit "Jouw afspraken"', async ({ browser, request }, testInfo) => {
    const { id, participantId } = await apiMaakPoll(request, { title: 'Weg ermee', name: 'Ali', options: [{ date: D1, time: null }] });
    const ctx = await browser.newContext(ctxOpties(testInfo));
    await ctx.addInitScript(([pid, pol]) => { localStorage.setItem('prikdatum.p.' + pol, pid); }, [participantId, id]);
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await expect(page.locator('h1')).toHaveText('Weg ermee');
    const knop = page.locator('.weg.alles > button');
    await expect(knop).toHaveText('Afspraak volledig verwijderen');
    await knop.click();
    // eerst "toch niet": niets gebeurt
    await page.locator('.weg.alles .bevestig button', { hasText: 'Toch niet' }).click();
    expect((await request.get('/api/polls/' + id)).status()).toBe(200);
    await knop.click();
    await page.locator('.weg.alles .bevestig button.ja').click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('#scherm [role="status"]')).toHaveText('De afspraak is verwijderd.');
    await expect(page.locator('.recent a', { hasText: 'Weg ermee' })).toHaveCount(0);
    expect((await request.get('/api/polls/' + id)).status()).toBe(404);
    // wie de oude link nog opent, ziet "bestaat niet"
    await page.goto('/p/' + id);
    await expect(page.locator('h1')).toHaveText('Deze afspraak bestaat niet');
    await ctx.close();
  });

  test('S12 mobiel 360x740: geen horizontale scroll, knoppen >= 44px', async ({ browser, request }, testInfo) => {
    test.skip(!testInfo.project.use.viewport || testInfo.project.use.viewport.width !== 360,
      'alleen op het mobiele project');
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();

    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali', options: [{ date: D1, time: T1 }, { date: D2, time: null }],
    });
    await page.goto('/p/' + id);
    await expect(page.locator('.dag[data-date]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    for (const knop of await page.locator('button:visible').all()) {
      const box = await knop.boundingBox();
      expect(box.height, await knop.evaluate((n) => n.outerHTML.slice(0, 60))).toBeGreaterThanOrEqual(44);
    }
    await ctx.close();
  });
});

/* ================================================================
   Statische controles
   ================================================================ */

test.describe('Statisch', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  test('geen externe scripts of stylesheets', () => {
    expect(html.includes('<script src=')).toBe(false);
    expect(/<link[^>]+rel="stylesheet"/.test(html)).toBe(false);
  });

  test('teksten staan alleen in STRINGS', () => {
    for (const woord of ['Kopieer', 'Copy', 'Copier']) {
      const treffers = html.split(woord).length - 1;
      expect(treffers, `"${woord}" moet precies 1x voorkomen (in STRINGS)`).toBe(1);
    }
  });

  test('alle 20 talen hebben alle sleutels, met dezelfde plaatshouders', () => {
    const V = new Function('return ' + /const VERTALINGEN = (\{[\s\S]*?\n\});/.exec(html)[1])();
    const T = new Function('return ' + /const TALEN = (\{[\s\S]*?\n\});/.exec(html)[1])();
    expect(Object.keys(T).length).toBe(23);
    const sleutels = Object.keys(V.en);
    expect(sleutels.length).toBeGreaterThan(60);
    const ph = (x) => [...new Set(((typeof x === 'string' ? x : Object.values(x).join(' ')).match(/\{\w+\}/g) || []))].sort().join();
    for (const l of Object.keys(T)) {
      expect(V[l], 'taal ' + l).toBeTruthy();
      for (const k of sleutels) {
        expect(V[l][k], l + ':' + k).toBeTruthy();
        expect(ph(V[l][k]), l + ':' + k + ' plaatshouders').toBe(ph(V.en[k]));
      }
    }
    // RTL-talen gemarkeerd
    expect(T.ar.rtl).toBe(true);
    expect(T.ur.rtl).toBe(true);
  });

  test('META in de worker is gelijk aan make.title/make.tagline in de app', () => {
    const worker = fs.readFileSync(path.join(__dirname, '..', 'src', 'worker.js'), 'utf8');
    const META = new Function('return ' + /const META = (\{[\s\S]*?\n\});/.exec(worker)[1])();
    const V = new Function('return ' + /const VERTALINGEN = (\{[\s\S]*?\n\});/.exec(html)[1])();
    expect(Object.keys(META).sort()).toEqual(Object.keys(V).sort());
    for (const l of Object.keys(V)) {
      expect(META[l].title, l).toBe(V[l]['make.title']);
      expect(META[l].desc, l).toBe(V[l]['make.tagline']);
    }
    expect(META.ar.rtl).toBe(true);
    expect(META.ur.rtl).toBe(true);
  });

  test('wrangler deploy --dry-run slaagt', ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'één keer volstaat');
    execSync('npx wrangler deploy --dry-run', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      timeout: 120_000,
    });
  });
});
