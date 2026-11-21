# Safetly

Norsk, mobilvennlig app for natteravner i nabolaget. Foreldre kobles sammen for et tryggere nærmiljø.

- **Vakter:** to vakter per kveld (21–23 og 23–01), minst to voksne per vakt. Book og avbook, gjenta vakten 4 uker frem, se hvem du går sammen med, ukestatus, «Din neste vakt» og varsel om vakter som trenger folk.
- **Kalender:** månedsvisning med prikker for dekning og arrangement. Trykk på en dag for å se og booke.
- **Ukas nyheter:** koordinatorer legger ut, alle leser. **Vaktrapporter** («Rolig kveld», «Noe uro», «Trengte hjelp» + kort notat uten navn på barn) vises under nyhetene.
- **Arrangement:** alle kan opprette og trykke «Jeg kommer».
- **Meldinger:** én-til-én-meldinger mellom alle i nabolaget (bare de to ser dem), og «Til alle» der koordinatorene skriver beskjeder til hele nabolaget. Uleste meldinger vises med tall, og nye meldinger kommer med en gang.
- **Vaktområde:** kart fra Kartverket med grensen for området, oppmøtested og nummererte sjekkpunkter, avkrysning for kveldens runde og «Vis meg». Koordinatorer kan flytte, legge til og fjerne sjekkpunkter og tegne grensen på nytt. Standardområdet ligger i `www/omrade.js`.
- **Info:** oppmøtested, koordinatorer med telefon, guide, nødnumre, egen innsats, profil, større tekst, lys/mørk modus, logg ut.
- **Nødhjelp:** knapp øverst på alle sider, med ringeknapper (112, 113, 110, 02800) og huskeliste. Appen varsler ikke nødetatene selv.
- **Kontor (bare koordinatorer):** åpne vakter, dekning uke for uke, vaktliste per uke, foreldreliste med rolleendring, fjerne forelder fra vakt og CSV-vaktliste.

Ikke med: push-varsler, automatisk nødvarsling, betaling.

## Slik er det bygget

| Del | Hva |
| --- | --- |
| `www/` | Selve appen: `index.html`, `styles.css`, `app.js` (ren JavaScript, ingen rammeverk), PWA-manifest og service worker |
| `www/config.js` | Supabase-adresse og -nøkkel, oppmøtested og navn på nabolaget |
| `supabase/schema.sql` | Tabeller, Row Level Security og triggere (første konto blir koordinator) |
| `capacitor.config.json` | Innpakking til Android og iPhone |
| `.github/workflows/android.yml` | Bygger APK på GitHub Actions |

Uten Supabase-nøkler starter appen i **demomodus**: alt lagres i nettleseren på enheten, med eksempeldata. Fint for å prøve appen.

## Kom i gang lokalt

```bash
npm install
```

```bash
npm start
```

Åpne http://localhost:8080. `npm start` kopierer først Supabase-biblioteket og skriftene inn i `www/` (`npm run build`).

## Koble til Supabase

1. Lag et prosjekt på supabase.com.
2. Åpne **SQL Editor**, lim inn hele `supabase/schema.sql` og trykk **Run**.
3. Under **Authentication → Sign In / Providers → Email**: la e-post og passord være på. Slå av «Confirm email» hvis foreldre skal komme rett inn uten å bekrefte e-posten.
4. Under **Authentication → URL Configuration**: sett **Site URL** til adressen der nettappen ligger, og legg den til under **Redirect URLs**.
5. Hent **Project URL** og **anon public key** fra **Project Settings → API**, og fyll dem inn i `www/config.js`. Fyll også inn `siteUrl` og oppmøtestedet.

Har du kjørt `schema.sql` før meldinger og redigerbart oppmøtested kom, kjører du i tillegg `supabase/oppmotested.sql`, `supabase/chat.sql`, `supabase/lest.sql` og `supabase/kart.sql`.

Den **første** kontoen som opprettes blir koordinator. Alle andre blir foreldre, og en koordinator kan endre roller i Kontor.

### Tilgang (Row Level Security)

- Alle innloggede ser vakter, nyheter, rapporter, arrangementer og navn.
- Telefonnummer ser bare eieren og koordinatorer. Koordinatorenes egne nummer vises for alle under Info.
- Foreldre skriver bare sine egne bookinger, rapporter og påmeldinger. Rapport kan bare skrives for en vakt du var booket på.
- Bare koordinatorer legger ut nyheter, endrer roller og fjerner andre fra vakter. Det må alltid være minst én koordinator.
- Anonyme brukere har ingen tilgang.

Reglene testes mot en lokal Postgres med `npm run test:db` (krever Postgres installert).

## Publisere som nettapp (PWA)

Kjør `npm run build` og legg ut innholdet i `www/` på en hvilken som helst statisk vert med HTTPS (for eksempel Netlify, Cloudflare Pages eller GitHub Pages). Foreldre kan så velge «Legg til på Hjem-skjerm».

## Android (APK via GitHub Actions)

Hver push til `main` bygger en debug-APK. Den ligger under **Actions → Android APK → Artifacts → safetly-apk**. Du kan også starte bygget manuelt med «Run workflow».

For en signert release-APK legger du inn disse under **Settings → Secrets and variables → Actions**:

| Secret | Innhold |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore-fila, kodet med `base64 -w0 safetly.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | passord for keystore |
| `ANDROID_KEY_ALIAS` | navnet på nøkkelen |
| `ANDROID_KEY_PASSWORD` | passord for nøkkelen |

Lage keystore (én gang, ta godt vare på fila):

```bash
keytool -genkey -v -keystore safetly.jks -alias safetly -keyalg RSA -keysize 2048 -validity 10000
```

Bygge lokalt med Android Studio:

```bash
npx cap add android
```

```bash
npm run android
```

## iPhone (Xcode)

Krever en Mac med Xcode og en Apple-utviklerkonto.

```bash
npm install
```

```bash
npx cap add ios
```

```bash
npx capacitor-assets generate --ios
```

```bash
npm run ios
```

I Xcode: velg team under **Signing & Capabilities**, velg telefonen din og trykk Kjør.

## Ikoner

`npm run icons` lager ikonene i `www/icons/` og kildefilene i `assets/` (krever Python med Pillow). GitHub Actions lager Android-ikonene fra `assets/` med `@capacitor/assets`.

## Tester

```bash
npm test
```

Går gjennom hovedflytene i demomodus i Chromium (krever Playwright) og lagrer skjermbilder i `test-shots/`.

```bash
npm run test:db
```

Kjører `schema.sql` og tester tilgangsreglene mot en midlertidig lokal Postgres.

## Tilgjengelighet

Lenken «Hopp til innhold» kommer først, appen kan brukes med tastatur, knapper er minst 44 px, skjermlesertekster ligger på ikonknapper og status, status vises med både form og farge, og større tekst og lys/mørk modus velges under Info. Norsk språk, 24-timersklokke og uker som starter på mandag.
