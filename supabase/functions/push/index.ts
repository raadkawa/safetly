// Safetly – varslingstjeneste (Supabase Edge Function).
// Sender push-varsler til telefoner som har slått på varsler i appen.
//
//   { type: 'public-key' }            -> offentlig nøkkel telefonen trenger for å slå på varsler
//   { type: 'test' }                  -> testvarsel til den som er logget inn
//   { type: 'message', id }           -> ny melding (til én eller «Til alle»)
//   { type: 'news', id }              -> ny nyhet fra koordinator
//   { type: 'cron' }                  -> kjøres hvert 10. min: påminnelse før vakt og «mangler folk» kl. 17
//   { type: 'delete-account' }        -> sletter kontoen til den som er logget inn (krav fra Apple og Google)
//
// Installeres med:  supabase functions deploy push --no-verify-jwt
// (Tjenesten sjekker selv hvem som kaller den der det betyr noe.)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://raadkawa.github.io/safetly/';
const TZ = 'Europe/Oslo';
const DEFAULT_SHIFTS = {
  slots: [{ name: 'Kveldsvakt', start: '21:00', end: '23:00' }, { name: 'Nattvakt', start: '23:00', end: '01:00' }],
  min: 2, days: [0, 1, 2, 3, 4, 5, 6]
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };
type Payload = { title: string; body: string; url?: string; tag?: string };

// ------------------------------------------------------------------ tid i Norge
export function osloParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
}
// Gjør norsk dato + klokkeslett om til et tidspunkt (håndterer sommertid).
export function osloToDate(date: string, hm: string, addDays = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d + addDays, h, mi);
  const p = osloParts(new Date(guess));
  const [py, pm, pd] = p.date.split('-').map(Number);
  const shown = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
  return new Date(guess - (shown - guess));
}
export function addDaysIso(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
const dowMon = (date: string) => (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
// Start på vakten; starter den før kl. 12 er det natt til neste dag (samme regel som i appen).
export function shiftStartAt(date: string, start: string) { return osloToDate(date, start, +start.split(':')[0] < 12 ? 1 : 0); }
const shortName = (n: string) => { const p = (n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : (p[0] || 'Noen'); };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);


// ------------------------------------------------------------------ varsler til ekte apper
// Android (Firebase Cloud Messaging) krever secret FIREBASE_SERVICE_ACCOUNT (JSON fra Firebase).
// iPhone (Apple Push Notification service) krever APNS_KEY_P8, APNS_KEY_ID og APPLE_TEAM_ID.
const b64u = (b: Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  let s = ''; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function pemToDer(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}
export async function signJwt(header: object, claims: object, pem: string, alg: 'RS256' | 'ES256') {
  const input = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(claims));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pem),
    alg === 'RS256' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign(alg === 'RS256' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return input + '.' + b64u(new Uint8Array(sig));
}
let fcmCache: { token: string; exp: number; project: string } | null = null;
async function fcmAccess() {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return null;
  if (fcmCache && fcmCache.exp > Date.now() + 60000) return fcmCache;
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({ alg: 'RS256', typ: 'JWT' }, { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, sa.private_key, 'RS256');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('Firebase-innlogging feilet: ' + JSON.stringify(j).slice(0, 200));
  fcmCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, project: sa.project_id };
  return fcmCache;
}
// Svarer 'gone' når telefonen ikke lenger finnes (da slettes den), ellers 'ok' eller 'error'.
async function sendFcm(token: string, p: Payload): Promise<'ok' | 'gone' | 'error'> {
  const a = await fcmAccess(); if (!a) return 'error';
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project}/messages:send`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token, notification: { title: p.title, body: p.body }, data: { url: p.url || '', tag: p.tag || '' },
      android: { priority: 'HIGH', notification: { tag: p.tag || undefined, icon: 'ic_stat_safetly', color: '#1C1A16', default_sound: true } }
    } })
  });
  if (r.ok) return 'ok';
  const t = await r.text();
  if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*registration/i.test(t)) return 'gone';
  console.error('FCM', r.status, t.slice(0, 300));
  return 'error';
}
let apnsCache: { jwt: string; exp: number } | null = null;
async function sendApns(token: string, p: Payload): Promise<'ok' | 'gone' | 'error'> {
  const key = Deno.env.get('APNS_KEY_P8'); const kid = Deno.env.get('APNS_KEY_ID'); const team = Deno.env.get('APPLE_TEAM_ID');
  if (!key || !kid || !team) return 'error';
  if (!apnsCache || apnsCache.exp < Date.now()) {
    apnsCache = { jwt: await signJwt({ alg: 'ES256', kid }, { iss: team, iat: Math.floor(Date.now() / 1000) }, key, 'ES256'), exp: Date.now() + 40 * 60 * 1000 };
  }
  const host = Deno.env.get('APNS_SANDBOX') === 'true' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const r = await fetch(`https://${host}/3/device/${token}`, {
    method: 'POST',
    headers: { authorization: 'bearer ' + apnsCache.jwt, 'apns-topic': Deno.env.get('APNS_TOPIC') || 'no.safetly.app', 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json' },
    body: JSON.stringify({ aps: { alert: { title: p.title, body: p.body }, sound: 'default', 'thread-id': p.tag || 'safetly' }, url: p.url || '' })
  });
  if (r.ok) return 'ok';
  const t = await r.text();
  if (r.status === 410 || /BadDeviceToken|Unregistered/.test(t)) return 'gone';
  console.error('APNs', r.status, t.slice(0, 300));
  return 'error';
}

