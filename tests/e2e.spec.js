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
    await expect(ali.locator('.status .stil')).toHaveText('Nog niemand heeft geantwoord.');

    await toonMaand(ali, MAAND);
    await dag(ali, D1).click();
    await expect(dag(ali, D1)).toHaveClass(/mijn/);
    await expect(dag(ali, D1).locator('.dvink')).toHaveCount(1); // je eigen vinkje
    await expect(ali.locator('.taplijn')).toContainText('9 okt');
    await expect(ali.locator('.taplijn')).toContainText('jij');
    await dag(ali, D2).click();
    await expect(dag(ali, D2)).toHaveClass(/mijn/);
    await expect(ali.locator('.status .groot')).toHaveText('Meerdere datums lukken');
    await expect(ali.locator('.status .sub')).toHaveText('1 van 1 kunnen op elk van deze:');

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
    // 9 okt springt eruit -> status 7.3 met namen en uurveld
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
    // stand: 9 okt = Ali+Sofie (2), 16 okt = Ali (1), 3 deelnemers
    await expect(ali.locator('.status .groot')).toHaveText(/We hebben een datum: vr 9 okt om 18:00/, { timeout: 13_000 });
    await expect(ali.locator('.status .sub')).toHaveText('2 van 3 kunnen');
    await ali.locator('.status button', { hasText: 'Vastleggen' }).click();
    await expect(ali.locator('.status .groot')).toHaveText(/Afgesproken: vr 9 okt om 18:00/);
    await expect(dag(ali, D1)).toHaveClass(/definitief/);
    await expect(sofie.locator('.status .groot')).toHaveText(/Afgesproken/, { timeout: 13_000 });
    await sofie.locator('.status button', { hasText: 'Toch niet' }).click();
    await expect(sofie.locator('.status .groot')).toHaveText(/We hebben een datum/);
    await expect(ali.locator('.status .groot')).toHaveText(/We hebben een datum/, { timeout: 13_000 });

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
    await sofie2.locator('.weg > button').click();          // "Haal Sofie weg uit deze afspraak"
    await sofie2.locator('.weg .bevestig button.ja').click(); // "Ja, haal Sofie weg"
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

  test('wrangler deploy --dry-run slaagt', ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'één keer volstaat');
    execSync('npx wrangler deploy --dry-run', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      timeout: 120_000,
    });
  });
});
