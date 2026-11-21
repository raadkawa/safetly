// Tester for varslingstjenesten.
// Kjør: NODE_TLS_REJECT_UNAUTHORIZED=0 TEST_CERT=c.pem TEST_KEY=k.pem deno test -A --unsafely-ignore-certificate-errors=localhost test.ts
// (lag sertifikat: openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -days 1 -subj /CN=localhost)
import { assertEquals } from 'jsr:@std/assert@1';
import webpush from 'npm:web-push@3.6.7';
import { osloToDate, shiftStartAt, osloParts, addDaysIso } from './index.ts';

Deno.test('norsk tid: vinter og sommer', () => {
  assertEquals(osloToDate('2026-11-21', '21:00').toISOString(), '2026-11-21T20:00:00.000Z');
  assertEquals(osloToDate('2026-07-01', '21:00').toISOString(), '2026-07-01T19:00:00.000Z');
  assertEquals(osloParts(new Date('2026-11-21T16:05:00Z')), { date: '2026-11-21', hour: 17, minute: 5 });
});
Deno.test('vakt etter midnatt hører til kvelden før', () => {
  assertEquals(shiftStartAt('2026-11-21', '23:00').toISOString(), '2026-11-21T22:00:00.000Z');
  assertEquals(shiftStartAt('2026-11-21', '00:30').toISOString(), '2026-11-21T23:30:00.000Z');
  assertEquals(addDaysIso('2026-12-31', 1), '2027-01-01');
});
Deno.test('web push blir kryptert og sendt', async () => {
  const vapid = webpush.generateVAPIDKeys();
  webpush.setVapidDetails('https://raadkawa.github.io/safetly/', vapid.publicKey, vapid.privateKey);
  // Lag en «telefon»: nøkkelpar og hemmelighet slik nettleseren gjør
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const got: { enc?: string | null; auth?: string | null; size?: number } = {};
  const ac = new AbortController();
  const server = Deno.serve({ port: 8765, signal: ac.signal, onListen() {}, cert: Deno.readTextFileSync(Deno.env.get('TEST_CERT')!), key: Deno.readTextFileSync(Deno.env.get('TEST_KEY')!) }, async (req) => {
    got.enc = req.headers.get('content-encoding'); got.auth = req.headers.get('authorization');
    got.size = (await req.arrayBuffer()).byteLength;
    return new Response(null, { status: 201 });
  });
  const res = await webpush.sendNotification(
    { endpoint: 'https://localhost:8765/push/abc', keys: { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } },
    JSON.stringify({ title: 'Melding fra Kari N.', body: 'Hei! Kan du ta fredag?' }), { TTL: 60 });
  ac.abort(); await server.finished;
  assertEquals(res.statusCode, 201);
  assertEquals(got.enc, 'aes128gcm');
  assertEquals(got.auth?.startsWith('vapid t='), true);
  assertEquals((got.size ?? 0) > 100, true);
});
