// Røyktest i demomodus: starter serveren, går gjennom hovedflytene og tar skjermbilder.
// Kjør: npm test   (krever Playwright med Chromium)
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 8099;
const OUT = process.env.SHOTS || path.join(__dirname, '..', 'test-shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'nb-NO', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  const step = (msg) => console.log('✓ ' + msg);
  try {
    // Kjør alltid i demomodus, uansett hva config.js inneholder.
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.SAFETLY_CONFIG={meetingPlace:{name:'Nærbutikken ved Torget',address:'Storgata 12',note:''}};" }));
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole('button', { name: 'Ny konto' }).click();
    await page.getByLabel('Navn').fill('Ingrid Haugen');
    await page.getByLabel('E-post').fill('ingrid@eksempel.no');
    await page.getByLabel('Passord').fill('hemmelig1');
    await page.getByLabel('Telefon').fill('481 22 333');
    await shot('01-ny-konto');
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Ingrid' }).waitFor();
    step('konto opprettet og logget inn');
    await shot('02-vakter');

    // Book en vakt med gjentakelse
    await page.getByLabel('Gjenta nye bookinger 4 uker frem').check();
    const book = page.getByRole('button', { name: /^Book meg på/ }).first();
    await book.click();
    await page.getByText(/Booket, og gjentatt 4 uker frem/).waitFor();
    await page.getByRole('heading', { name: 'Din neste vakt' }).waitFor();
    step('booket vakt med gjentakelse, «Din neste vakt» vises');
    await shot('03-booket');

    // Avbook
    await page.getByRole('button', { name: /^Avbook / }).first().click();
    await page.getByText('Vakten er avbooket.').waitFor();
    step('avbooket');

    // Kalender
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Kalender' }).click();
    await page.locator('.cal-grid .cell').first().waitFor();
    const cells = await page.locator('.cal-grid .cell').count();
    if (cells < 28) throw new Error('Kalenderen mangler dager');
    await page.getByRole('button', { name: 'Neste måned' }).click();
    await page.getByRole('button', { name: 'Forrige måned' }).click();
    step(`kalender med ${cells} dager`);
    await shot('04-kalender');

    // Arrangement
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Arrangement' }).click();
    await page.getByRole('button', { name: 'Nytt arrangement' }).click();
    await page.getByLabel('Tittel').fill('Grilling i parken');
    const d = new Date(Date.now() + 3 * 86400000);
    await page.getByLabel('Dato').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    await page.getByLabel('Tid').fill('18:30');
    await page.getByLabel('Sted').fill('Parken');
    await page.getByLabel('Beskrivelse').fill('Ta med noe å grille.');
    await page.getByRole('button', { name: 'Opprett' }).click();
    await page.getByRole('heading', { name: 'Grilling i parken' }).waitFor();
    await page.locator('article', { hasText: 'Grilling i parken' }).getByRole('button', { name: 'Jeg kommer' }).click();
    await page.getByText('1 kommer, også du').waitFor();
    step('arrangement opprettet og påmeldt');
    await shot('05-arrangement');

    // Nyheter (første konto er koordinator)
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Nyheter' }).click();
    await page.getByRole('button', { name: 'Skriv ny nyhet' }).click();
    await page.getByLabel('Tittel').fill('Velkommen til Safetly');
    await page.getByLabel('Tekst').fill('Book en vakt i appen.');
    await page.getByRole('button', { name: 'Legg ut' }).click();
    await page.getByRole('heading', { name: 'Velkommen til Safetly' }).waitFor();
    step('koordinator la ut nyhet');

    // Meldinger
    const chatBtn = page.getByRole('link', { name: /^Meldinger/ });
    if (!/ulest/.test(await chatBtn.getAttribute('aria-label'))) throw new Error('mangler merke for uleste meldinger');
    await chatBtn.click();
    await page.getByRole('heading', { name: 'Meldinger' }).waitFor();
    await shot('06a-chat-liste');
    await page.getByRole('link', { name: /Kari Nilsen/ }).click();
    await page.getByText(/velkommen/).waitFor();
    await page.getByLabel('Melding til Kari Nilsen').fill('Takk! Jeg tar gjerne fredag.');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.locator('.bubble-row.mine', { hasText: 'Takk! Jeg tar gjerne fredag.' }).waitFor();
    await page.locator('.receipt', { hasText: 'Sendt' }).waitFor();
    await page.locator('.receipt.seen', { hasText: /^Sett \d\d:\d\d/ }).waitFor({ timeout: 10000 });
    await shot('06b-chat-samtale');
    await page.getByRole('link', { name: 'Tilbake til meldinger' }).click();
    if (await page.locator('.chat-row', { hasText: 'Kari Nilsen' }).locator('.count-pill').count()) throw new Error('samtalen med Kari er fortsatt ulest etter lesing');
    await page.getByRole('link', { name: /Til alle/ }).click();
    await page.getByLabel('Beskjed til alle').fill('Hei alle! Vi trenger folk fredag.');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.locator('.bubble-row.mine', { hasText: 'Hei alle! Vi trenger folk fredag.' }).waitFor();
    await page.locator('.receipt', { hasText: /Sett av 0 av \d+/ }).waitFor();
    await page.locator('.receipt.seen', { hasText: /Sett av 4 av \d+/ }).waitFor({ timeout: 10000 });
    await shot('06c-chat-alle');
    await page.getByRole('link', { name: 'Tilbake til meldinger' }).click();
    await page.getByRole('link', { name: 'Ny melding' }).click();
    await page.getByLabel('Søk etter navn').fill('ahm');
    if ((await page.locator('#pick-list li:not([hidden])').count()) !== 1) throw new Error('søk i ny melding virker ikke');
    await page.getByRole('link', { name: /Ahmed Said/ }).click();
    await page.getByLabel('Melding til Ahmed Said').waitFor();
    await page.getByRole('link', { name: 'Tilbake til meldinger' }).click();
    step('meldinger: ulest-merke, svar til én, beskjed til alle, søk, «Sendt» → «Sett» og «Sett av X av N»');
    await shot('06-nyheter');

    // Info og profil
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Info' }).click();
    await page.getByRole('heading', { name: 'Koordinatorer' }).waitFor();
    await page.getByText('Ingrid Haugen').first().waitFor();
    await page.getByRole('button', { name: 'Endre oppmøtested' }).click();
    await page.getByRole('textbox', { name: 'Sted', exact: true }).fill('Skolegården');
    await page.getByRole('textbox', { name: 'Adresse' }).fill('Skoleveien 1');
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await page.getByText('Oppmøtestedet er lagret.').waitFor();
    await page.getByText('Skolegården').first().waitFor();
    step('koordinator endret oppmøtested');
    await page.getByRole('button', { name: 'Mørk' }).click();
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'dark') throw new Error('Mørk modus virket ikke');
    await page.getByRole('switch', { name: 'Større tekst' }).check();
    await shot('07-info-mork');
    await page.getByRole('button', { name: 'Lys' }).click();
    await page.getByRole('switch', { name: 'Større tekst' }).uncheck();
    step('info, mørk modus og større tekst');

    // Kontor
    await page.getByRole('link', { name: 'Kontor for koordinatorer' }).click();
    await page.getByRole('heading', { name: 'Kontor' }).waitFor();
    const removeBtns = page.getByRole('button', { name: /^Fjern .* fra vakten$/ });
    if (await removeBtns.count()) { await removeBtns.first().click(); await page.getByText('Fjernet fra vakten.').waitFor(); }
    const sel = page.getByLabel('Rolle for Ahmed Said');
    await sel.selectOption('koordinator');
    await page.getByText('Rollen er endret.').waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Last ned vaktliste/ }).click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    if (!csv.includes('Dato;Ukedag;Uke;Vakt')) throw new Error('CSV mangler overskrift');
    step(`kontor: fjern fra vakt, rolle endret, CSV (${csv.split('\n').length - 1} vakter)`);
    await shot('08-kontor');

    // Nødhjelp
    await page.getByRole('link', { name: 'Nødhjelp' }).click();
    await page.getByRole('heading', { name: 'Ring hvis noen er i fare' }).waitFor();
    for (const n of ['112', '113', '110', '02800']) if (!(await page.locator(`a[href="tel:${n}"]`).count())) throw new Error('mangler ' + n);
    step('nødhjelp med 112, 113, 110, 02800');
    await shot('09-nodhjelp');
    await page.getByRole('link', { name: 'Lukk nødhjelp' }).click();

    // Logg ut og inn igjen, så en forelder
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Info' }).click();
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await page.getByRole('button', { name: 'Ny konto' }).click();
    await page.getByLabel('Navn').fill('Ola Hansen');
    await page.getByLabel('E-post').fill('ola@eksempel.no');
    await page.getByLabel('Passord').fill('hemmelig2');
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Ola' }).waitFor();
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Info' }).click();
    await page.getByText('Forelder', { exact: false }).first().waitFor();
    if (await page.getByRole('link', { name: 'Kontor for koordinatorer' }).count()) throw new Error('forelder ser Kontor');
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Nyheter' }).click();
    if (await page.getByRole('button', { name: 'Skriv ny nyhet' }).count()) throw new Error('forelder kan legge ut nyhet');
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Info' }).click();
    await page.getByText('Skolegården').first().waitFor();
    if (await page.getByRole('button', { name: 'Endre oppmøtested' }).count()) throw new Error('forelder kan endre oppmøtested');
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Nyheter' }).click();
    step('ny konto blir forelder uten Kontor og nyhetsknapp');
    await page.getByRole('link', { name: /^Meldinger/ }).click();
    await page.getByRole('link', { name: /Til alle/ }).click();
    await page.getByText('Hei alle! Vi trenger folk fredag.').waitFor();
    await page.getByText('Bare koordinatorene kan skrive her', { exact: false }).waitFor();
    if (await page.getByLabel('Beskjed til alle').count()) throw new Error('forelder kan skrive til alle');
    await page.getByRole('link', { name: 'Tilbake til meldinger' }).click();
    if (await page.getByText('Takk! Jeg tar gjerne fredag.').count()) throw new Error('forelder ser andres meldinger');
    await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('link', { name: 'Vakter' }).click();
    step('forelder leser «Til alle», kan ikke skrive der, ser ikke andres meldinger');

    // Tastatur: hopp til innhold
    await page.reload();
    await page.locator('nav.nav').waitFor();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement.textContent.trim());
    if (focused !== 'Hopp til innhold') throw new Error('Første tab er ikke «Hopp til innhold» men ' + focused);
    await page.keyboard.press('Enter');
    if ((await page.evaluate(() => document.activeElement.id)) !== 'innhold') throw new Error('Hopp til innhold flyttet ikke fokus');
    step('«Hopp til innhold» virker med tastatur');

    // Knappestørrelse
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input[type=checkbox], select')]
      .filter((e) => e.offsetParent && !e.classList.contains('skip'))
      .map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44 && r.width < 44 && !(r.height >= 22)).map(({ t }) => t));
    if (small.length) console.log('  (små mål: ' + small.join(', ') + ')');

    if (errors.length) throw new Error('Feil i konsollen:\n' + errors.join('\n'));
    console.log(`\nALLE TESTER OK. Skjermbilder i ${OUT}`);
  } catch (e) {
    await shot('feil').catch(() => {});
    console.error('FEIL:', e.message);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})();