// ------------------------------------------------------------------ oppsett
function admin() {
  // Nye prosjekter har «secret»-nøkler; eldre har service_role. Bruk den som finnes.
  const key = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Mangler hemmelig nøkkel i tjenesten');
  return createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
}
async function keys(sb: ReturnType<typeof admin>) {
  const first = await sb.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (first.error) throw new Error('push_config: ' + first.error.message);
  let data = first.data;
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    const ins = await sb.from('push_config').insert({ id: 1, public_key: k.publicKey, private_key: k.privateKey });
    if (ins.error && !/duplicate/i.test(ins.error.message)) throw new Error('push_config lagring: ' + ins.error.message);
    const again = await sb.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle();
    if (again.error || !again.data) throw new Error('push_config: ' + (again.error ? again.error.message : 'tom'));
    data = again.data;
  }
  webpush.setVapidDetails(SITE, data!.public_key, data!.private_key);
  return data!;
}
async function caller(sb: ReturnType<typeof admin>, req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  return data.user ?? null;
}
async function send(sb: ReturnType<typeof admin>, userIds: string[], pref: string | null, payload: Payload) {
  if (!userIds.length) return 0;
  let ids = userIds;
  if (pref) {
    const { data: profs } = await sb.from('profiles').select('id, notify').in('id', userIds);
    ids = (profs || []).filter((p) => !p.notify || p.notify[pref] !== false).map((p) => p.id);
  }
  if (!ids.length) return 0;
  const { data: subs } = await sb.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').in('user_id', ids);
  let sent = 0;
  await Promise.all((subs as Sub[] || []).map(async (s) => {
    if (s.endpoint.startsWith('fcm:') || s.endpoint.startsWith('apns:')) {
      const res = s.endpoint.startsWith('fcm:') ? await sendFcm(s.endpoint.slice(4), payload) : await sendApns(s.endpoint.slice(5), payload);
      if (res === 'ok') sent++;
      else if (res === 'gone') await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      return;
    }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 6, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // telefonen har slått av varsler
      else console.error('push feilet', code, (e as Error).message);
    }
  }));
  return sent;
}
async function once(sb: ReturnType<typeof admin>, key: string) {
  const { error } = await sb.from('push_log').insert({ key });
  return !error; // finnes nøkkelen fra før, er varselet allerede sendt
}

