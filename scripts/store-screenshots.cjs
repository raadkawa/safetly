// Lager skjermbilder til App Store og Google Play fra demomodus.
// Kjør: node scripts/store-screenshots.cjs [utmappe]   (krever Playwright med Chromium)
//   iphone/  1290×2796  (App Store, 6,7–6,9 tommer)
//   android/ 1080×1920  (Google Play, telefon)
//   google-feature.png 1024×500 (Google Play «Feature graphic»), google-icon.png 512×512
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 8093;
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'store'));
const WWW = path.join(__dirname, '..', 'www');
const DEMO = "window.SAFETLY_CONFIG={meetingPlace:{name:'Rema 1000 Hallset',address:'Selsbakkvegen',note:'Møt opp 10 minutter før vakt. Vester og lykter ligger i kassen.'}};";

const SCENES = [
  { id: '1-vakter', title: 'Book vakter med ett trykk', sub: 'Se hvem du går sammen med' },
  { id: '2-kalender', title: 'Hele måneden på ett blikk', sub: 'Se hvilke kvelder som trenger folk' },
  { id: '3-meldinger', title: 'Skriv til andre foreldre', sub: 'Og få beskjed fra koordinatorene' },
  { id: '4-kart', title: 'Kart og sjekkpunkter', sub: 'Vaktområdet for ditt nabolag' },
  { id: '5-nodhjelp', title: 'Nødhjelp alltid nær', sub: 'Ring 112, 113 eller 110 med ett trykk' },
  { id: '6-nyheter', title: 'Ukas nyheter og rapporter', sub: 'Hold deg oppdatert på nabolaget' }
];

