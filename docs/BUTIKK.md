# Safetly i App Store og Google Play – sjekkliste

Alt det tekniske er ferdig. Her er det du må gjøre selv, i rekkefølge. Kryss av etter hvert.
Lim aldri nøkler eller passord inn i chatten – de skal bare inn i GitHub (Settings → Secrets and variables → Actions → **New repository secret**):
<https://github.com/raadkawa/safetly/settings/secrets/actions/new>

---

## Steg 0 – Kontaktinfo (5 min)
- [ ] Lag gjerne en egen e-post for Safetly (f.eks. en ny Gmail). Den vises i butikkene og på personvernsiden.
- [ ] Si fra navn og e-post til Claude, så legges de inn i `www/kontakt.js` (personvern- og støttesiden).

Sidene som butikkene spør etter:
- Personvern: <https://raadkawa.github.io/safetly/personvern.html>
- Støtte/hjelp: <https://raadkawa.github.io/safetly/support.html>
- Slette konto (Google spør etter denne): <https://raadkawa.github.io/safetly/support.html#slett-konto>

---

## Steg 1 – Google Play (Android)

### 1a. Utviklerkonto (25 dollar, én gang)
- [ ] Registrer deg på <https://play.google.com/console/signup> («Personal» / privatperson).
- [ ] Bekreft identitet og telefon når Google ber om det (kan ta noen dager).

### 1b. Firebase – for varsler på Android (gratis, 10 min)
1. [ ] Gå til <https://console.firebase.google.com> → **Opprett prosjekt** → navn «Safetly» (Google Analytics: **av**).
2. [ ] Trykk Android-ikonet («Legg til app») → pakkenavn: `no.safetly.app` → **Registrer app**.
3. [ ] Last ned **google-services.json**. Åpne fila i Notisblokk/TekstEdit, kopier alt, og lag GitHub-secret
   **`GOOGLE_SERVICES_JSON`** med innholdet. (Resten av veiviseren i Firebase kan du hoppe over.)
4. [ ] I Firebase: ⚙️ **Prosjektinnstillinger → Tjenestekontoer → Generer ny privat nøkkel** → last ned fila.
   Kopier hele innholdet og lag GitHub-secret **`FIREBASE_SERVICE_ACCOUNT`**.

### 1c. Signeringsnøkkel (ferdig laget)
- [ ] Åpne fila `GITHUB-NOKLER-ANDROID.txt` som Claude sendte deg, og lag de to secretene som står der:
  **`ANDROID_KEYSTORE_BASE64`** og **`ANDROID_KEYSTORE_PASSWORD`**.
- [ ] Ta vare på fila `safetly-upload.jks` og passordet (f.eks. i en passordbehandler). Slett fila fra nedlastinger etterpå.

### 1d. Lag appen i Play Console
1. [ ] **Opprett app** → navn «Safetly – Natteravn», språk **norsk (bokmål)**, **App**, **Gratis**.
2. [ ] Fyll ut **Butikkoppføring** med tekstene under (avsnittet «Tekster til butikkene»), og last opp:
   ikon `google-icon.png`, feature graphic `google-feature.png`, og telefonbildene i `android/`.
3. [ ] **Personvernerklæring**: lim inn personvern-lenken over.
4. [ ] **Datasikkerhet**: se svarene under.
5. [ ] **Innholdsvurdering**: svar på spørsmålene (se under). **Målgruppe**: 18 år og eldre.
6. [ ] **Sletting av konto**: lim inn slett-konto-lenken over.
7. [ ] **Tilgang til appen**: «Noen funksjoner krever innlogging» → legg inn en testbruker (lag en egen konto i appen til dette).

### 1e. Last opp appen
1. [ ] Si fra til Claude når secretene er lagt inn – da bygges en signert **.aab**-fil automatisk.
   Den ligger under <https://github.com/raadkawa/safetly/actions> → «Android (APK og Google Play)» → **safetly-android**.
