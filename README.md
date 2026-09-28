# Prikdatum

**Probeer het live: [prikdatum.vanali.workers.dev](https://prikdatum.vanali.workers.dev)**

**Een datum prikken met vrienden, zonder gedoe.** Typ waarover het gaat, kies een paar datums, deel de link. Wie de link opent, typt zijn naam en vinkt aan welke datums lukken. Zodra er een datum uitspringt, staat er bovenaan in het groen: *"We hebben een datum!"*

Geen accounts. Geen wachtwoorden. Geen beheerder. Geen opslaan-knop. Iedereen met de link kan precies hetzelfde.

*(EN: a zero-friction date picker for groups of friends. No accounts, no admin, just a link. Interface in Dutch, English and French.)*

![Prikdatum](docs/screenshot.png)

## Waarom dit fijn werkt

- **Het gaat vanzelf** — een vinkje is meteen opgeslagen; er is geen opslaan-knop en geen enkel bevestigingsvenster.
- **Iedereen is gelijk** — wie de link heeft kan datums toevoegen, aanvinken en de knoop doorhakken. Er is niets dat alleen "de maker" kan.
- **Je naam is je identiteit** — dezelfde naam op een ander toestel geeft je je eigen vinkjes terug.
- **Nooit iets kapot** — je kunt alleen weghalen wat van jezelf is of wat niemand anders gebruikt.
- **Drie talen** — Nederlands, Engels en Frans, wisselbaar met het vlaggetje, zonder herladen.
- **Licht en gratis** — één HTML-bestand, één Worker, één SQLite-database (Cloudflare D1). Geen frameworks, geen build-stap, geen externe scripts of fonts. Past ruim binnen het gratis plan van Cloudflare.

## Techniek

| Onderdeel | Keuze |
|---|---|
| Hosting | Cloudflare Workers (gratis plan) met Static Assets |
| Opslag | Cloudflare D1 (SQLite) |
| Frontend | Eén `public/index.html`, inline CSS + JS, systeemfont |
| Backend | Eén `src/worker.js` (ES-module Worker), alleen `/api/*` |
| Testen | Playwright: 15 API-testen + 12 browserscenario's, ook op 360 px |

## Testen draaien

```
npm install
npm test
```

`npm test` zet zelf de lokale database op en start `wrangler dev`. De testen draaien twee keer: op desktop en op een viewport van 360×740.

---

# Prikdatum online zetten (eenmalig, ±10 minuten, gratis)

Nodig: een computer met Node 18+ en een gratis Cloudflare-account (cloudflare.com → Sign up).

1. Open een terminal in deze map en installeer wrangler:

       npm install

2. Meld je aan bij Cloudflare (opent de browser):

       npx wrangler login

3. Maak de database:

       npx wrangler d1 create prikdatum

   Kopieer de regel `database_id = "…"` uit de uitvoer naar `wrangler.toml`
   (vervang VUL-IN-NA-STAP-3).

4. Maak de tabellen:

       npm run db:remote

5. Zet online:

       npm run deploy

   Onderaan staat je adres: `https://prikdatum.<jouw-naam>.workers.dev`

Klaar. Deel dat adres. Iedereen die het opent kan een afspraak maken.

Later iets aanpassen? Wijzig de bestanden en doe opnieuw `npm run deploy`.

Eigen domein? In het Cloudflare-dashboard: Workers & Pages → prikdatum → Settings → Domains & Routes.

## Licentie

MIT — doe ermee wat je wilt.
