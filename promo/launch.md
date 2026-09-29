# Whenly: globale launch (stap voor stap)

Doel: de eerste echte gebruikers en wat cijfers, via de kanalen waar een maker normaal zijn eigen werk toont. Daarna pas regionaal (Azië, Afrika, Oost-Europa) met die cijfers in de hand; dat staat in `whenly-promokit.md`.

Afspraken die overal gelden:

- Afzender: **Whenly** of **"the maker of Whenly"**. Geen persoonsnaam, geen locatie, geen foto.
- Contact: alleen **github.com/boulbaal/whenly/issues**. Nergens een e-mailadres.
- Nooit om upvotes vragen, ook niet aan vrienden. Hacker News en Product Hunt straffen dat af (posts verdwijnen, stemmen tellen niet).
- Antwoord snel en eerlijk op elke reactie, vooral kritiek. Dat is op HN en PH wat een post laat stijgen, niet de stemmen.
- Eén kanaal per dag. Niet alles op dezelfde dag, dan kun je de reacties niet bijhouden.
- Ik plaats niets; jij plakt. Ik maak accounts niet aan.

Status van de tekst hieronder: klaar om te plakken. Pas aan wat je anders wilt zeggen, het is jouw stem.

---

## Stap 0: voor je ergens post (deze week)

1. **GitHub-repo netjes.** README is nu Engels bovenaan met een screenshot, Nederlands eronder. Nog te doen door jou (Settings van de repo, of ik doe het via `gh` als dat op je pc staat):
   - Description: `Pick a date with a group. No account, no ads, free. 23 languages. Cloudflare Workers + D1, one HTML file.`
   - Website: `https://whenly.vanali.workers.dev`
   - Topics: `scheduling`, `date-picker`, `group-scheduling`, `doodle-alternative`, `cloudflare-workers`, `d1`, `pwa`, `i18n`, `no-account`
