// Tar opp en demovideo av Safetly (demomodus) med norsk stemme og tekst.
// Lager to filer: safetly-demo-mobil.mp4 (1080×1920, høykant) og safetly-demo-pc.mp4 (1920×1080, bredformat).
//
// Kjør: PIPER_VOICE=/sti/til/no_NO-talesyntese-medium.onnx node scripts/demo-video.cjs [utmappe]
// Krever Playwright med Chromium, ffmpeg og (for stemme) `pip install piper-tts` + en norsk Piper-stemme:
//   https://huggingface.co/rhasspy/piper-voices/tree/main/no/no_NO/talesyntese/medium
// Uten PIPER_VOICE lages videoen uten stemme.
const { chromium } = require('playwright');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 8097;
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'demo-video'));
const TMP = path.join(OUT, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const VOICE = process.env.PIPER_VOICE;
// Appen tegnes som en 390 px bred telefon, forstørret med CSS-zoom til 1080×1920 (9:16).
// (Playwright skalerer ikke opptaket etter deviceScaleFactor, så vi zoomer i stedet.)
const OUT_W = 1080, OUT_H = 1920, W = 390, Z = OUT_W / W;

// ------------------------------------------------------------------ manus
const NARR = {
  intro: 'Hei! Dette er Safetly, appen for natteravner i nabolaget vårt. Her samarbeider foreldre om å gjøre kveldene tryggere for barna.',
  konto: 'Du lager konto med e-post og passord. Telefonnummeret ditt ser bare koordinatorene.',
  vakter: 'På Vakter ser du uka. Det er to vakter hver kveld: fra ni til elleve, og fra elleve til ett. Vi trenger minst to voksne på hver vakt.',
  varsel: 'Appen sier fra når vakter mangler folk. Trykk her, så kommer du rett til den første ledige vakten.',
  hvem: 'Du ser hvem du går sammen med. Grønt betyr at vakten er dekket. Oransje betyr at den trenger flere.',
  book: 'Book deg med ett trykk. Vil du ta den samme vakten flere uker, huker du av for å gjenta den fire uker frem.',
  neste: 'Øverst står alltid din neste vakt, med tid, oppmøtested og hvem du går med.',
  kalender: 'I kalenderen ser du hele måneden. Prikkene viser hvilke dager som er dekket, og hvor det skjer noe.',
  kalender2: 'Trykk på en dag for å se vaktene og booke.',
  rapport: 'Etter vakten skriver du en kort vaktrapport. Var det en rolig kveld, litt uro, eller trengte noen hjelp? Husk: ingen navn på barn.',
  nyheter: 'Under Nyheter legger koordinatorene ut ukas beskjeder. Her ser alle også vaktrapportene.',
  arr: 'Alle kan lage arrangementer, som en refleksvandring eller et foreldremøte. Trykk Jeg kommer for å melde deg på.',
  info: 'Under Info finner du oppmøtestedet, og telefonnummeret til koordinatorene.',
  guide: 'Her står også hvordan en vakt går, steg for steg.',
  nod: 'Du finner nødnumrene, og hvor mange vakter du har gått.',
  profil: 'Trenger du større tekst eller mørk skjerm, velger du det her.',
  sos: 'Den røde nødhjelp-knappen er alltid synlig øverst.',
  sos2: 'Her ringer du politi, ambulanse eller brannvesen med ett trykk. Appen varsler ikke nødetatene selv. Du må ringe.',
  huske: 'Huskelisten hjelper deg å si det viktigste når du ringer.',
  kontor: 'Koordinatorene har et eget kontor. Der ser de åpne vakter, og dekningen uke for uke.',
  kontor2: 'De kan også endre roller, og laste ned vaktlisten.',
  slutt: 'Last ned Safetly, og book din første vakt i dag. Sammen gjør vi nabolaget tryggere.'
};

function makeVoice() {
  const clips = {};
  if (!VOICE) { console.log('PIPER_VOICE er ikke satt: videoen lages uten stemme.'); return clips; }
  for (const [key, text] of Object.entries(NARR)) {
    const wav = path.join(TMP, key + '.wav');
    const r = spawnSync('python3', ['-m', 'piper', '-m', VOICE, '-f', wav, '--length-scale', '0.97', '--sentence-silence', '0.3'], { input: text });
    if (r.status !== 0 || !fs.existsSync(wav)) throw new Error('Piper feilet: ' + (r.stderr || '').toString().slice(-300));
    const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
    clips[key] = { wav, dur: d };
  }
  console.log(`Stemme: ${Object.keys(clips).length} klipp, ${Object.values(clips).reduce((a, c) => a + c.dur, 0).toFixed(0)} sekunder tale`);
  return clips;
}

const DEMO_CONFIG = "window.SAFETLY_CONFIG={meetingPlace:{name:'Nærbutikken ved Torget',address:'Storgata 12',note:'Møt opp 10 minutter før vakt. Vester og lykter ligger i kassen bak disken.'}};";
const OVERLAY_CSS = `
body{zoom:${Z}}
#demo-layer{position:fixed;inset:0;zoom:${Z};pointer-events:none;z-index:9999}
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
  if (process.env.FINISH_ONLY) { const j = JSON.parse(fs.readFileSync(path.join(TMP, 'cues.json'), 'utf8')); return finish(j.webm, j.cues); }
  const clips = makeVoice();
  const cues = [];
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1, locale: 'nb-NO', serviceWorkers: 'block', hasTouch: true,
    recordVideo: { dir: TMP, size: { width: OUT_W, height: OUT_H } }
  });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: DEMO_CONFIG }));
  await ctx.addInitScript((css) => {
    addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
    window.__layer = () => { let l = document.getElementById('demo-layer'); if (!l) { l = document.createElement('div'); l.id = 'demo-layer'; document.documentElement.appendChild(l); } return l; };
    window.confirm = () => true;
  }, OVERLAY_CSS);
  const page = await ctx.newPage();
  const t0 = Date.now();
  page.setDefaultTimeout(15000);
  const wait = (ms) => page.waitForTimeout(ms);
  const nav = (name) => page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name });

  // Start et stemmeklipp nå. done() venter til klippet er ferdig (minst `min` ms totalt).
  function say(key, min = 2200) {
    const c = clips[key];
    const start = Date.now();
    if (c) cues.push({ wav: c.wav, at: start - t0 });
    const len = c ? c.dur * 1000 + 350 : min;
    return { done: () => wait(Math.max(0, start + Math.max(len, min) - Date.now())) };
  }
  async function caption(text, sub) {
    await page.evaluate(([t, s]) => {
      let el = document.getElementById('demo-cap');
      if (!el) { el = document.createElement('div'); el.id = 'demo-cap'; window.__layer().appendChild(el); }
      el.classList.remove('on'); el.innerHTML = ''; el.append(t);
      if (s) { const sm = document.createElement('small'); sm.textContent = s; el.append(sm); }
      requestAnimationFrame(() => el.classList.add('on'));
    }, [text, sub || '']);
    await wait(300);
  }
  async function hideCaption() { await page.evaluate(() => { const el = document.getElementById('demo-cap'); if (el) el.classList.remove('on'); }); await wait(250); }
  async function tap(locator, pause = 600) {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    if (b) await page.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'demo-tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; window.__layer().appendChild(d); setTimeout(() => d.remove(), 700); }, [(b.x + b.width / 2) / Z, (b.y + b.height / 2) / Z]);
    await wait(250);
    await locator.click();
    await wait(pause);
  }
  async function type(locator, text) { await locator.click(); await locator.pressSequentially(text, { delay: 50 }); await wait(150); }
  async function scrollTo(y, ms = 900) { await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'smooth' }), y); await wait(ms); }
  async function scrollToEl(locator, offset = 120) { const y = await locator.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset); await scrollTo(y); }
  async function title(h, p) {
    await page.evaluate(([hh, pp]) => {
      const d = document.createElement('div'); d.id = 'demo-title';
      d.innerHTML = '<div class="logo"><svg width="46" height="46" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 4a8 8 0 1 0 4.5 13.5A6.5 6.5 0 0 1 15.5 4z"/></svg></div>';
      const a = document.createElement('h1'); a.textContent = hh; const b = document.createElement('p'); b.textContent = pp;
      d.append(a, b); window.__layer().appendChild(d);
    }, [h, p]);
  }
  async function untitle() { await page.evaluate(() => { const d = document.getElementById('demo-title'); d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }); await wait(600); }

  let s;
  try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole('button', { name: 'Ny konto' }).waitFor();
    await title('Safetly', 'Natteravner i nabolaget.\nForeldre sammen for et tryggere nærmiljø.');
    await wait(600);
    s = say('intro', 4000); await s.done();
    await untitle();

    s = say('konto');
    await caption('Lag konto med e-post og passord', 'Telefonnummeret ser bare koordinatorene');
    await tap(page.getByRole('button', { name: 'Ny konto' }), 400);
    await type(page.getByLabel('Navn'), 'Ingrid Haugen');
    await type(page.getByLabel('E-post'), 'ingrid@eksempel.no');
    await type(page.getByLabel('Passord'), 'hemmelig1');
    await type(page.getByLabel('Telefon'), '481 22 333');
    await s.done();
    await tap(page.getByRole('button', { name: 'Opprett konto' }), 700);
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Ingrid' }).waitFor();
    // Gi Ingrid en vakt i går, så vaktrapporten kan vises senere.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('safetly-demo-v1'));
      const d = new Date(); d.setDate(d.getDate() - 1);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      db.bookings.push({ id: 'demo-gaar', user_id: db.session, shift_date: iso, slot: 1 });
      localStorage.setItem('safetly-demo-v1', JSON.stringify(db));
    });
    await page.reload();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Ingrid' }).waitFor();

    s = say('vakter');
    await caption('Vakter: to vakter hver kveld', '21–23 og 23–01, minst to voksne per vakt');
    await s.done();
    s = say('varsel');
    await caption('Appen sier fra når vakter trenger folk');
    await scrollToEl(page.getByRole('heading', { name: /trenger flere voksne/ }), 140);
    await wait(1800);
    await tap(page.getByRole('button', { name: 'Vis første ledige' }), 500);
    await s.done();
    s = say('hvem');
    await caption('Se hvem du går sammen med', 'Grønn = dekket, oransje = trenger flere');
    await s.done();
    s = say('book');
    await caption('Book deg på med ett trykk', 'Huk av for å gjenta vakten 4 uker frem');
    await scrollToEl(page.getByRole('button', { name: /^Book meg på/ }).first(), 300);
    await wait(1200);
    await tap(page.getByLabel('Gjenta nye bookinger 4 uker frem'), 900);
    await tap(page.getByRole('button', { name: /^Book meg på/ }).first(), 600);
    await s.done();
    await scrollTo(0);
    s = say('neste');
    await caption('«Din neste vakt» står øverst', 'Med tid, oppmøtested og hvem du går med');
    await s.done();

    await hideCaption();
    await tap(nav('Kalender'), 400);
    s = say('kalender');
    await caption('Kalender for hele måneden', 'Prikker viser dekning og arrangementer');
    await s.done();
    s = say('kalender2');
    const evDay = page.locator('.cal-grid .cell:has(.mark.event)').first();
    if (await evDay.count()) await tap(evDay, 400);
    await scrollTo(380);
    await caption('Trykk på en dag for å se og booke');
    await s.done();

    await hideCaption();
    await tap(nav('Nyheter'), 400);
    s = say('rapport');
    await caption('Etter vakten: en kort vaktrapport', 'Uten navn på barn');
    await wait(2500);
    await tap(page.getByText('Noe uro', { exact: true }).first(), 400);
    await type(page.getByLabel(/Kort notat/), 'Høylytt gjeng ved busstoppet, roet seg etter en prat.');
    await s.done();
    await tap(page.getByRole('button', { name: 'Send rapport' }), 600);
    s = say('nyheter');
    await caption('Ukas nyheter fra koordinatorene', 'Vaktrapportene vises under');
    await wait(1500);
    await scrollToEl(page.getByRole('heading', { name: 'Vaktrapporter' }), 100);
    await s.done();

    await hideCaption();
    await tap(nav('Arrangement'), 400);
    s = say('arr');
    await caption('Arrangement: alle kan lage noe', 'Trykk «Jeg kommer» for å melde deg på');
    await wait(4200);
    await tap(page.getByRole('button', { name: 'Jeg kommer' }).first(), 600);
    await s.done();

    await hideCaption();
    await tap(nav('Info'), 400);
    s = say('info');
    await caption('Info: oppmøtested og koordinatorer', 'Ring koordinatorene rett fra appen');
    await s.done();
    await scrollToEl(page.getByRole('heading', { name: 'Slik går en vakt' }), 90);
    s = say('guide');
    await caption('Slik går en vakt, steg for steg');
    await s.done();
    await scrollToEl(page.getByRole('heading', { name: 'Nødnumre' }), 90);
    s = say('nod');
    await caption('Nødnumre og din egen innsats');
    await s.done();
    await scrollToEl(page.getByRole('heading', { name: 'Profil' }), 90);
    s = say('profil');
    await caption('Større tekst og mørk modus');
    await wait(900);
    await tap(page.getByRole('button', { name: 'Mørk' }), 1300);
    await tap(page.getByRole('button', { name: 'Lys' }), 300);
    await s.done();

    await scrollTo(0, 600);
    s = say('sos');
    await caption('Nødhjelp-knappen er alltid synlig');
    await wait(1600);
    await tap(page.getByRole('link', { name: 'Nødhjelp' }).first(), 400);
    await s.done();
    s = say('sos2');
    await caption('Ring 112, 113, 110 eller 02800', 'Appen varsler ikke nødetatene selv');
    await s.done();
    await scrollToEl(page.getByRole('heading', { name: 'Husk når du ringer' }), 90);
    s = say('huske');
    await caption('Huskeliste for nødsamtalen');
    for (let i = 0; i < 3; i++) await tap(page.locator(`#sos-${i}`), 300);
    await s.done();
    await hideCaption();
    await tap(page.getByRole('link', { name: 'Lukk nødhjelp' }), 400);

    await tap(nav('Info'), 300);
    await scrollToEl(page.getByRole('link', { name: 'Kontor for koordinatorer' }), 400);
    await tap(page.getByRole('link', { name: 'Kontor for koordinatorer' }), 400);
    s = say('kontor');
    await caption('Kontor for koordinatorer', 'Åpne vakter og dekning uke for uke');
    await wait(2500);
    await scrollToEl(page.getByRole('heading', { name: 'Dekning uke for uke' }), 90);
    await s.done();
    await scrollToEl(page.getByRole('heading', { name: 'Foreldre' }), 90);
    s = say('kontor2');
    await caption('Endre roller og last ned vaktliste');
    await s.done();
    await hideCaption();

    await title('Safetly', 'Book din første vakt i dag.\nSammen gjør vi nabolaget tryggere.');
    s = say('slutt', 3500); await s.done();
    await wait(1200);
  } catch (e) {
    console.error('FEIL:', e.message);
    process.exitCode = 1;
  } finally {
    const video = page.video();
    await ctx.close();
    await browser.close();
    server.kill();
    const webm = await video.path();
    fs.writeFileSync(path.join(TMP, 'cues.json'), JSON.stringify({ webm, cues }));
    await finish(webm, cues);
  }
})();