2. [ ] Play Console → **Testing → Lukket testing** → lag en testkanal → last opp `.aab`-fila.
3. [ ] Legg inn **minst 12 testere** (e-postadressene deres Google-kontoer) og del lenken med dem.
   De må ha appen installert i **14 dager** før du kan søke om produksjon. (Gjelder nye private kontoer.)
4. [ ] Etter 14 dager: **Søk om produksjonstilgang** → send inn → Google godkjenner vanligvis på noen dager.

---

## Steg 2 – App Store (iPhone)

### 2a. Utviklerkonto (99 dollar per år)
- [ ] Meld deg inn på <https://developer.apple.com/programs/enroll/> (som privatperson). Godkjenning tar 1–2 dager.

### 2b. Nøkler (10 min)
1. [ ] **Team ID**: <https://developer.apple.com/account> → Membership details → lag secret **`APPLE_TEAM_ID`**.
2. [ ] **App Store Connect-nøkkel** (for automatisk opplasting): <https://appstoreconnect.apple.com/access/integrations/api>
   → **+** → navn «GitHub», tilgang **Admin** → last ned `.p8`-fila. Lag secrets:
   **`APPSTORE_KEY_ID`** (Key ID), **`APPSTORE_ISSUER_ID`** (Issuer ID øverst på siden), **`APPSTORE_KEY_P8`** (hele innholdet i `.p8`-fila).
3. [ ] **Varselnøkkel (APNs)**: <https://developer.apple.com/account/resources/authkeys/add> → navn «Safetly varsler»,
   kryss av **Apple Push Notifications service (APNs)** → Configure → **Production** → lagre → last ned `.p8`-fila. Lag secrets:
   **`APNS_KEY_ID`** (Key ID) og **`APNS_KEY_P8`** (hele innholdet i fila).

### 2c. Lag appen i App Store Connect
1. [ ] <https://developer.apple.com/account/resources/identifiers/add/bundleId> → App IDs → App → beskrivelse «Safetly», Bundle ID `no.safetly.app`, kryss av **Push Notifications** → Register.
2. [ ] <https://appstoreconnect.apple.com/apps> → **+ Ny app** → iOS, navn «Safetly – Natteravn», norsk, Bundle ID `no.safetly.app`, SKU `safetly`.
3. [ ] Si fra til Claude når secretene er lagt inn – da bygges appen og lastes opp til **TestFlight** automatisk.

### 2d. Send til godkjenning
1. [ ] Test i TestFlight (inviter deg selv og noen foreldre under **TestFlight → Interne testere**).
2. [ ] Fyll ut **App-informasjon**, **Personvern** (se under), **Aldersgrense** og tekstene under. Last opp bildene i `iphone/`.
3. [ ] **App Review-informasjon**: legg inn testbrukeren (e-post og passord) og lim inn notatet under.
4. [ ] Velg bygget og trykk **Send til vurdering**. Apple svarer vanligvis innen 1–3 dager.

---

## Tekster til butikkene

**Navn:** Safetly – Natteravn
**Undertittel (Apple, maks 30 tegn):** Trygge kvelder i nabolaget
**Kort beskrivelse (Google, maks 80 tegn):** Natteravner i nabolaget: book vakter, skriv til foreldre, få påminnelser.
**Kategori:** Livsstil (sekundær hos Apple: Sosialt nettverk)
**Nøkkelord (Apple, maks 100 tegn):** natteravn,nabolag,foreldre,vakt,trygghet,ungdom,frivillig,nabo,skole,vaktliste,kveld
**Reklametekst (Apple, maks 170 tegn):** Foreldre som går natteravn sammen. Book vakter, se hvem du går med, få påminnelser og hold kontakten – for et tryggere nabolag.

**Beskrivelse:**

