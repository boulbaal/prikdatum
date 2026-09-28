// Testconfig: draait alle testen tegen wrangler dev op http://localhost:8787.
// `npm test` start de server zelf (na db:local); een al draaiende server wordt hergebruikt.
const { defineConfig } = require('@playwright/test');
const fs = require('fs');

// In omgevingen met een voorgeïnstalleerde Chromium (CHROMIUM_PATH of /opt/pw-browsers/chromium)
// gebruiken we die; anders de gewone Playwright-download (npx playwright install chromium).
const chromiumPad = process.env.CHROMIUM_PATH ||
  (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8787',
    launchOptions: chromiumPad ? { executablePath: chromiumPad } : {},
  },
  webServer: {
    command: 'npm run db:local && npm run dev',
    url: 'http://localhost:8787',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobiel-360', use: { viewport: { width: 360, height: 740 }, hasTouch: true } },
  ],
});
