// Tilpasser de genererte Android- og iPhone-prosjektene til Safetly. Brukes av GitHub Actions.
//
//   node scripts/native-setup.mjs config android   før `cap add/sync`: Android henter innholdet fra nettappen
//   node scripts/native-setup.mjs config ios       før `cap add/sync`: iPhone har innholdet innebygd
//   node scripts/native-setup.mjs android          etter `cap sync android`
//   node scripts/native-setup.mjs ios              etter `cap sync ios`
//
// Miljøvariabler:
//   BUILD_NUMBER           versjonsnummer for bygget (øker for hver opplasting)
//   GOOGLE_SERVICES_JSON   innholdet i google-services.json fra Firebase (slår på varsler på Android)
//   PUSH_IOS=1             slår på varsler på iPhone (krever APNs-nøkkel i Supabase)
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, platform] = process.argv.slice(2);
const SITE = 'https://raadkawa.github.io/safetly/';
const build = String(process.env.BUILD_NUMBER || '1');
const version = `1.0.${build}`;
const log = (m) => console.log('✓ ' + m);

function read(p) { return readFileSync(join(root, p), 'utf8'); }
function write(p, s) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); }

if (cmd === 'config') {
  const c = JSON.parse(read('capacitor.config.json'));
  if (platform === 'android') {
    c.server = Object.assign({}, c.server, { url: SITE, errorPath: 'offline.html' });
    if (process.env.GOOGLE_SERVICES_JSON) c.android = Object.assign({}, c.android, { appendUserAgent: 'SafetlyPush/1' });
  } else if (platform === 'ios') {
    delete c.server;
    if (process.env.PUSH_IOS === '1') c.ios = Object.assign({}, c.ios, { appendUserAgent: 'SafetlyPush/1' });
  }
  write('capacitor.config.json', JSON.stringify(c, null, 2) + '\n');
  log(`capacitor.config.json for ${platform}`);
} else if (cmd === 'android') {
  const M = 'android/app/src/main/AndroidManifest.xml';
  let m = read(M);
  const perms = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.POST_NOTIFICATIONS'];
  for (const p of perms) if (!m.includes(p)) m = m.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  if (!m.includes('default_notification_icon')) {
    m = m.replace('</application>',
      '        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_safetly" />\n' +
      '        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/safetly_ink" />\n' +
      '    </application>');
  }
  write(M, m);
  log('tillatelser (posisjon, varsler) og varselikon i AndroidManifest.xml');
  copyFileSync(join(root, 'www/icons/badge-96.png'), join(root, 'android/app/src/main/res/drawable/ic_stat_safetly.png'));
  write('android/app/src/main/res/values/safetly_colors.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="safetly_ink">#1C1A16</color>\n</resources>\n');
  log('hvitt varselikon');
  if (process.env.GOOGLE_SERVICES_JSON) {
    JSON.parse(process.env.GOOGLE_SERVICES_JSON); // sjekk at det er gyldig JSON
    write('android/app/google-services.json', process.env.GOOGLE_SERVICES_JSON);
    log('google-services.json (varsler på Android)');
  } else {
    console.log('– GOOGLE_SERVICES_JSON mangler: Android-appen bygges uten varsler');
  }
  const G = 'android/app/build.gradle';
  let g = read(G);
  g = g.replace(/versionCode\s+\d+/, `versionCode ${build}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  write(G, g);
  log(`versjon ${version} (${build})`);
} else if (cmd === 'ios') {
  const A = 'ios/App/App/AppDelegate.swift';
  let a = read(A);
  if (!a.includes('capacitorDidRegisterForRemoteNotifications')) {
    const add = `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;
    const i = a.lastIndexOf('}');
    a = a.slice(0, i) + add + a.slice(i);
    write(A, a);
    log('AppDelegate.swift sender varsel-adressen videre til appen');
  }
  write('ios/App/App/App.entitlements', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${process.env.PUSH_IOS === '1' ? '\t<key>aps-environment</key>\n\t<string>production</string>\n' : ''}</dict>
</plist>
`);
  log(`App.entitlements (varsler ${process.env.PUSH_IOS === '1' ? 'på' : 'av'})`);
} else {
  console.error('Bruk: node scripts/native-setup.mjs config android|ios  eller  android  eller  ios');
  process.exit(1);
}