> Safetly gjør det enkelt for foreldre å gå natteravn i nabolaget – sammen.
>
> Barna våre skal kunne bevege seg trygt i nabolaget, og vite at det finnes voksne rundt dem som bryr seg. Safetly samler foreldrene, slik at det alltid er trygge voksne ute om kveldene.
>
> VAKTER
> • Se kveldens vakter og hvem du går sammen med
> • Book deg på med ett trykk, og gjenta vakten fire uker frem
> • Se hvilke kvelder som trenger flere voksne
> • Kalender for hele måneden
>
> KONTAKT
> • Skriv til andre foreldre og koordinatorene
> • Beskjeder til alle fra koordinatorene
> • Ukas nyheter og korte vaktrapporter
> • Arrangementer for nabolaget
>
> TRYGGHET
> • Kart over vaktområdet med sjekkpunkter
> • Nødhjelp-knapp med 112, 113, 110 og 02800 alltid synlig
> • Påminnelse før vakten din
>
> FLERE NABOLAG
> Hvert nabolag har sitt eget lag med egen vaktliste, eget kart og egne koordinatorer.
>
> PERSONVERN
> Telefonnummeret ditt ser bare koordinatorene. Vi skriver aldri navn på barn, og vi har ingen reklame eller sporing.
>
> Safetly varsler ikke nødetatene selv. Er noen i fare, ring 112, 113 eller 110.

**Hva er nytt (første versjon):** Første versjon av Safetly.

**Notat til Apple (App Review):**

> Safetly is a free app for parents in a Norwegian neighbourhood who organise volunteer evening patrols ("natteravner"). Users book patrol shifts, see who they walk with, chat with other parents and coordinators, read news and see a map of the patrol area. The app is in Norwegian.
> Demo account: [E-POST] / [PASSORD] (a regular parent account in the team "Byåsen – Hallset").
> Users can report and block other users from the message screen (⋯), and delete their account under Info → Profil → Slett kontoen min. Reported messages are reviewed by the administrator in the "Kontor" screen.
> The app does not contact emergency services; the emergency screen only opens the phone dialer.

---

## Svar på skjemaene

### Google Play – Datasikkerhet
- Samler appen inn eller deler data? **Ja, samler inn.** Deler med tredjeparter: **Nei.**
- Krypteres data under overføring? **Ja.** Kan brukere be om sletting? **Ja** (i appen og via lenken).
- Data som samles inn (alle: **Påkrevd/valgfritt som oppgitt**, formål **Appfunksjonalitet** og **Kontoadministrasjon**, ikke delt):
  - Personopplysninger: **Navn**, **E-postadresse**, **Telefonnummer** (valgfritt)
  - Meldinger: **Meldinger i appen**
  - Appaktivitet: **Annet brukergenerert innhold** (vakter, vaktrapporter, arrangementer)
  - Enhets-ID-er: **Enhets-ID eller annen ID** (adresse for varsler)
- Posisjon: **samles ikke inn** (brukes bare på telefonen).

### Google Play – Innholdsvurdering
- Kategori: «Alle andre apptyper». Vold/sex/språk/narkotika/gambling: **Nei**.
- Kan brukere samhandle/kommunisere? **Ja**. Deler brukerens posisjon med andre? **Nei**. Kjøp: **Nei**.

### Apple – Personvern (App Privacy)
- Kontaktinfo: **Navn, E-post, Telefonnummer** – koblet til brukeren, brukes til appfunksjonalitet. Ikke sporing.
- Brukerinnhold: **Andre meldinger** (chat) og **Annet brukerinnhold** – koblet til brukeren, appfunksjonalitet.
- Identifikatorer / posisjon / kjøp / analyse: **Ikke samlet inn**.

### Apple – Aldersgrense
Svar «Nei/Ingen» på alt unntatt: **Brukergenerert innhold / meldinger mellom brukere: Ja.** Appen havner da typisk på 12+ eller 13+.

---

## Etter lansering
- Nettappen og Android-appen oppdateres automatisk. iPhone-appen får nye bygg i TestFlight automatisk; nye versjoner i App Store sendes til vurdering fra App Store Connect.
- Butikkbildene lages på nytt med `node scripts/store-screenshots.cjs`.