2. **Product Hunt-account nu al aanmaken** (jij), onder de naam die je wil, en de komende twee weken af en toe een product upvoten of een reactie schrijven. PH weegt stemmen en posts van gloednieuwe accounts lager. Launch daarom pas in stap 4.
3. **Hacker News-account** (jij). Ook hier telt leeftijd van het account iets; maak hem nu.
4. **Google Search Console en Bing Webmaster Tools** (jij, eigen Google/Microsoft-account). Verifiëren kan met een HTML-bestand: geef mij het bestand of de code, ik zet het op de site. Daarna de sitemap indienen: `https://whenly.vanali.workers.dev/sitemap.xml`. Zonder dit weet Google niet dat de 23 taalpagina's bestaan.
5. **Geen awesome-selfhosted.** Die lijst eist dat software niet van één cloudprovider afhangt en dat het project minstens vier maanden oud is. Whenly draait op Cloudflare Workers + D1 en is één dag oud. Punt 10 uit de promokit vervalt dus. Awesome-lijsten rond scheduling zijn er wel; die zoeken we op zodra er gebruikers zijn.
6. **Niet doen:** Lobsters (alleen op uitnodiging), BetaList (voor bèta's, betaalde wachtrij), massaal aanmelden bij "launch directories" die om een backlink of geld vragen.

---

## Stap 1: directories (dag 1, ±1 uur, laag risico)

Deze vragen een account (jij) en een korte tekst. Eén keer invullen, daarna niets meer aan doen.

**Korte omschrijving (≤ 160 tekens):**

> Pick a date with your group. No account, no ads, free. One link, everyone taps the days that work. 23 languages, open source.

**Lange omschrijving:**

> Whenly is a free group date picker. You type a title and your name, tap the days that work for you and share the link. Everyone who opens it types their name and taps along; a green banner shows the first day everyone can make. No account for anyone, no e-mail, no ads, no tracking. Works in the browser on any phone, installs as a PWA, and comes in 23 languages including Arabic, Hindi, Chinese, Russian, Swahili, Tamazight, Kurdish and Shona. Anyone with the link can delete the poll completely. Open source (MIT), a single HTML file on Cloudflare Workers.

**Categorie / tags:** scheduling, calendar, group planning, productivity, open source, no signup.

**"Alternative to":** Doodle, When2meet, Rallly, Crab Fit, LettuceMeet, Xoyondo.

Waar:

1. **AlternativeTo** (alternativeto.net → Add an app). Zet Whenly als alternatief voor Doodle en When2meet. Wordt door een redacteur nagekeken; dat duurt dagen tot weken.
2. **OpenAlternative** (openalternative.co → Submit). Voor open-source alternatieven; Whenly past daar precies. Vraagt de GitHub-URL.
3. **SaaSHub** (saashub.com → Add a product).
4. **Uneed** (uneed.best → Submit). Gratis plek staat in een wachtrij van weken; de betaalde overslaan.
5. **Fazier** (fazier.com → Submit).
6. **Peerlist** (peerlist.io → Launch): vraagt een profiel; alleen als je dat toch wil.

Screenshots: `promo/assets/shot-desktop-poll-en.png` (1270×760 @2x) en `shot-mobiel-poll-en.png`. Logo: `public/icon-512.png`.

---

## Stap 2: Show HN (dag 2 of 3, een dinsdag t/m donderdag, posten tussen 14:00 en 16:00 Belgische tijd)

Regels van HN voor Show HN: iets dat mensen meteen kunnen proberen (klopt), geen aanmelding nodig (klopt), jij hebt het zelf gemaakt en blijft erbij om vragen te beantwoorden (dat laatste is het belangrijkste: hou de dag vrij).

**URL-veld:** `https://whenly.vanali.workers.dev`

**Titel (max. 80 tekens):**

> Show HN: Whenly – group date picker with no accounts, in 23 languages

**Tekstveld** (HN toont dit onder de link; kort, feitelijk, geen marketingtoon):

> I built this because every time our group of friends wanted to plan a dinner, the tool asked half of them to create an account or showed ads. Whenly is one link: type a title and your name, tap the days that work, share. Whoever opens the link types a name and taps along. A green banner shows the first day everyone can make.
>
> Some choices you may find interesting:
>
> - No accounts at all, not even for the creator. Identity is your name plus a token in localStorage; the same name on another device gets your ticks back. Anyone with the link can do anything, including deleting the poll. If someone removes a name, the group sees a note for 30 days that a person did it, not the app.
> - 23 languages, including RTL (Arabic, Urdu) and languages browsers have no Intl data for (Tamazight in Tifinagh, Kurmanji Kurdish, Shona), so the calendar carries its own weekday and month names for those. Week start and 12/24h follow the locale.
> - One HTML file, no framework, no build step, no external scripts or fonts. Backend is one Cloudflare Worker with D1 (SQLite). Fits in the free plan. Playwright tests run every scenario twice, desktop and 360 px.
> - Data: title, names, tapped days. Nothing else. Untouched polls are deleted after 12 months.
>
> Source (MIT): https://github.com/boulbaal/whenly
>
> Happy to hear what breaks, especially in languages I can't read myself.

**Wat je kunt verwachten aan vragen, en eerlijke antwoorden:**

- *"Anyone with the link can delete everything? That's a vandalism problem."* → Yes, by design. It's for groups of friends who already trust each other; the link is a 10-character random code and poll pages aren't indexed. If a group can't trust its members with a link, it needs a different tool. The removed-name note exists so the group knows it was a person.
- *"Why Cloudflare only? Not self-hostable."* → It runs on Workers + D1 because that's free and zero-ops. It's MIT; the worker is one file with plain SQL, porting to another SQLite host is straightforward. Fair criticism though.
- *"How do you make money?"* → I don't. There's a donate button. It costs me nothing to run on the free plan.
- *"How is this different from Rallly / Crab Fit / When2meet?"* → Rallly is the closest and also needs no account; it works with time slots and is a bigger app with paid plans and self-hosting. Crab Fit and When2meet do time grids. Whenly does whole days only, in 23 languages, in one file. If someone needs time slots, say so and point them to Rallly; don't invent claims about other tools.
- *"The translations are machine-made?"* → They were written with an LLM and checked by me where I can read the language; three of them (Tamazight, Kurdish, Shona) I can't check. Corrections welcome as issues.

---

## Stap 3: Reddit (dag 4 t/m 7, één sub per dag)

Lees vóór elke post de regels in de zijbalk van die sub; ze veranderen, en een verwijderde post is erger dan geen post. Gebruik een account dat al wat geschiedenis heeft; gloednieuwe accounts met alleen een link worden automatisch verwijderd.

**r/SideProject** (zelfpromotie is de bedoeling daar)

Titel:
> I made a group date picker that needs no accounts from anyone, in 23 languages

Tekst:
> Whenly: type a title and your name, tap the days that work, share the link. Friends open it, type their name, tap along. Green banner when everyone can make it. No sign-up for anyone, no ads, no tracking, free. 23 languages incl. Arabic, Hindi, Chinese, Swahili. One HTML file on Cloudflare Workers, open source (MIT).
>
> https://whenly.vanali.workers.dev
>
> Built it because Doodle kept asking my friends to register. Would love to know where it breaks for you.

**r/InternetIsBeautiful** (eist: gratis, geen aanmelding; flair "I Made This"; controleer of tools/apps nog toegelaten zijn)

Titel:
> Whenly: pick a date with a group without anyone creating an account, free and in 23 languages

Geen tekst nodig; de link is de post.

**r/opensource**

Titel:
> Whenly: an MIT-licensed group date picker with no accounts, one HTML file on Cloudflare Workers

Tekst: de Show HN-tekst, ingekort tot de eerste alinea plus de vier punten, met de GitHub-link bovenaan.

**r/webdev**: alleen op **Showoff Saturday** (zaterdag), anders wordt het verwijderd. Zelfde tekst als r/SideProject, met één technische alinea erbij (single file, no framework, Playwright on two viewports).

**r/selfhosted**: overslaan. Whenly is niet zelf te hosten buiten Cloudflare; daar krijg je terecht kritiek.

---

## Stap 4: Product Hunt (week 3, een dinsdag of woensdag; de dag begint om 09:01 Belgische tijd, 12:01 am Pacific)

Voorbereiden op PH kan je een paar dagen vooraf; kies dan de launchdatum.

**Naam:** Whenly

**Tagline (max. 60 tekens):**
> Pick a date with your group. No account, no ads, free.

**Omschrijving:** de lange omschrijving uit stap 1.

**Topics:** Productivity, Calendar, Open Source, Meetings.

**Galerij** (1270×760): `shot-desktop-poll-en.png`, `shot-desktop-home-en.png`, `shot-mobiel-poll-en.png` (zet die op een achtergrond van 1270×760, of laat mij dat doen). Eerste beeld: de afspraakpagina met het groene "Everyone can make …". Geen logo als eerste beeld.

**Thumbnail:** `public/icon-512.png`.

**Eerste reactie (jij, meteen na de launch; dit is wat mensen lezen):**

> Hi everyone. I'm the maker of Whenly.
>
> The problem: planning a dinner with six friends means one of them can't be bothered to create an account, and the poll dies. Whenly asks nothing of anyone: one link, type your name, tap the days that work. A green banner shows the first day everyone can make.
>
> A few things I cared about:
> - No accounts, no e-mail, no ads, no tracking. Only the title, names and days are stored, and anyone with the link can delete the whole poll.
> - 23 languages, right-to-left included, picked from your browser. The FAQ and privacy page are translated too.
> - Light: one HTML file, no app to install (it works as a PWA if you want it on your home screen). Fine on slow connections.
> - Free, and it stays free. Open source under MIT.
>
> I'd love to hear where it breaks, and which language reads badly. I'll be here all day.

**Makers:** alleen jouw PH-profiel. Geen "hunter" zoeken; PH weegt bekende hunters niet meer zwaarder.

**Niet doen:** vrienden vragen om te stemmen, links naar de PH-pagina in groepen zetten met "please upvote". Wel mag: "we staan vandaag op Product Hunt, kijk gerust" zonder om een stem te vragen.

---

## Stap 5: meten (vanaf dag 1)

- Bezoekers: Cloudflare-dashboard → Workers & Pages → whenly → Metrics (requests per dag). Geen analytics op de site zelf, dat is de afspraak op de privacypagina; het dashboard telt verzoeken, geen personen.
- Afspraken: `wrangler d1 execute prikdatum --remote --command "SELECT count(*) FROM polls"` vanuit de projectmap.
- GitHub: sterren en issues.

Na twee weken: cijfers naast de kanalen leggen en beslissen waar de regionale fase begint. Mijn verwachting vooraf, zodat we die kunnen toetsen: Show HN en r/SideProject leveren het meeste, directories bijna niets op korte termijn maar wel zoekverkeer op lange termijn, Product Hunt is een gok die afhangt van de eerste twee uur.

---

## Wat ik zelf nog kan doen zonder account

- Verificatiebestand voor Search Console / Bing op de site zetten zodra jij het geeft.
- IndexNow (Bing, Yandex, Naver, Seznam) instellen: een sleutelbestand op de site en de sitemap-URL's aanmelden. Google doet niet mee aan IndexNow.
- Galerijbeelden op maat maken (1270×760 met de telefoonscreenshot op een achtergrond).
- Een Engelse demo-GIF van 10 seconden voor PH en Reddit (frames staan al in `promo/assets/gif-*-en.png`).
- Antwoorden helpen schrijven op reacties, als je ze me doorgeeft.