// ------------------------------------------------------------------ hendelser
async function onMessage(sb: ReturnType<typeof admin>, user: { id: string }, id: string) {
  const { data: m } = await sb.from('messages').select('id, sender_id, recipient_id, body, created_at').eq('id', id).maybeSingle();
  if (!m || m.sender_id !== user.id) return { error: 'Fant ikke meldingen' };
  if (Date.now() - Date.parse(m.created_at) > 10 * 60 * 1000) return { error: 'For gammel melding' };
  if (!(await once(sb, 'melding:' + m.id))) return { sent: 0 };
  const { data: from } = await sb.from('profiles').select('full_name').eq('id', m.sender_id).maybeSingle();
  const name = shortName(from?.full_name || '');
  if (m.recipient_id) {
    const blk = await sb.from('blocks').select('user_id').eq('user_id', m.recipient_id).eq('blocked_id', m.sender_id).maybeSingle();
    if (blk.data) return { sent: 0 };
    return { sent: await send(sb, [m.recipient_id], 'meldinger', { title: `Melding fra ${name}`, body: clip(m.body, 140), url: `#/chat/${m.sender_id}`, tag: 'chat-' + m.sender_id }) };
  }
  const { data: all } = await sb.from('profiles').select('id');
  const ids = (all || []).map((p) => p.id).filter((x) => x !== m.sender_id);
  return { sent: await send(sb, ids, 'alle', { title: `Til alle fra ${name}`, body: clip(m.body, 140), url: '#/chat/alle', tag: 'chat-alle' }) };
}
async function onNews(sb: ReturnType<typeof admin>, user: { id: string }, id: string) {
  const { data: n } = await sb.from('news').select('*').eq('id', id).maybeSingle();
  if (!n || n.author_id !== user.id) return { error: 'Fant ikke nyheten' };
  if (Date.now() - Date.parse(n.created_at) > 10 * 60 * 1000) return { error: 'For gammel nyhet' };
  if (!(await once(sb, 'nyhet:' + n.id))) return { sent: 0 };
  const { data: all } = await sb.from('profiles').select('*');
  const ids = (all || []).filter((p) => !n.team_id || p.team_id === n.team_id).map((p) => p.id).filter((x) => x !== n.author_id);
  return { sent: await send(sb, ids, 'nyheter', { title: 'Ukas nyheter', body: clip(n.title, 140), url: '#/nyheter', tag: 'nyheter' }) };
}
async function deleteAccount(sb: ReturnType<typeof admin>, user: { id: string }) {
  const { data: me } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (me && me.is_admin) {
    const { count: admins } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('is_admin', true);
    const { count: all } = await sb.from('profiles').select('id', { count: 'exact', head: true });
    if ((admins ?? 0) <= 1 && (all ?? 0) > 1) return { error: 'Du er eneste administrator. Gjør en annen til administrator før du sletter kontoen.' };
  }
  const { error } = await sb.auth.admin.deleteUser(user.id); // profil, vakter, meldinger osv. slettes med kontoen
  if (error) return { error: error.message };
  return { deleted: true };
}

