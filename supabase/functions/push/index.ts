// Safetly – varslingstjeneste (Supabase Edge Function).
// Sender push-varsler til telefoner som har slått på varsler i appen.
//
//   { type: 'public-key' }            -> offentlig nøkkel telefonen trenger for å slå på varsler
//   { type: 'test' }                  -> testvarsel til den som er logget inn
//   { type: 'message', id }           -> ny melding (til én eller «Til alle»)
//   { type: 'news', id }              -> ny nyhet fra koordinator
//   { type: 'cron' }                  -> kjøres hvert 10. min: påminnelse før vakt og «mangler folk» kl. 17
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
    return { sent: await send(sb, [m.recipient_id], 'meldinger', { title: `Melding fra ${name}`, body: clip(m.body, 140), url: `#/chat/${m.sender_id}`, tag: 'chat-' + m.sender_id }) };
  }
  const { data: all } = await sb.from('profiles').select('id');
  const ids = (all || []).map((p) => p.id).filter((x) => x !== m.sender_id);
  return { sent: await send(sb, ids, 'alle', { title: `Til alle fra ${name}`, body: clip(m.body, 140), url: '#/chat/alle', tag: 'chat-alle' }) };
}
async function onNews(sb: ReturnType<typeof admin>, user: { id: string }, id: string) {
  const { data: n } = await sb.from('news').select('id, author_id, title, created_at').eq('id', id).maybeSingle();
  if (!n || n.author_id !== user.id) return { error: 'Fant ikke nyheten' };
  if (Date.now() - Date.parse(n.created_at) > 10 * 60 * 1000) return { error: 'For gammel nyhet' };
  if (!(await once(sb, 'nyhet:' + n.id))) return { sent: 0 };
  const { data: all } = await sb.from('profiles').select('id');
  const ids = (all || []).map((p) => p.id).filter((x) => x !== n.author_id);
  return { sent: await send(sb, ids, 'nyheter', { title: 'Ukas nyheter', body: clip(n.title, 140), url: '#/nyheter', tag: 'nyheter' }) };
}
async function onCron(sb: ReturnType<typeof admin>, now = new Date()) {
  const { data: st } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
  const cfg = (st && st.shifts && Array.isArray(st.shifts.slots) && st.shifts.slots.length) ? st.shifts : DEFAULT_SHIFTS;
  const meet = (st && st.meeting_name) || 'oppmøtestedet';
  const o = osloParts(now);
  const dates = [addDaysIso(o.date, -1), o.date];
  const { data: bookings } = await sb.from('bookings').select('id, user_id, shift_date, slot').in('shift_date', dates);
  const { data: profs } = await sb.from('profiles').select('id, full_name');
  const nameOf = (id: string) => shortName((profs || []).find((p) => p.id === id)?.full_name || '');
  let reminders = 0; let alerts = 0;

  // Påminnelse 2 timer før vakten
  for (const b of bookings || []) {
    const slot = cfg.slots[b.slot - 1]; if (!slot) continue;
    if (!cfg.days.includes(dowMon(b.shift_date))) continue;
    const start = shiftStartAt(b.shift_date, slot.start);
    const left = start.getTime() - now.getTime();
    if (left <= 0 || left > 2 * 60 * 60 * 1000) continue;
    if (!(await once(sb, 'vakt:' + b.id))) continue;
    const others = (bookings || []).filter((x) => x.shift_date === b.shift_date && x.slot === b.slot && x.user_id !== b.user_id).map((x) => nameOf(x.user_id));
    reminders += await send(sb, [b.user_id], 'vakt', {
      title: `Vakt i kveld ${slot.start}–${slot.end}`,
      body: `${others.length ? 'Du går med ' + others.join(' og ') + '. ' : 'Ingen andre er påmeldt ennå. '}Oppmøte: ${meet}.`,
      url: '#/vakter', tag: 'vakt-' + b.id
    });
  }

  // Kl. 17: kveldens vakter som mangler folk
  if (o.hour === 17 && cfg.days.includes(dowMon(o.date)) && (await once(sb, 'mangler:' + o.date))) {
    const need = cfg.slots.map((s: { start: string; end: string }, i: number) => ({ s, n: (bookings || []).filter((b) => b.shift_date === o.date && b.slot === i + 1).length }))
      .filter((x: { n: number }) => x.n < cfg.min);
    if (need.length) {
      const booked = new Set((bookings || []).filter((b) => b.shift_date === o.date).map((b) => b.user_id));
      const ids = (profs || []).map((p) => p.id).filter((id) => !booked.has(id));
      alerts = await send(sb, ids, 'mangler', {
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