// Setter sammen video og stemme, og lager PC-versjonen.
async function finish(webm, cues) {
  {
    const mobil = path.join(OUT, 'safetly-demo-mobil.mp4');
    const pc = path.join(OUT, 'safetly-demo-pc.mp4');

    // Mobil: først ett lydspor med alle stemmeklippene på riktig tidspunkt, så video + lyd.
    const vdur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString());
    const narration = path.join(TMP, 'stemme.wav');
    if (cues.length) {
      const py = `
import json, sys, wave, array
cues, dur, out = json.loads(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
rate = None; buf = None
for c in cues:
    w = wave.open(c['wav'], 'rb')
    if rate is None:
        rate = w.getframerate(); buf = array.array('h', bytes(2 * int(rate * dur)))
    data = array.array('h', w.readframes(w.getnframes())); w.close()
    o = int(rate * c['at'] / 1000)
    for i, v in enumerate(data):
        if o + i < len(buf): buf[o + i] = max(-32768, min(32767, buf[o + i] + int(v * 1.25)))
w = wave.open(out, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(buf.tobytes()); w.close()
`;
      execFileSync('python3', ['-c', py, JSON.stringify(cues), String(vdur), narration]);
    }
    const args = ['-y', '-loglevel', 'error', '-i', webm];
    if (cues.length) args.push('-i', narration);
    args.push('-vf', `fps=30,scale=${OUT_W}:${OUT_H}:flags=lanczos,setsar=1`, '-map', '0:v');
    if (cues.length) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000');
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mobil);
    execFileSync('ffmpeg', args);

    // PC/TV: bredformat 1920×1080 med telefonen i midten og navn/lenke på sidene.
    const bg = path.join(TMP, 'pc-bakgrunn.png');
    const b2 = await chromium.launch();
    const p2 = await b2.newPage({ viewport: { width: 1920, height: 1080 } });
    const fonts = path.join(__dirname, '..', 'www', 'fonts');
    const ff = (n) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(fonts, n)).toString('base64');
    await p2.setContent(`<html><head><style>
      @font-face{font-family:Figtree;font-weight:600;src:url(${ff('figtree-600.woff2')})}
      @font-face{font-family:Bricolage;font-weight:800;src:url(${ff('bricolage-800.woff2')})}
      body{margin:0;width:1920px;height:1080px;background:#F6F0E4;font-family:Figtree;color:#1C1A16;position:relative;overflow:hidden}
      .blob{position:absolute;border-radius:120px}
      .side{position:absolute;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:0 70px;box-sizing:border-box}
      .l{left:0}.r{right:0;align-items:flex-start}
      .logo{width:140px;height:140px;border-radius:42px;background:#1C1A16;color:#F6F0E4;display:grid;place-items:center}
      h1{font-family:Bricolage;font-weight:800;font-size:110px;margin:0;line-height:1}
      p{font-size:38px;margin:0;line-height:1.3;color:#5A5449}
      .pill{background:#1C1A16;color:#F6F0E4;border-radius:999px;padding:22px 34px;font-size:32px}
      ul{margin:0;padding:0;list-style:none;font-size:34px;line-height:1.9}
      li::before{content:'●';color:#1E6A43;margin-right:16px;font-size:24px;vertical-align:middle}
    </style></head><body>
      <div class="blob" style="left:-120px;top:-140px;width:520px;height:420px;background:#D4E3F5;transform:rotate(-8deg)"></div>
      <div class="blob" style="right:-140px;bottom:-160px;width:560px;height:440px;background:#F3D2D8;transform:rotate(6deg)"></div>
      <div class="blob" style="right:120px;top:-200px;width:360px;height:320px;background:#F5E2A0;transform:rotate(10deg)"></div>
      <div class="side l"><div class="logo"><svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 4a8 8 0 1 0 4.5 13.5A6.5 6.5 0 0 1 15.5 4z"/></svg></div>
        <h1>Safetly</h1><p>Natteravner i nabolaget.<br>Foreldre sammen for et tryggere nærmiljø.</p></div>
      <div class="side r"><ul><li>Book vakter</li><li>Se hvem du går med</li><li>Vaktrapporter</li><li>Arrangementer</li><li>Nødhjelp</li></ul>
        <span class="pill">raadkawa.github.io/safetly</span></div>
    </body></html>`);
    await p2.waitForTimeout(300);
    await p2.screenshot({ path: bg });
    await b2.close();
    // Telefonen: 1000 px høy, med avrundede hjørner.
    const ph = 1000, pw = Math.round(ph * OUT_W / OUT_H);
    const mask = path.join(TMP, 'maske.png');
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image, ImageDraw\nw,h=int(sys.argv[1]),int(sys.argv[2])\nm=Image.new("L",(w*4,h*4),0)\nImageDraw.Draw(m).rounded_rectangle([0,0,w*4-1,h*4-1],radius=36*4,fill=255)\nm.resize((w,h),Image.LANCZOS).save(sys.argv[3])', String(pw), String(ph), mask]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', bg, '-i', mobil, '-loop', '1', '-i', mask, '-filter_complex',
      `[1:v]scale=${pw}:${ph}:flags=lanczos,format=rgba[p];[2:v]format=gray[m];[p][m]alphamerge[ph];` +
      `[0:v][ph]overlay=(W-w)/2:(H-h)/2:shortest=1:format=auto,format=yuv420p[v]`,
      '-map', '[v]', '-map', '1:a?', '-t', String(vdur), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-c:a', 'copy', '-r', '30', '-movflags', '+faststart', pc]);

    fs.rmSync(TMP, { recursive: true, force: true });
    console.log('Video (mobil): ' + mobil);
    console.log('Video (PC/TV): ' + pc);
  }
}