async function onCron(sb: ReturnType<typeof admin>, now = new Date()) {
  // Hvert lag har egne vakttider og oppmøtested. Uten lag (eldre database) brukes settings.
  const { data: st } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
  const teamsRes = await sb.from('teams').select('*').order('created_at');
  const teams = teamsRes.error ? [] : (teamsRes.data || []);
  const validCfg = (c: any) => c && Array.isArray(c.slots) && c.slots.length;
  const teamOf = (id: string | null) => teams.find((t) => t.id === id) || teams[0] || null;
  const cfgFor = (tid: string | null) => { const t = teamOf(tid); const c = t ? t.shifts : st && st.shifts; return validCfg(c) ? c : DEFAULT_SHIFTS; };
  const meetFor = (tid: string | null) => { const t = teamOf(tid); return (t ? t.meeting_name : st && st.meeting_name) || 'oppmøtestedet'; };
  const o = osloParts(now);
  const dates = [addDaysIso(o.date, -1), o.date];
  const { data: bookings } = await sb.from('bookings').select('*').in('shift_date', dates);
  const { data: profs } = await sb.from('profiles').select('*');
  const nameOf = (id: string) => shortName((profs || []).find((p) => p.id === id)?.full_name || '');
  let reminders = 0; let alerts = 0;

  // Påminnelse 2 timer før vakten
  for (const b of bookings || []) {
    const cfg = cfgFor(b.team_id ?? null); const meet = meetFor(b.team_id ?? null);
    const slot = cfg.slots[b.slot - 1]; if (!slot) continue;
    if (!cfg.days.includes(dowMon(b.shift_date))) continue;
    const start = shiftStartAt(b.shift_date, slot.start);
    const left = start.getTime() - now.getTime();
    if (left <= 0 || left > 2 * 60 * 60 * 1000) continue;
    if (!(await once(sb, 'vakt:' + b.id))) continue;
    const others = (bookings || []).filter((x) => x.shift_date === b.shift_date && x.slot === b.slot && (x.team_id ?? null) === (b.team_id ?? null) && x.user_id !== b.user_id).map((x) => nameOf(x.user_id));
    reminders += await send(sb, [b.user_id], 'vakt', {
      title: `Vakt i kveld ${slot.start}–${slot.end}`,
      body: `${others.length ? 'Du går med ' + others.join(' og ') + '. ' : 'Ingen andre er påmeldt ennå. '}Oppmøte: ${meet}.`,
      url: '#/vakter', tag: 'vakt-' + b.id
    });
  }

  // Kl. 17: kveldens vakter som mangler folk, per lag, til foreldrene i laget
  if (o.hour === 17) {
    const groups = teams.length ? teams.map((t) => t.id) : [null];
    for (const tid of groups) {
      const cfg = cfgFor(tid);
      if (!cfg.days.includes(dowMon(o.date))) continue;
      if (!(await once(sb, 'mangler:' + o.date + ':' + (tid || 'alle')))) continue;
      const inTeam = (b: any) => !teams.length || (b.team_id ?? teams[0].id) === tid;
      const tonight = (bookings || []).filter((b) => b.shift_date === o.date && inTeam(b));
      const need = cfg.slots.map((s: { start: string; end: string }, i: number) => ({ s, n: tonight.filter((b) => b.slot === i + 1).length }))
        .filter((x: { n: number }) => x.n < cfg.min);
      if (!need.length) continue;
      const booked = new Set(tonight.map((b) => b.user_id));
      const ids = (profs || []).filter((p) => !teams.length || (p.team_id ?? teams[0].id) === tid).map((p) => p.id).filter((id) => !booked.has(id));
      alerts += await send(sb, ids, 'mangler', {
        title: 'Vi trenger flere voksne i kveld',
        body: need.map((x: { s: { start: string; end: string }; n: number }) => `${x.s.start}–${x.s.end}: ${cfg.min - x.n} til`).join(', ') + '. Kan du ta en vakt?',
        url: '#/vakter', tag: 'mangler-' + o.date
      });
    }
  }
  // Rydd i loggen
  await sb.from('push_log').delete().lt('created_at', new Date(now.getTime() - 14 * 86400000).toISOString());
  return { reminders, alerts };
}

// ------------------------------------------------------------------ inngang
if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
    try {
      const body = await req.json().catch(() => ({}));
      const sb = admin();
      const k = await keys(sb);
      if (body.type === 'public-key') return json({ publicKey: k.public_key });
      if (body.type === 'cron') return json(await onCron(sb));
      const user = await caller(sb, req);
      if (!user) return json({ error: 'Ikke logget inn' }, 401);
      if (body.type === 'delete-account') return json(await deleteAccount(sb, user));
      if (body.type === 'test') return json({ sent: await send(sb, [user.id], null, { title: 'Safetly', body: 'Varsler virker på denne telefonen. 👍', url: '#/info', tag: 'test' }) });
      if (body.type === 'message' && typeof body.id === 'string') return json(await onMessage(sb, user, body.id));
      if (body.type === 'news' && typeof body.id === 'string') return json(await onNews(sb, user, body.id));
      return json({ error: 'Ukjent forespørsel' }, 400);
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  });
}
