// Testen uit hoofdstuk 12 van de spec.
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
const T3 = '19:30';

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

/* ================================================================
   12.1 API-testen (met fetch, geen browser)
   ================================================================ */

test.describe('12.1 API', () => {
  test('A1 zonder title -> 400 title_required', async ({ request }) => {
    const res = await request.post('/api/polls', {
      data: { name: 'Ali', options: [{ date: D1, time: null }] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('title_required');
  });

  test('A2 zonder name -> 400 name_required', async ({ request }) => {
    const res = await request.post('/api/polls', {
      data: { title: 'Etentje', options: [{ date: D1, time: null }] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('name_required');
  });

  test('A3 lege of ongeldige options -> 400 invalid_date', async ({ request }) => {
    for (const options of [[], [{ date: 'niet-geldig', time: null }], [{ date: '2026-13-40', time: null }]]) {
      const res = await request.post('/api/polls', {
        data: { title: 'Etentje', name: 'Ali', options },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe('invalid_date');
    }
  });

  test('A4 dubbels stil samengevoegd; maker stemt op alles', async ({ request }) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali',
      options: [{ date: D1, time: T1 }, { date: D2, time: null }, { date: D1, time: T1 }],
    });
    const poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.options.length).toBe(2);
    for (const o of poll.options) expect(o.votes.length).toBe(1);
    expect(poll.participants.length).toBe(1);
  });

  test('A5 onbekende poll -> 404 not_found', async ({ request }) => {
    const res = await request.get('/api/polls/onbekend');
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  test('A6 zelfde naam (case/spaties) -> zelfde participant', async ({ request }) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali', options: [{ date: D1, time: null }],
    });
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
    // A8: bestaande date+time -> duplicate_option
    let res = await request.post(`/api/polls/${id}/options`, {
      data: { participantId: ali, date: D1, time: T1 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('duplicate_option');

    // A9: nieuwe datum door Sofie -> 201 met haar vote
    const sofie = await (await request.post(`/api/polls/${id}/participants`, { data: { name: 'Sofie' } })).json();
    res = await request.post(`/api/polls/${id}/options`, {
      data: { participantId: sofie.participantId, date: D3, time: T3 },
    });
    expect(res.status()).toBe(201);
    const { optionId: sofieOptie } = await res.json();
    let poll = await (await request.get('/api/polls/' + id)).json();
    const gevonden = poll.options.find((o) => o.id === sofieOptie);
    expect(gevonden.votes).toEqual([sofie.participantId]);

    // A10: Ali probeert Sofie's optie weg te halen terwijl Sofie erop staat
    res = await request.delete(`/api/polls/${id}/options/${sofieOptie}?participantId=${ali}`);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('option_in_use');

    // A11: Sofie zelf (enkel haar eigen vote) -> 200, optie weg
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

    // A14: participant weghalen -> votes weg (cascade), toegevoegde opties blijven
    res = await request.post(`/api/polls/${id}/options`, {
      data: { participantId: sofie.participantId, date: D3, time: null },
    });
    expect(res.status()).toBe(201);
    const { optionId: blijft } = await res.json();
    res = await request.delete(`/api/polls/${id}/participants/${sofie.participantId}`);
    expect(res.status()).toBe(200);
    poll = await (await request.get('/api/polls/' + id)).json();
    expect(poll.participants.find((p) => p.id === sofie.participantId)).toBeUndefined();
    const over = poll.options.find((o) => o.id === blijft);
    expect(over).toBeDefined();
    expect(over.votes).toEqual([]); // haar vote is mee verdwenen
    for (const o of poll.options) expect(o.votes).not.toContain(sofie.participantId);
  });

  test('A15 titel van 81 tekens -> 400 title_required', async ({ request }) => {
    const res = await request.post('/api/polls', {
      data: { title: 'x'.repeat(81), name: 'Ali', options: [{ date: D1, time: null }] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('title_required');
  });
});

/* ================================================================
   12.2 Scenario's in de browser
   ================================================================ */

test.describe("12.2 Scenario's", () => {
  test('S1-S8 het volledige verhaal van Ali en Sofie', async ({ browser }, testInfo) => {
    test.setTimeout(300_000);

    /* ---------- S1: Maken en delen ---------- */
    const aliCtx = await browser.newContext(ctxOpties(testInfo));
    const ali = await aliCtx.newPage();
    await ali.goto('/');
    await expect(ali.locator('#titel')).toBeFocused();
    await ali.fill('#titel', 'Etentje');
    const rij1 = ali.locator('.drow').nth(0);
    await rij1.locator('input[type="date"]').fill(D1);
    await rij1.locator('input[type="time"]').fill(T1);
    await expect(ali.locator('.drow')).toHaveCount(2); // rij 2 verschijnt automatisch
    await ali.locator('.drow').nth(1).locator('input[type="date"]').fill(D2);
    await expect(ali.locator('.drow')).toHaveCount(3);
    const maakKnop = ali.locator('button', { hasText: 'Maak de afspraak' });
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
    await expect(ali.locator('.status .groot')).toHaveText('Meerdere datums lukken');
    await expect(ali.locator('.status .sub')).toHaveText('1 van 1 kunnen op elk van deze:');
    await expect(ali.locator('.status .rijtje')).toHaveCount(2);
    await expect(ali.locator('.opt')).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const rij = ali.locator('.opt').nth(i);
      await expect(rij.locator('input[type="checkbox"]')).toBeChecked();
      await expect(rij.locator('.namen')).toHaveText('jij');
      await expect(rij.locator('.tel')).toHaveText('1');
    }
    await expect(ali.locator('#joinnaam')).toBeHidden();

    /* ---------- S2: Tweede persoon ---------- */
    const sofieCtx = await browser.newContext(ctxOpties(testInfo));
    const sofie = await sofieCtx.newPage();
    await sofie.goto(pollUrl);
    await expect(sofie.locator('.deel')).toBeHidden();
    await expect(sofie.locator('#joinnaam')).toBeVisible();
    await expect(sofie.locator('.lijst')).toHaveClass(/inactief/);
    await expect(sofie.locator('.kopje')).toHaveText('Vul eerst je naam in om aan te vinken.');
    await sofie.locator('.opt').first().click();
    await expect(sofie.locator('#joinnaam')).toBeFocused();
    await sofie.fill('#joinnaam', 'Sofie');
    await sofie.press('#joinnaam', 'Enter');
    await expect(sofie.locator('.lijst')).not.toHaveClass(/inactief/);
    await expect(sofie.locator('.kopje')).toHaveText('Vink aan wat voor jou lukt');
    const sofieRij1 = sofie.locator('.opt').nth(0); // vr 9 okt om 18:00
    await sofieRij1.locator('input[type="checkbox"]').check();
    await expect(sofieRij1).toHaveClass(/aan/);
    await expect(sofieRij1.locator('.tel')).toHaveText('2');
    await expect(sofieRij1.locator('.namen')).toHaveText('jij, Ali');
    await expect(sofie.locator('.status .groot')).toHaveText(/Iedereen kan op vr 9 okt om 18:00/);
    await expect(sofie.locator('.status .sub')).toHaveText('2 van 2 kunnen');
    await expect(sofie.locator('.status button', { hasText: 'Vastleggen' })).toBeVisible();

    /* ---------- S3: Live bij Ali, zonder herladen ---------- */
    await expect(ali.locator('.opt').nth(0).locator('.tel')).toHaveText('2', { timeout: 13_000 });
    await expect(ali.locator('.opt').nth(0).locator('.namen')).toHaveText('jij, Sofie');
    await expect(ali.locator('.status .groot')).toHaveText(/Iedereen kan op/);

    if (testInfo.project.name === 'desktop') {
      fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
      await ali.screenshot({ path: path.join(__dirname, '..', 'docs', 'screenshot.png'), fullPage: true });
    }

    /* ---------- S4: Datum toevoegen ---------- */
    await sofie.locator('button', { hasText: '+ Datum toevoegen' }).click();
    await expect(sofie.locator('.drow input[type="date"]')).toBeFocused();
    await sofie.locator('.drow input[type="date"]').fill(D3);
    await sofie.locator('.drow input[type="time"]').fill(T3);
    await sofie.locator('.drow button', { hasText: 'Toevoegen' }).click();
    await expect(sofie.locator('.opt')).toHaveCount(3);
    const nieuwe = sofie.locator('.opt').nth(2); // na 16 okt
    await expect(nieuwe).toHaveText(/23 okt/);
    await expect(nieuwe.locator('input[type="checkbox"]')).toBeChecked();
    await expect(nieuwe.locator('.tel')).toHaveText('1');
    await expect(nieuwe.locator('.namen')).toHaveText('jij');
    await expect(sofie.locator('.drow')).toBeHidden(); // invoerrij weer dicht
    // nog eens dezelfde datum+tijd
    await sofie.locator('button', { hasText: '+ Datum toevoegen' }).click();
    await sofie.locator('.drow input[type="date"]').fill(D3);
    await sofie.locator('.drow input[type="time"]').fill(T3);
    await sofie.locator('.drow button', { hasText: 'Toevoegen' }).click();
    await expect(sofie.locator('.fout', { hasText: 'Die datum staat er al.' })).toBeVisible();
    // rij sluiten voor het vervolg
    await sofie.reload();

    /* ---------- S5: Weghalen ---------- */
    const rij23 = sofie.locator('.opt', { hasText: '23 okt' });
    await rij23.hover();
    await expect(rij23.locator('.del')).toHaveCount(1);
    await rij23.locator('.del').click();
    await expect(sofie.locator('.opt')).toHaveCount(2);
    const rij9 = sofie.locator('.opt', { hasText: '9 okt' });
    await expect(rij9.locator('.del')).toHaveCount(0); // Ali én Sofie staan erop
    await rij9.locator('input[type="checkbox"]').uncheck();
    await expect(rij9.locator('.del')).toHaveCount(0); // er staat nog een vote van Ali
    // bij Ali (na de poll) verschijnt de x op 9 okt: alleen zijn eigen vote nog
    await expect(ali.locator('.opt', { hasText: '9 okt' }).locator('.del')).toHaveCount(1, { timeout: 13_000 });
    // Ali klikt er niet op.

    /* ---------- S6: Gelijkstand en vastleggen ---------- */
    await rij9.locator('input[type="checkbox"]').check();
    await sofie.locator('.opt', { hasText: '16 okt' }).locator('input[type="checkbox"]').check();
    await expect(sofie.locator('.status .groot')).toHaveText('Meerdere datums lukken');
    const aliTie = ali.locator('.status .rijtje');
    await expect(aliTie).toHaveCount(2, { timeout: 13_000 });
    await ali.locator('.status .rijtje', { hasText: '16 okt' }).locator('button').click();
    await expect(ali.locator('.status .groot')).toHaveText(/Afgesproken: vr 16 okt/);
    await expect(ali.locator('.status .sub')).toHaveText('2 van 2 kunnen');
    await expect(ali.locator('.opt', { hasText: '16 okt' })).toHaveClass(/definitief/);
    await expect(sofie.locator('.status .groot')).toHaveText(/Afgesproken/, { timeout: 13_000 });
    await sofie.locator('.status button', { hasText: 'Toch niet' }).click();
    await expect(sofie.locator('.status .groot')).toHaveText('Meerdere datums lukken');
    await expect(ali.locator('.status .groot')).toHaveText('Meerdere datums lukken', { timeout: 13_000 });

    /* ---------- S7: Terugkomen ---------- */
    await sofie.reload();
    await expect(sofie.locator('.opt').first()).toBeVisible();
    await expect(sofie.locator('#joinnaam')).toBeHidden();
    await expect(sofie.locator('.opt', { hasText: '9 okt' }).locator('input[type="checkbox"]')).toBeChecked();
    await expect(sofie.locator('.opt', { hasText: '16 okt' }).locator('input[type="checkbox"]')).toBeChecked();
    // ander "toestel", zelfde naam in kleine letters
    const toestel2 = await browser.newContext(ctxOpties(testInfo));
    const sofie2 = await toestel2.newPage();
    await sofie2.goto(pollUrl);
    await sofie2.fill('#joinnaam', 'sofie');
    await sofie2.press('#joinnaam', 'Enter');
    await expect(sofie2.locator('.opt', { hasText: '9 okt' }).locator('input[type="checkbox"]')).toBeChecked();
    await expect(sofie2.locator('.opt', { hasText: '16 okt' }).locator('input[type="checkbox"]')).toBeChecked();
    // de getoonde naam blijft "Sofie" zoals de eerste keer getypt
    await expect(ali.locator('.opt', { hasText: '9 okt' }).locator('.namen')).toHaveText(/Sofie/, { timeout: 13_000 });

    /* ---------- S8: Weggaan ---------- */
    await sofie2.locator('button', { hasText: 'Ik doe niet mee' }).click();
    await sofie2.locator('button', { hasText: 'Ja, haal me weg' }).click();
    await expect(sofie2.locator('#joinnaam')).toBeVisible();
    await expect(sofie2.locator('.opt', { hasText: '9 okt' }).locator('.tel')).toHaveText('1');
    await expect(sofie2.locator('.status .sub')).toHaveText(/1 van 1/);
    await sofie2.fill('#joinnaam', 'Sofie');
    await sofie2.press('#joinnaam', 'Enter');
    await expect(sofie2.locator('.lijst')).not.toHaveClass(/inactief/);
    await expect(sofie2.locator('.opt', { hasText: '9 okt' }).locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(sofie2.locator('.opt', { hasText: '16 okt' }).locator('input[type="checkbox"]')).not.toBeChecked();

    await aliCtx.close();
    await sofieCtx.close();
    await toestel2.close();
  });

  test('S9 onbekende link', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/p/bestaatniet');
    await expect(page.locator('h1')).toHaveText('Deze afspraak bestaat niet');
    await page.locator('button', { hasText: 'Nieuwe afspraak' }).click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('h1')).toHaveText('Wanneer spreken we af?');
    await ctx.close();
  });

  test('S10 taal wisselen met het vlaggetje', async ({ browser, request }, testInfo) => {
    const { id } = await apiMaakPoll(request, {
      title: 'Etentje', name: 'Ali', options: [{ date: D1, time: T1 }],
    });
    const ctx = await browser.newContext(ctxOpties(testInfo));
    const page = await ctx.newPage();
    await page.goto('/p/' + id);
    await expect(page.locator('.opt')).toHaveText(/vr 9 okt om 18:00/);
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'English' }).click();
    await expect(page.locator('.kopje')).toHaveText('Enter your name first to tick dates.');
    await expect(page.locator('.opt')).toHaveText(/Fri,? 9 Oct at 18:00/);
    await page.reload();
    await expect(page.locator('.kopje')).toHaveText('Enter your name first to tick dates.');
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'Français' }).click();
    await expect(page.locator('.opt')).toHaveText(/ven\.?.*9 oct\.?.*à 18:00/);
    await page.locator('#vlag').click();
    await page.locator('#talen button', { hasText: 'Nederlands' }).click();
    await expect(page.locator('.opt')).toHaveText(/vr 9 okt om 18:00/);
    await ctx.close();
  });

  test('S11 mobiel 360x740: geen horizontale scroll, knoppen >= 44px', async ({ browser, request }, testInfo) => {
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
    await expect(page.locator('.opt')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    for (const knop of await page.locator('button:visible').all()) {
      const box = await knop.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await ctx.close();
  });

  test('S12 lege afspraak en herstel', async ({ browser, request }, testInfo) => {
    const { id, participantId } = await apiMaakPoll(request, {
      title: 'Padel', name: 'Ali', options: [{ date: D1, time: null }],
    });
    // maker haalt zichzelf weg
    const weg = await request.delete(`/api/polls/${id}/participants/${participantId}`);
    expect(weg.status()).toBe(200);

    const ctx = await browser.newContext(ctxOpties(testInfo));
    const tom = await ctx.newPage();
    await tom.goto('/p/' + id);
    await expect(tom.locator('.status .stil')).toHaveText('Nog niemand heeft geantwoord.');
    await tom.fill('#joinnaam', 'Tom');
    await tom.press('#joinnaam', 'Enter');
    await expect(tom.locator('.lijst')).not.toHaveClass(/inactief/);
    await expect(tom.locator('.status .stil')).toHaveText('Nog niemand heeft geantwoord.');
    // optie met 0 votes weghalen
    const rij = tom.locator('.opt').first();
    await rij.hover();
    await expect(rij.locator('.del')).toHaveCount(1);
    await rij.locator('.del').click();
    await expect(tom.locator('.leeg')).toHaveText('Nog geen datums. Voeg er een toe.');
    await expect(tom.locator('.drow')).toBeVisible(); // toevoegrij staat open
    // datum toevoegen -> status 7.3
    await tom.locator('.drow input[type="date"]').fill(D2);
    await tom.locator('.drow button', { hasText: 'Toevoegen' }).click();
    await expect(tom.locator('.status .groot')).toHaveText(/We hebben een datum: vr 16 okt/);
    await ctx.close();
  });
});

/* ================================================================
   12.3 Statische controles
   ================================================================ */

test.describe('12.3 Statisch', () => {
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

  test('wrangler deploy --dry-run slaagt', ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'één keer volstaat');
    execSync('npx wrangler deploy --dry-run', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      timeout: 120_000,
    });
  });
});
