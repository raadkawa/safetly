// Tester at appen oppdaterer seg selv når en ny versjon legges ut.
// Kjør: node scripts/test-update.cjs   (krever Playwright med Chromium)
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SRC = path.join(__dirname, '..', 'www');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'safetly-oppdatering-'));
const PORT = 8095;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function publish(v) {
  fs.cpSync(SRC, DIR, { recursive: true });
  for (const f of ['index.html', 'sw.js']) { const p = path.join(DIR, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('__VERSION__', v)); }
  fs.writeFileSync(path.join(DIR, 'version.json'), JSON.stringify({ version: v }));
  // Demomodus, uansett hva config.js inneholder.
  fs.writeFileSync(path.join(DIR, 'config.js'), "window.SAFETLY_CONFIG={meetingPlace:{name:'Torget'}};");
}

(async () => {
  publish('aaaa1111');
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(DIR, p);
    // Som GitHub Pages: filer kan caches i 10 minutter.
    fs.readFile(f, (err, body) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); res.end(body); });
  }).listen(PORT);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  let ok = true;
  const step = (m) => console.log('✓ ' + m);
  try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole('button', { name: 'Ny konto' }).waitFor();
    if (await page.evaluate(() => window.SAFETLY_VERSION) !== 'aaaa1111') throw new Error('feil startversjon');
    await page.waitForTimeout(1500);
    step('versjon aaaa1111 lastet');

    publish('bbbb2222');
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.evaluate(() => window.dispatchEvent(new Event('focus')))]);
    await page.getByRole('button', { name: 'Ny konto' }).waitFor();
    const v2 = await page.evaluate(() => window.SAFETLY_VERSION);
    if (v2 !== 'bbbb2222') throw new Error('oppdaterte ikke, versjon er ' + v2);
    step('oppdaterte seg selv til bbbb2222 (selv om filene kan caches i 10 min)');

    await page.getByLabel('E-post').fill('halvferdig@eksempel.no');
    publish('cccc3333');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.locator('#update-bar').waitFor({ timeout: 10000 });
    if (await page.evaluate(() => window.SAFETLY_VERSION) !== 'bbbb2222') throw new Error('lastet om mens brukeren skrev');
    step('venter mens brukeren skriver, og viser «Ny versjon … Oppdater»');
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.locator('#update-bar button').click()]);
    if (await page.evaluate(() => window.SAFETLY_VERSION) !== 'cccc3333') throw new Error('knappen oppdaterte ikke');
    step('«Oppdater»-knappen henter cccc3333');
    console.log('\nOPPDATERINGSTEST OK');
  } catch (e) { ok = false; console.error('FEIL:', e.message); }
  await browser.close(); server.close(); fs.rmSync(DIR, { recursive: true, force: true });
  process.exitCode = ok ? 0 : 1;
})();