(async () => {
  fs.mkdirSync(path.join(OUT, 'iphone'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'android'), { recursive: true });
  const raw = path.join(OUT, 'raw'); fs.mkdirSync(raw, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch();
  try {
    // 1) Skjermbilder av appen (390×844 punkter, 3x)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'nb-NO', serviceWorkers: 'block' });
    await ctx.route(/supabase\.co/, (r) => r.abort());
    await ctx.route(/\/config\.js(\?|$)/, (r) => r.fulfill({ contentType: 'text/javascript', body: DEMO }));
    await ctx.addInitScript(() => addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.demo-banner,.toast{display:none!important}'; document.head.appendChild(s); window.confirm = () => true; }));
    const page = await ctx.newPage();
    const nav = (name) => page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name });
    const snap = async (id) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(raw, id + '.png') }); };
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole('button', { name: 'Ny konto' }).click();
    await page.getByLabel('Navn').fill('Ingrid Haugen'); await page.getByLabel('E-post').fill('ingrid@eksempel.no');
    await page.getByLabel('Passord').fill('hemmelig1'); await page.getByLabel('Telefon').fill('481 22 333');
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await page.getByRole('button', { name: /Byåsen – Hallset/ }).click();
    await page.locator('nav.nav').waitFor();
    // en vakt i kveld så «Din neste vakt» vises
    const book = page.getByRole('button', { name: /^Book meg på/ }).first();
    if (await book.count()) await book.click();
    await page.waitForTimeout(500); await page.evaluate(() => window.scrollTo(0, 0));
    await snap('1-vakter');
    await nav('Kalender').click(); await page.locator('.cal-grid').waitFor();
    const ev = page.locator('.cal-grid .cell:has(.mark.event)').first(); if (await ev.count()) await ev.click();
    await page.evaluate(() => window.scrollTo(0, 0)); await snap('2-kalender');
    await page.getByRole('link', { name: /^Meldinger/ }).click();
    await page.getByRole('link', { name: /Kari Nilsen/ }).click();
    await page.locator('textarea[data-autogrow]').fill('Takk! Jeg tar gjerne fredag kveld.');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.locator('.receipt.seen').waitFor({ timeout: 10000 });
    await snap('3-meldinger');
    await page.getByRole('link', { name: 'Tilbake til meldinger' }).click();
    await nav('Info').click();
    await page.getByRole('link', { name: /Vaktområde og sjekkpunkter/ }).click();
    await page.locator('.leaflet-container').waitFor(); await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 120)); await snap('4-kart');
    await page.getByRole('link', { name: 'Nødhjelp' }).first().click();
    await page.getByRole('heading', { name: 'Ring hvis noen er i fare' }).waitFor(); await snap('5-nodhjelp');
    await page.getByRole('link', { name: 'Lukk nødhjelp' }).click();
    await nav('Nyheter').click(); await page.getByRole('heading', { name: 'Vaktrapporter' }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#nytt').getBoundingClientRect().top + scrollY - 70));
    await snap('6-nyheter');
    await ctx.close();

    // 2) Butikkbilder med overskrift
    const fonts = (n) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(WWW, 'fonts', n)).toString('base64');
    const frame = (s, w, h) => `<html><head><style>
      @font-face{font-family:Figtree;font-weight:600;src:url(${fonts('figtree-600.woff2')})}
      @font-face{font-family:Bricolage;font-weight:800;src:url(${fonts('bricolage-800.woff2')})}
      body{margin:0;width:${w}px;height:${h}px;background:#F6F0E4;font-family:Figtree;color:#1C1A16;overflow:hidden;position:relative;display:flex;flex-direction:column;align-items:center}
      .b{position:absolute;border-radius:${w * 0.08}px}
      h1{font-family:Bricolage;font-weight:800;font-size:${w * 0.075}px;line-height:1.08;margin:${h * 0.05}px ${w * 0.08}px 0;text-align:center;position:relative}
      p{font-size:${w * 0.04}px;margin:${h * 0.012}px ${w * 0.1}px 0;text-align:center;color:#5A5449;position:relative}
      .phone{position:relative;margin-top:${h * 0.035}px;width:${w * 0.78}px;border-radius:${w * 0.07}px;overflow:hidden;box-shadow:0 0 0 ${w * 0.012}px #1C1A16,0 ${w * 0.03}px ${w * 0.08}px rgba(0,0,0,.25)}
      .phone img{display:block;width:100%}
    </style></head><body>
      <div class="b" style="left:-${w * 0.15}px;top:-${w * 0.12}px;width:${w * 0.6}px;height:${w * 0.5}px;background:#D4E3F5;transform:rotate(-8deg)"></div>
      <div class="b" style="right:-${w * 0.18}px;top:${h * 0.08}px;width:${w * 0.5}px;height:${w * 0.42}px;background:#F5E2A0;transform:rotate(10deg)"></div>
      <div class="b" style="left:-${w * 0.1}px;bottom:-${w * 0.1}px;width:${w * 1.2}px;height:${h * 0.35}px;background:#F3D2D8;transform:rotate(-4deg)"></div>
      <h1>${s.title}</h1><p>${s.sub}</p>
      <div class="phone"><img src="data:image/png;base64,${fs.readFileSync(path.join(raw, s.id + '.png')).toString('base64')}"></div>
    </body></html>`;
    const fctx = await browser.newContext({ deviceScaleFactor: 1 });
    const fp = await fctx.newPage();
    for (const [dir, w, h] of [['iphone', 1290, 2796], ['android', 1080, 1920]]) {
      await fp.setViewportSize({ width: w, height: h });
      for (const s of SCENES) {
        await fp.setContent(frame(s, w, h)); await fp.waitForTimeout(150);
        await fp.screenshot({ path: path.join(OUT, dir, s.id + '.png') });
      }
    }
    // Google Play: «Feature graphic» og ikon
    await fp.setViewportSize({ width: 1024, height: 500 });
    await fp.setContent(`<html><head><style>@font-face{font-family:Bricolage;font-weight:800;src:url(${fonts('bricolage-800.woff2')})}@font-face{font-family:Figtree;font-weight:600;src:url(${fonts('figtree-600.woff2')})}
      body{margin:0;width:1024px;height:500px;background:#F6F0E4;display:flex;align-items:center;gap:44px;padding:0 80px;box-sizing:border-box;font-family:Figtree;color:#1C1A16;position:relative;overflow:hidden}
      .b{position:absolute;border-radius:80px}.logo{width:190px;height:190px;border-radius:54px;background:#1C1A16;color:#F6F0E4;display:grid;place-items:center;flex:none;position:relative}
      h1{font-family:Bricolage;font-weight:800;font-size:96px;margin:0;line-height:1}p{font-size:34px;margin:12px 0 0;color:#5A5449}</style></head><body>
      <div class="b" style="right:-80px;top:-120px;width:420px;height:320px;background:#D4E3F5;transform:rotate(8deg)"></div>
      <div class="b" style="right:120px;bottom:-160px;width:380px;height:280px;background:#F3D2D8;transform:rotate(-6deg)"></div>
      <div class="logo"><svg width="110" height="110" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 4a8 8 0 1 0 4.5 13.5A6.5 6.5 0 0 1 15.5 4z"/></svg></div>
      <div style="position:relative"><h1>Safetly</h1><p>Natteravner i nabolaget.<br>Foreldre sammen for trygge kvelder.</p></div></body></html>`);
    await fp.waitForTimeout(150);
    await fp.screenshot({ path: path.join(OUT, 'google-feature.png') });
    fs.copyFileSync(path.join(WWW, 'icons', 'icon-512.png'), path.join(OUT, 'google-icon.png'));
    await fctx.close();
    fs.rmSync(raw, { recursive: true, force: true });
    console.log('Butikkbilder i ' + OUT);
  } finally {
    await browser.close(); server.kill();
  }
})().catch((e) => { console.error('FEIL:', e.message); process.exitCode = 1; });
