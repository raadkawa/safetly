// Tar opp en demovideo av Safetly (demomodus) på mobilskjerm, med norske tekster.
// Kjør: node scripts/demo-video.cjs [utmappe]   (krever Playwright med Chromium og ffmpeg)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 8097;
const OUT = process.argv[2] || path.join(__dirname, '..', 'demo-video');
fs.mkdirSync(OUT, { recursive: true });
// 9:16 fullskjerm, 1080×1920
const W = 390, H = Math.round(390 * 16 / 9), OUT_W = 1080, OUT_H = 1920;

const DEMO_CONFIG = "window.SAFETLY_CONFIG={meetingPlace:{name:'Nærbutikken ved Torget',address:'Storgata 12',note:'Møt opp 10 minutter før vakt. Vester og lykter ligger i kassen bak disken.'}};";

const OVERLAY_CSS = `
.demo-banner{display:none !important}
#demo-cap{position:fixed;left:12px;right:12px;bottom:110px;z-index:9999;background:rgba(28,26,22,.92);color:#FFFCF6;
  font:600 17px/1.35 Figtree,system-ui,sans-serif;padding:14px 18px;border-radius:20px;box-shadow:0 8px 24px rgba(0,0,0,.25);
  opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;pointer-events:none;text-align:center}
#demo-cap.on{opacity:1;transform:none}
#demo-cap small{display:block;font-weight:400;font-size:14px;opacity:.85;margin-top:4px}
#demo-title{position:fixed;inset:0;z-index:10000;background:#F6F0E4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  font-family:Figtree,system-ui,sans-serif;color:#1C1A16;text-align:center;padding:32px;transition:opacity .5s}
#demo-title h1{font-family:Bricolage,Figtree,sans-serif;font-size:44px;margin:0}
#demo-title p{white-space:pre-line;font-size:19px;margin:0;line-height:1.4;color:#5A5449}
#demo-title .logo{width:84px;height:84px;border-radius:26px;background:#1C1A16;color:#F6F0E4;display:grid;place-items:center}
.demo-tap{position:fixed;z-index:9998;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:999px;background:rgba(47,111,214,.35);
  border:3px solid rgba(47,111,214,.9);pointer-events:none;animation:demotap .6s ease-out forwards}
@keyframes demotap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}`;

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: OUT_W / W, locale: 'nb-NO', serviceWorkers: 'block', hasTouch: true,
    recordVideo: { dir: OUT, size: { width: OUT_W, height: OUT_H } }
  });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: DEMO_CONFIG }));
  await ctx.addInitScript((css) => {
    // Fast dato i demoen er ikke nødvendig; vi bruker dagens dato.
    addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
    window.confirm = () => true;
  }, OVERLAY_CSS);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const wait = (ms) => page.waitForTimeout(ms);
  const nav = (name) => page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name });

  async function caption(text, sub) {
    await page.evaluate(([t, s]) => {
      let el = document.getElementById('demo-cap');
      if (!el) { el = document.createElement('div'); el.id = 'demo-cap'; document.body.appendChild(el); }
      el.classList.remove('on');
      el.innerHTML = '';
      el.append(t);
      if (s) { const sm = document.createElement('small'); sm.textContent = s; el.append(sm); }
      requestAnimationFrame(() => el.classList.add('on'));
    }, [text, sub || '']);
    await wait(400);
  }
  async function hideCaption() { await page.evaluate(() => { const el = document.getElementById('demo-cap'); if (el) el.classList.remove('on'); }); await wait(300); }
  async function tap(locator, pause = 700) {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    if (b) await page.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'demo-tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, [b.x + b.width / 2, b.y + b.height / 2]);
    await wait(250);
    await locator.click();
    await wait(pause);
  }
  async function type(locator, text) { await locator.click(); await locator.pressSequentially(text, { delay: 55 }); await wait(200); }
  async function scrollTo(y, ms = 900) { await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'smooth' }), y); await wait(ms); }
  async function scrollToEl(locator, offset = 120) {
    const y = await locator.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
    await scrollTo(y);
  }
  async function title(h, p, ms) {
    await page.evaluate(([hh, pp]) => {
      const d = document.createElement('div'); d.id = 'demo-title';
      d.innerHTML = '<div class="logo"><svg width="46" height="46" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 4a8 8 0 1 0 4.5 13.5A6.5 6.5 0 0 1 15.5 4z"/></svg></div>';
      const a = document.createElement('h1'); a.textContent = hh; const b = document.createElement('p'); b.textContent = pp;
      d.append(a, b); document.body.appendChild(d);
    }, [h, p]);
    await wait(ms);
    await page.evaluate(() => { const d = document.getElementById('demo-title'); d.style.opacity = '0'; setTimeout(() => d.remove(), 600); });
    await wait(600);
  }

  try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole('button', { name: 'Ny konto' }).waitFor();
    await title('Safetly', 'Natteravner i nabolaget.\nForeldre sammen for et tryggere nærmiljø.', 3200);

    // 1. Ny konto
    await caption('Lag konto med e-post og passord', 'Telefonnummeret ser bare koordinatorene');
    await tap(page.getByRole('button', { name: 'Ny konto' }), 500);
    await type(page.getByLabel('Navn'), 'Ingrid Haugen');
    await type(page.getByLabel('E-post'), 'ingrid@eksempel.no');
    await type(page.getByLabel('Passord'), 'hemmelig1');
    await type(page.getByLabel('Telefon'), '481 22 333');
    await tap(page.getByRole('button', { name: 'Opprett konto' }), 900);
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Ingrid' }).waitFor();

    // Gi Ingrid en vakt i går, så vaktrapporten kan vises senere i videoen.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('safetly-demo-v1'));
      const d = new Date(); d.setDate(d.getDate() - 1);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      db.bookings.push({ id: 'demo-gaar', user_id: db.session, shift_date: iso, slot: 1 });
      localStorage.setItem('safetly-demo-v1', JSON.stringify(db));
    });
    await page.reload();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Ingrid' }).waitFor();
    await wait(500);

    // 2. Vakter
    await caption('Vakter: to vakter hver kveld', '21–23 og 23–01, minst to voksne per vakt');
    await wait(2200);
    await caption('Appen sier fra når vakter trenger folk');
    await scrollToEl(page.getByRole('heading', { name: /trenger flere voksne/ }), 140);
    await wait(1500);
    await tap(page.getByRole('button', { name: 'Vis første ledige' }), 900);
    await caption('Se hvem du går sammen med', 'Grønn = dekket, oransje = trenger flere');
    await wait(1800);
    await caption('Book deg på med ett trykk', 'Huk av for å gjenta vakten 4 uker frem');
    const repeat = page.getByLabel('Gjenta nye bookinger 4 uker frem');
    await scrollToEl(page.getByRole('button', { name: /^Book meg på/ }).first(), 300);
    await tap(repeat, 500);
    await tap(page.getByRole('button', { name: /^Book meg på/ }).first(), 1400);
    await scrollTo(0);
    await caption('«Din neste vakt» står øverst', 'Med tid, oppmøtested og hvem du går med');
    await wait(2600);

    // 3. Kalender
    await hideCaption();
    await tap(nav('Kalender'), 600);
    await caption('Kalender for hele måneden', 'Prikker viser dekning og arrangementer');
    await wait(2000);
    const evDay = page.locator('.cal-grid .cell:has(.mark.event)').first();
    if (await evDay.count()) await tap(evDay, 600);
    await scrollTo(380);
    await caption('Trykk på en dag for å se og booke');
    await wait(2200);

    // 4. Nyheter og vaktrapport
    await hideCaption();
    await tap(nav('Nyheter'), 600);
    await caption('Etter vakten: en kort vaktrapport', 'Uten navn på barn');
    await wait(1200);
    await tap(page.getByText('Noe uro', { exact: true }).first(), 400);
    await type(page.getByLabel(/Kort notat/), 'Høylytt gjeng ved busstoppet, roet seg etter en prat.');
    await tap(page.getByRole('button', { name: 'Send rapport' }), 1000);
    await caption('Ukas nyheter fra koordinatorene', 'Vaktrapportene vises under');
    await wait(1200);
    await scrollToEl(page.getByRole('heading', { name: 'Vaktrapporter' }), 100);
    await wait(2200);

    // 5. Arrangement
    await hideCaption();
    await tap(nav('Arrangement'), 600);
    await caption('Arrangement: alle kan lage noe', 'Trykk «Jeg kommer» for å melde deg på');
    await wait(1200);
    await tap(page.getByRole('button', { name: 'Jeg kommer' }).first(), 1600);

    // 6. Info
    await hideCaption();
    await tap(nav('Info'), 600);
    await caption('Info: oppmøtested og koordinatorer', 'Ring koordinatorene rett fra appen');
    await wait(2200);
    await scrollToEl(page.getByRole('heading', { name: 'Slik går en vakt' }), 90);
    await caption('Slik går en vakt, steg for steg');
    await wait(2200);
    await scrollToEl(page.getByRole('heading', { name: 'Nødnumre' }), 90);
    await caption('Nødnumre og din egen innsats');
    await wait(2000);
    await scrollToEl(page.getByRole('heading', { name: 'Profil' }), 90);
    await caption('Større tekst og mørk modus');
    await wait(800);
    await tap(page.getByRole('button', { name: 'Mørk' }), 1500);
    await tap(page.getByRole('button', { name: 'Lys' }), 800);

    // 7. Nødhjelp
    await scrollTo(0, 600);
    await caption('Nødhjelp-knappen er alltid synlig');
    await wait(1200);
    await tap(page.getByRole('link', { name: 'Nødhjelp' }).first(), 600);
    await caption('Ring 112, 113, 110 eller 02800', 'Appen varsler ikke nødetatene selv');
    await wait(2400);
    await scrollToEl(page.getByRole('heading', { name: 'Husk når du ringer' }), 90);
    await caption('Huskeliste for nødsamtalen');
    for (let i = 0; i < 3; i++) await tap(page.locator(`#sos-${i}`), 350);
    await wait(1200);
    await hideCaption();
    await tap(page.getByRole('link', { name: 'Lukk nødhjelp' }), 600);

    // 8. Kontor
    await tap(nav('Info'), 400);
    await scrollToEl(page.getByRole('link', { name: 'Kontor for koordinatorer' }), 400);
    await tap(page.getByRole('link', { name: 'Kontor for koordinatorer' }), 600);
    await caption('Kontor for koordinatorer', 'Åpne vakter, dekning uke for uke, foreldreliste og vaktliste');
    await wait(2200);
    await scrollToEl(page.getByRole('heading', { name: 'Dekning uke for uke' }), 90);
    await wait(2000);
    await scrollToEl(page.getByRole('heading', { name: 'Foreldre' }), 90);
    await caption('Endre roller og last ned vaktliste');
    await wait(2200);
    await hideCaption();

    await title('Safetly', 'Book din første vakt i dag.\nSammen gjør vi nabolaget tryggere.', 3500);
  } catch (e) {
    console.error('FEIL:', e.message);
    process.exitCode = 1;
  } finally {
    const video = page.video();
    await ctx.close();
    await browser.close();
    server.kill();
    const webm = await video.path();
    const mp4 = path.join(OUT, 'safetly-demo.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '30', '-vf', `scale=${OUT_W}:${OUT_H}:flags=lanczos,setsar=1`, mp4]);
    fs.unlinkSync(webm);
    console.log('Video: ' + mp4);
  }
})();
