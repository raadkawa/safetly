/* Safetly – natteravner i nabolaget.
 * Ren JavaScript uten byggesteg. Bruker Supabase når config.js har nøkler, ellers demomodus (localStorage).
 */
(function () {
  'use strict';

  const CFG = window.SAFETLY_CONFIG || {};
  // Vakter per kveld. Koordinatorer kan endre dette i Kontor → Vakttider (lagres i settings.shifts).
  const DEFAULT_SHIFTS = {
    slots: [{ name: 'Kveldsvakt', start: '21:00', end: '23:00' }, { name: 'Nattvakt', start: '23:00', end: '01:00' }],
    min: 2, days: [0, 1, 2, 3, 4, 5, 6]
  };
  const MAX_SLOTS = 4;
  let MIN_PER_SHIFT = 2; let SLOTS = {}; let SLOT_IDS = []; let ACTIVE_DAYS = new Set();
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  // Godtar «21:00», «21.00», «2100», «930» og «21» og gjør dem om til TT:MM (24-timersklokke).
  function normTime(v) {
    const t = String(v || '').trim();
    let h, m;
    const sep = t.match(/^(\d{1,2})\s*[:.,]\s*(\d{1,2})$/);
    if (sep) { h = +sep[1]; m = +sep[2]; }
    else if (/^\d{1,4}$/.test(t)) { if (t.length <= 2) { h = +t; m = 0; } else { h = +t.slice(0, t.length - 2); m = +t.slice(-2); } }
    else return t;
    if (h === 24) h = 0;
    return (h < 24 && m < 60) ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : t;
  }
  const timeInput = (id, value, extra) => `<input type="text" inputmode="numeric" autocomplete="off" id="${id}" maxlength="5" placeholder="21:00" value="${esc(value || '')}" ${extra || ''} aria-describedby="tid-hjelp">`;
  function validShifts(c) {
    return !!(c && Array.isArray(c.slots) && c.slots.length >= 1 && c.slots.length <= MAX_SLOTS &&
      c.slots.every((x) => x && TIME_RE.test(x.start) && TIME_RE.test(x.end) && x.start !== x.end) &&
      Number.isInteger(c.min) && c.min >= 1 && c.min <= 9 && Array.isArray(c.days) && c.days.length >= 1);
  }
  function applyShifts(cfg) {
    const c = validShifts(cfg) ? cfg : DEFAULT_SHIFTS;
    SLOTS = {}; SLOT_IDS = [];
    c.slots.forEach((x, i) => { SLOTS[i + 1] = { name: x.name || `Vakt ${i + 1}`, start: x.start, end: x.end }; SLOT_IDS.push(i + 1); });
    MIN_PER_SHIFT = c.min; ACTIVE_DAYS = new Set(c.days.map(Number));
  }
  applyShifts(null);
  const SLOT_COLORS = ['blue', 'yellow', 'pink', 'blue'];
  const DAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
  const DAYS_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
  const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const MOODS = {
    rolig: { label: 'Rolig kveld', mark: '●', cls: 'ok' },
    uro: { label: 'Noe uro', mark: '◆', cls: 'warn' },
    hjelp: { label: 'Trengte hjelp', mark: '▲', cls: 'alert' }
  };

  // ------------------------------------------------------------------ hjelpere
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const dow = (d) => (d.getDay() + 6) % 7; // 0 = mandag
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const weekStart = (d) => addDays(d, -dow(d));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  }
  const fmtDay = (s) => { const d = parseIso(s); return `${DAYS[dow(d)]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
  const fmtShort = (s) => { const d = parseIso(s); return `${DAYS_SHORT[dow(d)].toLowerCase()} ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const fmtTime = (t) => String(t || '').slice(0, 5);
  const fmtStamp = (ts) => { const d = new Date(ts); return `${fmtShort(iso(d))} kl. ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const slotInfo = (slot) => SLOTS[slot] || { name: 'Vakt', start: '21:00', end: '23:00' };
  // En vakt som starter før kl. 12 regnes som natt til neste dag (f.eks. 00:30–02:00).
  function shiftStart(date, slot) { const [h, m] = slotInfo(slot).start.split(':').map(Number); const d = parseIso(date); if (h < 12) d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d; }
  function shiftEnd(date, slot) { const st = shiftStart(date, slot); const [h, m] = slotInfo(slot).end.split(':').map(Number); const d = new Date(st); d.setHours(h, m, 0, 0); if (d <= st) d.setDate(d.getDate() + 1); return d; }
  const shiftLabel = (date, slot) => `${cap(fmtDay(date))}, ${slotInfo(slot).start}–${slotInfo(slot).end}`;
  const slotsOn = (date) => (ACTIVE_DAYS.has(dow(parseIso(date))) ? SLOT_IDS : []);
  function initials(name) { const p = String(name || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function shortName(name) { const p = String(name || '').trim().split(/\s+/); if (!p[0]) return 'Uten navn'; return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; }
  const telHref = (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
  const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

  // ------------------------------------------------------------------ ikoner
  const svg = (body, o) => `<svg aria-hidden="true" width="${(o && o.s) || 22}" height="${(o && o.s) || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${(o && o.w) || 2}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const I = {
    moon: (s) => `<svg aria-hidden="true" width="${s || 20}" height="${s || 20}" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 4a8 8 0 1 0 4.5 13.5A6.5 6.5 0 0 1 15.5 4z"/></svg>`,
    phone: (s) => svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>', { s: s || 20 }),
    shield: () => svg('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>'),
    cal: () => svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    news: () => svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    people: () => svg('<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M15 15c2.4 0 4.6 1.2 5.5 4"/>'),
    info: () => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>'),
    bell: () => svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4"/>', { s: 20 }),
    left: () => svg('<path d="M14.5 6l-6 6 6 6"/>', { s: 20, w: 2.2 }),
    right: () => svg('<path d="M9.5 6l6 6-6 6"/>', { s: 20, w: 2.2 }),
    plus: () => svg('<path d="M12 5v14M5 12h14"/>', { s: 18, w: 2.4 }),
    x: (s) => svg('<path d="M6 6l12 12M18 6L6 18"/>', { s: s || 16, w: 2.4 }),
    download: () => svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', { s: 20, w: 2.2 }),
    alert: () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>', { s: 22, w: 2.2 }),
    pen: () => svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', { s: 20 }),
    chat: (s) => svg('<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17h0A2.5 2.5 0 0 1 4 14.5z"/>', { s: s || 22 }),
    check: () => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', { s: 14, w: 2.6 }),
    checks: () => svg('<path d="M2.5 12.5l4.5 4.5 9-9.5M9.5 16l1 1 9-9.5"/>', { s: 16, w: 2.4 }),
    send: () => svg('<path d="M5 12h13M13 6l6 6-6 6"/>', { s: 22, w: 2.4 }),
    megaphone: (s) => svg('<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6"/>', { s: s || 22 }),
    map: (s) => svg('<path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5zM9 4.5v13M15 6.5v13"/>', { s: s || 22 }),
    locate: (s) => svg('<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="7.5"/>', { s: s || 20 }),
    trash: (s) => svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>', { s: s || 18 }),
    up: (s) => svg('<path d="M12 18V6M6.5 11.5L12 6l5.5 5.5"/>', { s: s || 18, w: 2.2 })
  };

  // ------------------------------------------------------------------ datalag: Supabase
  function supabaseApi() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const ok = (r) => { if (r.error) throw r.error; return r.data; };
    const redirect = () => CFG.siteUrl || (location.origin + location.pathname);
    let userId = null;
    return {
      mode: 'supabase',
      async getUser() { const { data } = await sb.auth.getSession(); const u = data.session && data.session.user; userId = u ? u.id : null; return u ? { id: u.id, email: u.email } : null; },
      onAuth(cb) {
        sb.auth.onAuthStateChange((event, session) => {
          const u = session && session.user; userId = u ? u.id : null;
          // Kall videre utenfor Supabase sin auth-lås (ellers kan nye spørringer henge).
          setTimeout(() => cb(u ? { id: u.id, email: u.email } : null, event), 0);
        });
      },
      async signUp({ email, password, name, phone }) {
        const r = ok(await sb.auth.signUp({ email, password, options: { data: { full_name: name, phone }, emailRedirectTo: redirect() } }));
        return { needsConfirm: !r.session };
      },
      async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() })); },
      async updatePassword(password) { ok(await sb.auth.updateUser({ password })); },
      async signOut() { await sb.auth.signOut(); },
      async profiles() {
        const r = await sb.from('profiles').select('id,full_name,role,created_at,team_id,is_admin').order('full_name');
        if (!r.error) return r.data;
        return ok(await sb.from('profiles').select('id,full_name,role,created_at').order('full_name')); // før lag.sql
      },
      async teams() { const r = await sb.from('teams').select('id,name,meeting_name,meeting_address,meeting_note,map,shifts,created_at').order('created_at'); return r.error ? null : r.data; },
      async updateTeam(id, v) { const rows = ok(await sb.from('teams').update(v).eq('id', id).select('id')); if (!rows || !rows.length) throw new Error('permission denied'); },
      async createTeam(name) { return ok(await sb.from('teams').insert({ name }).select('id').single()); },
      async setTeam(userId, teamId) { ok(await sb.from('profiles').update({ team_id: teamId }).eq('id', userId)); },
      async phones() { return ok(await sb.from('private_contacts').select('user_id,phone')); },
      async contacts() { return ok(await sb.rpc('coordinator_contacts')); },
      async bookings(from, to) {
        const r = await sb.from('bookings').select('id,user_id,shift_date,slot,team_id').gte('shift_date', from).lte('shift_date', to);
        if (!r.error) return r.data;
        return ok(await sb.from('bookings').select('id,user_id,shift_date,slot').gte('shift_date', from).lte('shift_date', to));
      },
      async myBookings() { return ok(await sb.from('bookings').select('id,shift_date,slot').eq('user_id', userId)); },
      async book(rows) { ok(await sb.from('bookings').upsert(rows, { onConflict: 'user_id,shift_date,slot', ignoreDuplicates: true })); },
      async unbook(id) { ok(await sb.from('bookings').delete().eq('id', id)); },
      async news() {
        const r = await sb.from('news').select('id,author_id,title,body,created_at,team_id').order('created_at', { ascending: false }).limit(40);
        if (!r.error) return r.data;
        return ok(await sb.from('news').select('id,author_id,title,body,created_at').order('created_at', { ascending: false }).limit(30));
      },
      async addNews(n) {
        const row = { author_id: userId, title: n.title, body: n.body };
        if (n.team_id !== undefined) row.team_id = n.team_id;
        return ok(await sb.from('news').insert(row).select('id').single());
      },
      async deleteNews(id) { ok(await sb.from('news').delete().eq('id', id)); },
      async reports() { return ok(await sb.from('reports').select('id,user_id,shift_date,slot,mood,note,created_at').order('shift_date', { ascending: false }).order('slot', { ascending: false }).limit(40)); },
      async myReports() { return ok(await sb.from('reports').select('shift_date,slot').eq('user_id', userId)); },
      async addReport(r) { ok(await sb.from('reports').insert(Object.assign({ user_id: userId }, r))); },
      async events(from) { return ok(await sb.from('events').select('id,created_by,title,event_date,event_time,place,description').gte('event_date', from).order('event_date').order('event_time')); },
      async addEvent(e) { ok(await sb.from('events').insert(Object.assign({ created_by: userId }, e))); },
      async deleteEvent(id) { ok(await sb.from('events').delete().eq('id', id)); },
      async attendees() { return ok(await sb.from('event_attendees').select('event_id,user_id')); },
      async attend(eventId) { ok(await sb.from('event_attendees').insert({ event_id: eventId, user_id: userId })); },
      async unattend(eventId) { ok(await sb.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', userId)); },
      async updateName(name) { ok(await sb.from('profiles').update({ full_name: name }).eq('id', userId)); },
      async updatePhone(phone) { ok(await sb.from('private_contacts').upsert({ user_id: userId, phone })); },
      async settings() {
        // Prøv med alle kolonner først; eldre databaser mangler kanskje map eller shifts.
        const tries = ['meeting_name,meeting_address,meeting_note,map,shifts', 'meeting_name,meeting_address,meeting_note,map', 'meeting_name,meeting_address,meeting_note'];
        let last;
        for (const cols of tries) { const r = await sb.from('settings').select(cols).eq('id', 1).maybeSingle(); if (!r.error) return r.data; last = r.error; }
        throw last;
      },
      async updateSettings(v) {
        const rows = ok(await sb.from('settings').update(Object.assign({ updated_at: new Date().toISOString() }, v)).eq('id', 1).select('id'));
        if (!rows || !rows.length) throw new Error('permission denied');
      },
      async setRole(id, role) { ok(await sb.from('profiles').update({ role }).eq('id', id)); },
      pushReady: true,
      async pushKey() { const r = await sb.functions.invoke('push', { body: { type: 'public-key' } }); if (r.error || !r.data || !r.data.publicKey) throw new Error('Varslingstjenesten er ikke installert ennå.'); return r.data.publicKey; },
      async notify(body) { const r = await sb.functions.invoke('push', { body }); if (r.error) throw r.error; return r.data; },
      async savePush(endpoint, p256dh, auth) { ok(await sb.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })); },
      async removePush(endpoint) { ok(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); },
      async myNotify() { const r = await sb.from('profiles').select('notify').eq('id', userId).maybeSingle(); return r.error ? null : (r.data && r.data.notify) || null; },
      async updateNotify(v) { ok(await sb.from('profiles').update({ notify: v }).eq('id', userId)); },
      async messages() { return ok(await sb.from('messages').select('id,sender_id,recipient_id,body,created_at').order('created_at', { ascending: false }).limit(500)).reverse(); },
      async sendMessage(recipientId, body) { return ok(await sb.from('messages').insert({ sender_id: userId, recipient_id: recipientId, body }).select('id,sender_id,recipient_id,body,created_at').single()); },
      async reads() { return ok(await sb.from('chat_reads').select('thread,last_read_at')); },
      async markRead(thread) { ok(await sb.from('chat_reads').upsert({ user_id: userId, thread, last_read_at: new Date().toISOString() })); },
      async peerReads() { return ok(await sb.from('chat_reads').select('user_id,last_read_at').eq('thread', userId)); },
      async alleReadTimes() { return ok(await sb.rpc('alle_read_times')) || []; },
      onRead(cb) {
        const ch = sb.channel('safetly-lest')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_reads' }, (p) => cb(p.new))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_reads' }, (p) => cb(p.new))
          .subscribe();
        return () => sb.removeChannel(ch);
      },
      onMessage(cb) {
        const ch = sb.channel('safetly-meldinger').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => cb(p.new)).subscribe();
        return () => sb.removeChannel(ch);
      }
    };
  }

  // ------------------------------------------------------------------ datalag: demomodus (lokalt)
  function localApi() {
    const KEY = 'safetly-demo-v2';
    let db = load();
    const listeners = [];
    function load() {
      try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.v === 2) return x; } catch (e) { /* tom */ }
      return seed();
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* privat modus */ } }
    function seed() {
      const people = [
        ['Kari Nilsen', '412 34 567', 'koordinator'], ['Ahmed Said', '934 56 789', 'forelder'], ['Lene Berg', '977 10 204', 'forelder'],
        ['Tor Eide', '908 44 120', 'forelder'], ['Marte Vik', '473 98 001', 'forelder'], ['Jonas Lie', '416 22 870', 'forelder'], ['Sara Khan', '455 67 890', 'forelder']
      ];
      const users = people.map((p, i) => ({ id: 'demo-' + i, email: '', password: null, full_name: p[0], phone: p[1], role: p[2], seed: true, is_admin: false, team_id: i < 5 ? 'lag1' : 'lag2', created_at: new Date(2026, 7, 20 + i).toISOString() }));
      users[5].role = 'koordinator';
      const teams = [
        { id: 'lag1', name: 'Byåsen – Hallset', meeting_name: '', meeting_address: '', meeting_note: '', map: null, shifts: null, created_at: '2026-08-01T00:00:00Z' },
        { id: 'lag2', name: 'Ugla – Dalgård', meeting_name: 'Ugla skole', meeting_address: '', meeting_note: 'Møt opp ved hovedinngangen.', map: null, shifts: { slots: [{ name: 'Kveldsvakt', start: '20:00', end: '22:30' }], min: 2, days: [4, 5] }, created_at: '2026-09-01T00:00:00Z' }
      ];
      const t = today();
      const bookings = [];
      for (let d = -14; d <= 28; d++) {
        const date = iso(addDays(t, d));
        [1, 2].forEach((slot) => {
          const n = Math.abs((d * 7 + slot * 5 + 3) % 4); // 0–3 personer
          for (let k = 0; k < n; k++) { const u = users[(Math.abs(d) * 3 + slot * 2 + k) % users.length]; bookings.push({ id: uid(), user_id: u.id, shift_date: date, slot: u.team_id === 'lag2' ? 1 : slot, team_id: u.team_id }); }
        });
      }
      const uniq = {}; const bk = bookings.filter((b) => { const k = b.user_id + b.shift_date + b.slot; if (uniq[k]) return false; uniq[k] = 1; return true; });
      const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
      return {
        v: 2, session: null, users, teams, bookings: bk,
        news: [
          { id: uid(), author_id: 'demo-0', team_id: 'lag1', title: 'Vi trenger flere voksne i helgen', body: 'Flere vakter mangler folk denne uka. Ta gjerne en ekstra vakt hvis du kan.', created_at: ago(30) },
          { id: uid(), author_id: 'demo-0', team_id: 'lag1', title: 'Nye refleksvester og lykter', body: 'Kassen bak disken på oppmøtestedet er fylt opp. Legg alt tilbake etter vakt.', created_at: ago(80) },
          { id: uid(), author_id: 'demo-5', team_id: 'lag2', title: 'Velkommen til Ugla – Dalgård', body: 'Vi går fredag og lørdag. Book deg gjerne på.', created_at: ago(55) }
        ],
        reports: [
          { id: uid(), user_id: 'demo-1', shift_date: iso(addDays(t, -1)), slot: 1, mood: 'rolig', note: 'Stille ved skolen. Noen ungdommer på Torget, hyggelig prat.', created_at: ago(20) },
          { id: uid(), user_id: 'demo-2', shift_date: iso(addDays(t, -2)), slot: 2, mood: 'uro', note: 'Høylytt gjeng ved busstoppet. Roet seg etter en prat.', created_at: ago(44) },
          { id: uid(), user_id: 'demo-3', shift_date: iso(addDays(t, -5)), slot: 2, mood: 'hjelp', note: 'En ungdom var dårlig. Vi ringte 113 og ventet til ambulansen kom.', created_at: ago(115) }
        ],
        events: [
          { id: 'ev1', created_by: 'demo-2', title: 'Refleksvandring for hele familien', event_date: iso(addDays(t, 2)), event_time: '17:00', place: 'Torget', description: 'Vi går en runde i nabolaget med refleks og lykter. Kakao til barna etterpå.' },
          { id: 'ev2', created_by: 'demo-0', title: 'Foreldremøte: Trygg jul', event_date: iso(addDays(t, 7)), event_time: '19:00', place: 'Aktivitetshuset', description: 'Vi planlegger vakter i juleferien og deler erfaringer fra høsten.' },
          { id: 'ev3', created_by: 'demo-1', title: 'Natteravnkurs for nye', event_date: iso(addDays(t, 9)), event_time: '12:00', place: 'Biblioteket', description: 'Kort innføring i hvordan en vakt går, og hva du gjør hvis noe skjer.' }
        ],
        attendees: [['ev1', 'demo-0'], ['ev1', 'demo-3'], ['ev1', 'demo-4'], ['ev2', 'demo-1'], ['ev3', 'demo-5']].map(([e, u]) => ({ event_id: e, user_id: u })),
        messages: [
          { id: uid(), sender_id: 'demo-0', recipient_id: null, body: 'Hei alle sammen! Fint at så mange har lastet ned Safetly. Husk refleksvest på vakt nå som det er mørkt.', created_at: ago(50) },
          { id: uid(), sender_id: 'demo-0', recipient_id: null, body: 'Fredag er det skoleball. Vi trenger tre voksne på begge vaktene, så book gjerne en ekstra.', created_at: ago(6) }
        ],
        reads: {}
      };
    }
    const me = () => db.users.find((u) => u.id === db.session);
    const need = () => { const m = me(); if (!m) throw new Error('Du er ikke logget inn'); return m; };
    const coord = () => { const m = need(); if (m.role !== 'koordinator') throw new Error('Bare koordinatorer kan gjøre dette'); return m; };
    const user = () => { const m = me(); return m ? { id: m.id, email: m.email } : null; };
    const emit = (ev) => listeners.forEach((cb) => cb(user(), ev));
    let readCbs = [];
    // Demo: late som om andre leser meldingene dine etter noen sekunder.
    function fakeRead(readers, thread) {
      setTimeout(() => {
        db.reads = db.reads || {};
        readers.forEach((u) => { (db.reads[u] = db.reads[u] || {})[thread] = new Date().toISOString(); });
        save();
        readers.forEach((u) => readCbs.forEach((cb) => cb({ user_id: u, thread, last_read_at: db.reads[u][thread] })));
      }, 3500);
    }
    return {
      mode: 'demo',
      async getUser() { return user(); },
      onAuth(cb) { listeners.push(cb); },
      async signUp({ email, password, name, phone }) {
        email = email.trim().toLowerCase();
        if (db.users.some((u) => u.email === email)) throw new Error('User already registered');
        if (password.length < 6) throw new Error('Password should be at least 6 characters');
        const first = !db.users.some((u) => !u.seed);
        const u = { id: uid(), email, password, full_name: name, phone, role: first ? 'koordinator' : 'forelder', is_admin: first, team_id: (db.teams || []).length === 1 ? db.teams[0].id : null, created_at: new Date().toISOString() };
        db.users.push(u); db.session = u.id;
        (db.messages = db.messages || []).push({ id: uid(), sender_id: 'demo-0', recipient_id: u.id, body: `Hei ${name.split(' ')[0] || ''}, og velkommen! Si fra hvis du lurer på noe om vaktene.`.replace(' ,', ','), created_at: new Date().toISOString() });
        save(); emit('SIGNED_IN');
        return { needsConfirm: false };
      },
      async signIn(email, password) {
        const u = db.users.find((x) => x.email && x.email === email.trim().toLowerCase() && x.password === password);
        if (!u) throw new Error('Invalid login credentials');
        db.session = u.id; save(); emit('SIGNED_IN');
      },
      async resetPassword() { throw new Error('I demomodus finnes ingen e-post. Opprett en ny konto i stedet.'); },
      async updatePassword(p) { need().password = p; save(); },
      async signOut() { db.session = null; save(); emit('SIGNED_OUT'); },
      async profiles() { return db.users.map((u) => ({ id: u.id, full_name: u.full_name, role: u.role, created_at: u.created_at, team_id: u.team_id || null, is_admin: !!u.is_admin })); },
      async teams() { need(); return (db.teams || []).slice(); },
      async updateTeam(id, v) {
        const m = need(); const t = db.teams.find((x) => x.id === id);
        if (!t || !(m.is_admin || (m.role === 'koordinator' && m.team_id === id))) throw new Error('Ingen tilgang');
        Object.assign(t, v); save();
      },
      async createTeam(name) { const m = need(); if (!m.is_admin) throw new Error('Bare administrator kan lage lag'); const t = { id: uid(), name, meeting_name: '', meeting_address: '', meeting_note: '', map: null, shifts: null, created_at: new Date().toISOString() }; db.teams.push(t); save(); return { id: t.id }; },
      async setTeam(userId, teamId) {
        const m = need(); const u = db.users.find((x) => x.id === userId); if (!u) return;
        if (u.id !== m.id && !m.is_admin && !(m.role === 'koordinator' && m.team_id === u.team_id)) throw new Error('Ingen tilgang');
        if (u.team_id !== teamId && u.role === 'koordinator' && !u.is_admin && !(m.is_admin && u.id !== m.id)) u.role = 'forelder';
        u.team_id = teamId; save();
      },
      async phones() { const m = need(); return db.users.filter((u) => u.id === m.id || m.is_admin || (m.role === 'koordinator' && u.team_id === m.team_id)).map((u) => ({ user_id: u.id, phone: u.phone || '' })); },
      async contacts() { const m = need(); return db.users.filter((u) => u.is_admin || (u.role === 'koordinator' && u.team_id === m.team_id)).map((u) => ({ full_name: u.full_name, phone: u.phone || '' })); },
      async messages() { const m = need(); return (db.messages || []).filter((x) => !x.recipient_id || x.sender_id === m.id || x.recipient_id === m.id).sort((a, b) => a.created_at.localeCompare(b.created_at)); },
      async sendMessage(recipientId, body) {
        const m = need();
        if (!recipientId && m.role !== 'koordinator') throw new Error('Bare koordinatorer kan skrive til alle');
        const msg = { id: uid(), sender_id: m.id, recipient_id: recipientId, body, created_at: new Date().toISOString() };
        (db.messages = db.messages || []).push(msg); save();
        const peer = recipientId && db.users.find((u) => u.id === recipientId);
        if (peer && peer.seed) fakeRead([peer.id], m.id);
        if (!recipientId) fakeRead(db.users.filter((u) => u.seed).slice(0, 4).map((u) => u.id), 'alle');
        return msg;
      },
      async reads() { const m = need(); const r = (db.reads || {})[m.id] || {}; return Object.keys(r).map((t) => ({ thread: t, last_read_at: r[t] })); },
      async markRead(thread) { const m = need(); db.reads = db.reads || {}; (db.reads[m.id] = db.reads[m.id] || {})[thread] = new Date().toISOString(); save(); },
      onMessage() { return () => {}; },
      pushReady: false,
      async pushKey() { throw new Error('Varsler virker når appen er koblet til nabolagets database.'); },
      async notify() { return null; },
      async savePush() {}, async removePush() {},
      async myNotify() { return need().notify || null; },
      async updateNotify(v) { need().notify = v; save(); },
      async peerReads() { const m = need(); const r = db.reads || {}; return Object.keys(r).filter((u) => u !== m.id && r[u][m.id]).map((u) => ({ user_id: u, last_read_at: r[u][m.id] })); },
      async alleReadTimes() { const m = need(); if (m.role !== 'koordinator') return []; const r = db.reads || {}; return Object.keys(r).filter((u) => u !== m.id && r[u].alle).map((u) => r[u].alle); },
      onRead(cb) { readCbs.push(cb); return () => { readCbs = readCbs.filter((x) => x !== cb); }; },
      async bookings(from, to) { need(); return db.bookings.filter((b) => b.shift_date >= from && b.shift_date <= to); },
      async myBookings() { const m = need(); return db.bookings.filter((b) => b.user_id === m.id); },
      async book(rows) {
        const m = need(); const min = iso(addDays(today(), -1));
        rows.forEach((r) => {
          if (r.user_id !== m.id) throw new Error('Du kan bare booke deg selv');
          if (r.shift_date < min) throw new Error('Vakten er passert');
          if (!db.bookings.some((b) => b.user_id === r.user_id && b.shift_date === r.shift_date && b.slot === r.slot)) db.bookings.push(Object.assign({ id: uid(), team_id: m.team_id }, r));
        });
        save();
      },
      async unbook(id) {
        const m = need(); const b = db.bookings.find((x) => x.id === id);
        if (!b) return;
        if (b.user_id !== m.id && !m.is_admin && !(m.role === 'koordinator' && m.team_id === b.team_id)) throw new Error('Ingen tilgang');
        db.bookings = db.bookings.filter((x) => x.id !== id); save();
      },
      async news() { need(); return db.news.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)); },
      async addNews(n) {
        const m = coord(); const id = uid();
        const team = n.team_id !== undefined ? n.team_id : (m.is_admin ? null : m.team_id);
        if (team === null && !m.is_admin) throw new Error('Bare administrator kan skrive til alle lag');
        db.news.push({ id, author_id: m.id, team_id: team, title: n.title, body: n.body, created_at: new Date().toISOString() }); save(); return { id };
      },
      async deleteNews(id) { coord(); db.news = db.news.filter((x) => x.id !== id); save(); },
      async reports() { need(); return db.reports.slice().sort((a, b) => (b.shift_date + b.slot).localeCompare(a.shift_date + a.slot)); },
      async myReports() { const m = need(); return db.reports.filter((r) => r.user_id === m.id); },
      async addReport(r) {
        const m = need();
        if (!db.bookings.some((b) => b.user_id === m.id && b.shift_date === r.shift_date && b.slot === r.slot)) throw new Error('Du var ikke booket på denne vakten');
        if (db.reports.some((x) => x.user_id === m.id && x.shift_date === r.shift_date && x.slot === r.slot)) throw new Error('Du har allerede skrevet rapport for denne vakten');
        db.reports.push(Object.assign({ id: uid(), user_id: m.id, created_at: new Date().toISOString() }, r)); save();
      },
      async events(from) { need(); return db.events.filter((e) => e.event_date >= from).sort((a, b) => (a.event_date + a.event_time).localeCompare(b.event_date + b.event_time)); },
      async addEvent(e) { const m = need(); db.events.push(Object.assign({ id: uid(), created_by: m.id }, e)); save(); },
      async deleteEvent(id) {
        const m = need(); const e = db.events.find((x) => x.id === id);
        if (e && e.created_by !== m.id && m.role !== 'koordinator') throw new Error('Ingen tilgang');
        db.events = db.events.filter((x) => x.id !== id); db.attendees = db.attendees.filter((a) => a.event_id !== id); save();
      },
      async attendees() { need(); return db.attendees.slice(); },
      async attend(eventId) { const m = need(); if (!db.attendees.some((a) => a.event_id === eventId && a.user_id === m.id)) db.attendees.push({ event_id: eventId, user_id: m.id }); save(); },
      async unattend(eventId) { const m = need(); db.attendees = db.attendees.filter((a) => !(a.event_id === eventId && a.user_id === m.id)); save(); },
      async updateName(name) { need().full_name = name; save(); },
      async updatePhone(phone) { need().phone = phone; save(); },
      async settings() { need(); return db.settings || null; },
      async updateSettings(v) { coord(); db.settings = Object.assign({}, db.settings, v); save(); },
      async setRole(id, role) {
        const m = coord(); const u = db.users.find((x) => x.id === id);
        if (!u) return;
        if (!m.is_admin && u.team_id !== m.team_id) throw new Error('Bare koordinator i laget kan endre roller');
        u.role = role; save();
      }
    };
  }

  const api = (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) ? supabaseApi() : localApi();

  // ------------------------------------------------------------------ tilstand
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('safetly-prefs')) || {}; } catch (e) { return {}; } })();
  const S = {
    ready: false, user: null, me: null, loaded: false, loadError: null, recovery: false,
    authMode: 'login', resetSent: false, confirmSent: false,
    profiles: {}, phones: {}, contacts: [], bookings: [], myBookings: [], news: [], reports: [], myReports: [], events: [], attendees: [],
    range: null,
    weekStart: weekStart(today()), selDay: iso(today()), repeat: false,
    cal: { y: today().getFullYear(), m: today().getMonth() }, calSel: iso(today()),
    eventForm: false, newsForm: false, meetingForm: false, shiftDraft: null, settings: null, mapEdit: false, mapDraft: null, mapAdd: false, mapDraw: false, mapView: null, kontorWeek: weekStart(today()),
    theme: prefs.theme || 'auto', big: !!prefs.big,
    busy: false, lastRoute: null, backRoute: '#/vakter',
    messages: [], reads: {}, chatBottom: false, pushOn: false, pushPerm: 'default', notify: null, peerReads: {}, alleReads: []
  };
  function savePrefs() { try { localStorage.setItem('safetly-prefs', JSON.stringify({ theme: S.theme, big: S.big })); } catch (e) { /* tom */ } }
  function applyPrefs() {
    const root = document.documentElement;
    root.dataset.theme = S.theme;
    root.classList.toggle('big', S.big);
  }

  // ---- lag og roller
  const hasTeams = () => Array.isArray(S.teams) && S.teams.length > 0;
  const teamById = (id) => (S.teams || []).find((t) => t.id === id) || null;
  const myTeamId = () => (S.me && S.me.team_id) || null;
  function curTeam() { return teamById(S.viewTeam) || teamById(myTeamId()) || (S.teams || [])[0] || null; }
  const curTeamId = () => (curTeam() || {}).id || null;
  const isFirstTeam = (t) => !!t && !!S.teams && S.teams[0] && S.teams[0].id === t.id;
  const isAdmin = () => !!(S.me && S.me.is_admin);
  const isCoordOf = (tid) => isAdmin() || !!(S.me && S.me.role === 'koordinator' && (!hasTeams() || S.me.team_id === tid));
  // Koordinator for laget som vises nå (vaktliste, kart, vakttider, kontor)
  const isCoord = () => isCoordOf(curTeamId());
  // Koordinator i et hvilket som helst lag (meldinger «Til alle», arrangementer)
  const isAnyCoord = () => !!(S.me && (S.me.role === 'koordinator' || S.me.is_admin));
  const inMyTeam = () => !hasTeams() || curTeamId() === myTeamId();
  // Innstillingene (oppmøte, kart, vakttider) kommer fra laget som vises.
  function syncTeamSettings() { const t = curTeam(); if (t) S.settings = t; }
  const bookingInView = (b) => !hasTeams() || (b.team_id ? b.team_id === curTeamId() : isFirstTeam(curTeam()));
  function meeting() {
    const st = S.settings; const cf = CFG.meetingPlace || {};
    if (st && (st.meeting_name || st.meeting_address || st.meeting_note)) return { name: st.meeting_name, address: st.meeting_address, note: st.meeting_note };
    return { name: cf.name || '', address: cf.address || '', note: cf.note || '' };
  }
  const nameOf = (id) => (id === (S.user && S.user.id) ? 'Deg' : shortName((S.profiles[id] || {}).full_name));
  function shiftPeople(date, slot) { return S.bookings.filter((b) => b.shift_date === date && b.slot === slot && bookingInView(b)); }
  function myBooking(date, slot) { return S.bookings.find((b) => b.shift_date === date && b.slot === slot && b.user_id === S.user.id && bookingInView(b)); }
  function covered(date) { const ids = slotsOn(date); return ids.length > 0 && ids.every((s) => shiftPeople(date, s).length >= MIN_PER_SHIFT); }
  // 'none' = ingen vakt denne dagen, 'ok' = alle vakter dekket, 'warn' = trenger flere
  function dayStatus(date) { return !slotsOn(date).length ? 'none' : covered(date) ? 'ok' : 'warn'; }
  const STATUS_TEXT = { none: 'ingen vakt', ok: 'dekket', warn: 'trenger flere' };

  async function saveTeamSettings(v) {
    if (hasTeams()) {
      await api.updateTeam(curTeamId(), v);
      S.teams = await api.teams(); syncTeamSettings();
      return S.settings;
    }
    await api.updateSettings(v);
    return api.settings();
  }
  async function reloadTeamsAndProfiles() {
    const [teams, profiles, phones, contacts] = await Promise.all([api.teams().catch(() => null), api.profiles(), api.phones(), api.contacts()]);
    S.teams = teams;
    S.profiles = {}; profiles.forEach((x) => { S.profiles[x.id] = x; }); S.me = S.profiles[S.user.id];
    S.phones = {}; phones.forEach((x) => { S.phones[x.user_id] = x.phone; }); S.contacts = contacts;
    if (!teamById(S.viewTeam)) S.viewTeam = myTeamId();
    if (hasTeams()) syncTeamSettings();
  }

  function teamSwitcher() {
    if (!hasTeams() || S.teams.length < 2) return '';
    return `<label class="team-switch"><span>Lag</span><select id="team-view" data-change="team-view" aria-label="Vis lag">${S.teams.map((t) => `<option value="${t.id}"${t.id === curTeamId() ? ' selected' : ''}>${esc(t.name)}${t.id === myTeamId() ? ' (mitt lag)' : ''}</option>`).join('')}</select></label>`;
  }
  function otherTeamNote() {
    if (inMyTeam()) return '';
    const mine = teamById(myTeamId());
    return `<p class="card yellow tight small" role="note">Du ser vaktlisten til <b>${esc((curTeam() || {}).name)}</b>. Du booker vakter i ditt eget lag${mine ? `, <b>${esc(mine.name)}</b>` : ''}.</p>`;
  }
  function viewChooseTeam() {
    return `<div class="wrap">${header()}<main id="innhold" tabindex="-1">
      <div class="page-head"><h1 tabindex="-1">Velg ditt lag</h1><p class="muted">Hvert nabolag har sitt eget lag med egen vaktliste, eget kart og egne koordinatorer. Du kan bytte senere under Info.</p></div>
      <ul class="chat-list">${S.teams.map((t) => {
        const n = Object.values(S.profiles).filter((p) => p.team_id === t.id).length;
        return `<li><button type="button" class="chat-row team-pick" data-act="choose-team" data-id="${t.id}"><span class="chat-av" aria-hidden="true">${I.people()}</span>
          <span class="grow stack-s" style="gap:.125rem;text-align:left"><b>${esc(t.name)}</b><span class="preview">${n} ${n === 1 ? 'forelder' : 'foreldre'}${t.meeting_name ? ' · oppmøte ' + esc(t.meeting_name) : ''}</span></span>${I.right()}</button></li>`;
      }).join('')}</ul></main></div>`;
  }

  // ------------------------------------------------------------------ lasting av data
  async function loadAll() {
    const t = today();
    const from = iso(addDays(t, -21)); const to = iso(addDays(t, 70));
    if (!S.range) S.range = { from, to };
    else { if (from < S.range.from) S.range.from = from; if (to > S.range.to) S.range.to = to; }
    const [profiles, phones, contacts, bookings, mine, news, reports, myReports, events, attendees] = await Promise.all([
      api.profiles(), api.phones(), api.contacts(), api.bookings(S.range.from, S.range.to), api.myBookings(),
      api.news(), api.reports(), api.myReports(), api.events(iso(addDays(t, -60))), api.attendees()
    ]);
    S.profiles = {}; profiles.forEach((p) => { S.profiles[p.id] = p; });
    S.phones = {}; phones.forEach((p) => { S.phones[p.user_id] = p.phone; });
    S.teams = await api.teams().catch(() => null);
    if (hasTeams()) syncTeamSettings();
    else { try { S.settings = await api.settings(); } catch (e) { S.settings = null; } } // før lag.sql / settings-tabellen
    S.contacts = contacts || []; S.bookings = bookings; S.myBookings = mine; S.news = news; S.reports = reports;
    S.myReports = myReports; S.events = events; S.attendees = attendees;
    try {
      const [msgs, reads] = await Promise.all([api.messages(), api.reads()]);
      S.messages = msgs; S.reads = {}; reads.forEach((r) => { S.reads[r.thread] = r.last_read_at; });
      await loadReceipts();
    } catch (e) { S.messages = []; S.reads = {}; } // før meldingstabellene finnes
    S.me = S.profiles[S.user.id] || null;
    if (S.me && !teamById(S.viewTeam)) S.viewTeam = myTeamId();
    if (hasTeams()) syncTeamSettings();
    S.loaded = true; S.loadError = S.me ? null : 'Fant ikke profilen din. Kjør supabase/schema.sql og prøv igjen.';
  }
  async function reloadBookings() {
    const [bookings, mine] = await Promise.all([api.bookings(S.range.from, S.range.to), api.myBookings()]);
    S.bookings = bookings; S.myBookings = mine;
  }
  async function ensureRange(from, to) {
    if (from >= S.range.from && to <= S.range.to) return;
    if (from < S.range.from) S.range.from = from;
    if (to > S.range.to) S.range.to = to;
    await reloadBookings();
  }

  // ------------------------------------------------------------------ meldinger
  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast' + (isError ? ' error' : ''); }, isError ? 6000 : 3500);
  }
  function errText(e) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    const map = [
      [/Invalid login credentials/i, 'Feil e-post eller passord.'],
      [/already registered|already exists/i, 'Det finnes allerede en konto med denne e-posten.'],
      [/at least 6 characters|Password should/i, 'Passordet må ha minst 6 tegn.'],
      [/Email not confirmed/i, 'Bekreft e-posten din først. Sjekk innboksen.'],
      [/rate limit|too many/i, 'For mange forsøk. Vent litt og prøv igjen.'],
      [/Failed to fetch|NetworkError|network/i, 'Fikk ikke kontakt med serveren. Sjekk nettet.'],
      [/row-level security|permission denied|violates/i, 'Du har ikke tilgang til å gjøre dette.'],
      [/duplicate key/i, 'Dette er allerede registrert.'],
      [/schema cache|PGRST205|does not exist/i, 'Denne delen av appen er ikke satt opp i databasen ennå. Si fra til en koordinator.']
    ];
    for (const [re, txt] of map) if (re.test(m)) return txt;
    return m || 'Noe gikk galt. Prøv igjen.';
  }
  async function run(fn, okMsg) {
    if (S.busy) return;
    S.busy = true;
    try { await fn(); if (okMsg) toast(okMsg); } catch (e) { console.error(e); toast(errText(e), true); } finally { S.busy = false; render(); }
  }

  // ------------------------------------------------------------------ ruting
  const NAV = [
    ['vakter', 'Vakter', I.shield], ['kalender', 'Kalender', I.cal], ['nyheter', 'Nyheter', I.news],
    ['arrangement', 'Arrangem.', I.people, 'Arrangement'], ['info', 'Info', I.info]
  ];
  const TITLES = { kart: 'Vaktområde', chat: 'Meldinger', vakter: 'Vakter', kalender: 'Kalender', nyheter: 'Ukas nyheter', arrangement: 'Arrangement', info: 'Info', kontor: 'Kontor', nodhjelp: 'Nødhjelp' };
  function routeParam() { return location.hash.replace(/^#\/?/, '').split('/')[1] || ''; }
  function routeKey() { const r = route(); return r === 'chat' ? 'chat/' + routeParam() : r; }
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const name = h.split('/')[0];
    return TITLES[name] ? name : 'vakter';
  }

  // ------------------------------------------------------------------ felles byggeklosser
  function header() {
    const n = unreadTotal();
    const inChat = route() === 'chat';
    return `<header class="top">
      <a class="brand" href="#/vakter" aria-label="Safetly, til Vakter"><span class="logo">${I.moon()}</span><span class="brand-name" aria-hidden="true">Safetly</span></a>
      <div class="row" style="gap:.5rem">
        <a class="icon-btn chat-btn" href="#/chat"${inChat ? ' aria-current="page"' : ''} aria-label="Meldinger${n ? `, ${n} ulest${n === 1 ? '' : 'e'}` : ''}">${I.chat()}${n ? `<span class="count" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</a>
        <a class="sos" href="#/nodhjelp">${I.phone()}Nødhjelp</a>
      </div>
    </header>${api.mode === 'demo' ? '<p class="demo-banner">Demomodus: data lagres bare på denne enheten. Legg inn Supabase-nøkler i config.js for å dele med nabolaget.</p>' : ''}`;
  }
  function nav(current) {
    const active = (current === 'kontor' || current === 'kart') ? 'info' : current;
    return `<nav class="nav" aria-label="Hovedmeny">${NAV.map(([id, label, icon, full]) =>
      `<a href="#/${id}"${id === active ? ' aria-current="page"' : ''}${full ? ` aria-label="${full}"` : ''}>${icon()}<span>${label}</span></a>`).join('')}</nav>`;
  }
  function personChips(list, opts) {
    if (!list.length) return '<li class="small muted">Ingen påmeldt ennå</li>';
    return list.map((b) => {
      const n = nameOf(b.user_id);
      const rm = opts && opts.removable && b.user_id !== S.user.id
        ? `<button type="button" class="icon-btn plain" data-act="remove-booking" data-id="${b.id}" aria-label="Fjern ${esc(n)} fra vakten">${I.x()}</button>` : '';
      return `<li class="person${rm ? ' removable' : ''}"><span class="avatar" aria-hidden="true">${esc(n === 'Deg' ? 'DU' : initials((S.profiles[b.user_id] || {}).full_name))}</span>${esc(n)}${rm}</li>`;
    }).join('');
  }
  function statusBadge(n) {
    return n >= MIN_PER_SHIFT ? '<span class="badge ok">● Dekket</span>' : `<span class="badge warn">◆ Trenger ${MIN_PER_SHIFT - n} til</span>`;
  }
  function bookButtons(date, slot, small) {
    const now = new Date();
    const mine = myBooking(date, slot);
    const sm = small ? ' sm' : '';
    const label = shiftLabel(date, slot);
    if (shiftEnd(date, slot) <= now) return '<p class="small"><b>Gjennomført</b></p>';
    if (!inMyTeam()) return '';
    if (mine) return `<button type="button" id="b-${date}-${slot}" class="pill ghost${sm} self-start" data-act="unbook" data-id="${mine.id}" data-label="${esc(label)}" aria-label="Avbook ${esc(label)}">Avbook</button>`;
    if (shiftStart(date, slot) <= now) return '<p class="small"><b>Pågår nå</b></p>';
    return `<button type="button" id="b-${date}-${slot}" class="pill${sm} self-start" data-act="book" data-date="${date}" data-slot="${slot}" aria-label="Book meg på ${esc(label)}">Book meg</button>`;
  }

  // ------------------------------------------------------------------ Vakter
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 17 ? 'God dag' : 'God kveld';
  }
  function nextShift() {
    const now = new Date();
    return S.myBookings.filter((b) => shiftEnd(b.shift_date, b.slot) > now)
      .sort((a, b) => shiftStart(a.shift_date, a.slot) - shiftStart(b.shift_date, b.slot))[0];
  }
  function pendingReports() {
    const now = new Date(); const limit = new Date(Date.now() - 14 * 86400000);
    const done = new Set(S.myReports.map((r) => r.shift_date + '|' + r.slot));
    return S.myBookings.filter((b) => { const s = shiftStart(b.shift_date, b.slot); return s <= now && s > limit && !done.has(b.shift_date + '|' + b.slot); })
      .sort((a, b) => shiftStart(b.shift_date, b.slot) - shiftStart(a.shift_date, a.slot));
  }
  function needsPeople(days) {
    const now = new Date(); const out = [];
    for (let i = 0; i < days; i++) {
      const date = iso(addDays(today(), i));
      slotsOn(date).forEach((slot) => { if (shiftEnd(date, slot) > now && shiftPeople(date, slot).length < MIN_PER_SHIFT) out.push({ date, slot }); });
    }
    return out;
  }
  function viewVakter() {
    const ws = S.weekStart; const days = [...Array(7)].map((_, i) => iso(addDays(ws, i)));
    if (!days.includes(S.selDay)) S.selDay = days.includes(iso(today())) ? iso(today()) : days[0];
    const t = iso(today());
    const first = (S.me.full_name || '').split(' ')[0];
    const next = nextShift();
    const need = needsPeople(7);
    const pending = pendingReports();
    const weekEnd = addDays(ws, 6);
    let html = `<div class="page-head"><h1 tabindex="-1">${greeting()}${first ? ', ' + esc(first) : ''}</h1>
      <p class="muted">Uke ${isoWeek(ws)} · ${ws.getDate()}.${ws.getMonth() !== weekEnd.getMonth() ? ' ' + MONTHS[ws.getMonth()] : ''}–${weekEnd.getDate()}. ${MONTHS[weekEnd.getMonth()]}</p></div>`;
    html += teamSwitcher() + otherTeamNote();

    if (next && inMyTeam()) {
      const partners = shiftPeople(next.shift_date, next.slot).filter((b) => b.user_id !== S.user.id).map((b) => nameOf(b.user_id));
      const isToday = next.shift_date === t;
      html += `<section class="card blue" aria-labelledby="neste">
        <h2 id="neste" class="eyebrow">Din neste vakt</h2>
        <div class="stack-s"><p class="big-num">${slotInfo(next.slot).start}–${slotInfo(next.slot).end}</p><p style="font-weight:600;font-size:1.0625rem">${isToday ? 'I kveld · ' : ''}${cap(fmtDay(next.shift_date))}</p></div>
        <p class="muted">${partners.length ? `Du går sammen med <b style="color:var(--ink)">${esc(partners.join(' og '))}</b>` : '<b style="color:var(--ink)">Ingen andre er påmeldt ennå.</b>'} · Oppmøte: ${esc(meeting().name || 'se Info')}</p>
        <div class="wrap-row"><a class="pill sm" href="#/info">Slik går en vakt</a><button type="button" class="pill ghost sm" data-act="unbook" data-id="${next.id}" data-label="${esc(shiftLabel(next.shift_date, next.slot))}">Avbook</button>
        <a class="pill ghost sm" href="#/kart">${I.map(18)}Kart</a>
        ${shiftPeople(next.shift_date, next.slot).filter((b) => b.user_id !== S.user.id).map((b) => `<a class="pill ghost sm" href="#/chat/${b.user_id}">${I.chat(18)}Skriv til ${esc(shortName((S.profiles[b.user_id] || {}).full_name).split(' ')[0])}</a>`).join('')}</div>
      </section>`;
    }
    if (pending.length && inMyTeam()) {
      const p = pending[0];
      html += `<section class="card pink tight" aria-labelledby="rapp"><h2 id="rapp" style="font-size:1.0625rem">Hvordan gikk vakta ${esc(fmtShort(p.shift_date))}?</h2>
        <p class="small muted">Skriv en kort vaktrapport, uten navn på barn.</p><a class="pill sm self-start" href="#/nyheter">${I.pen()}Skriv vaktrapport</a></section>`;
    }
    if (need.length) {
      html += `<section class="card yellow tight" aria-labelledby="trenger">
        <div class="row" style="align-items:flex-start;gap:.875rem"><span class="logo" style="border-radius:999px;color:var(--yellow)">${I.bell()}</span>
        <div class="stack-s grow"><h2 id="trenger" style="font-size:1.0625rem">${need.length} ${need.length === 1 ? 'vakt trenger' : 'vakter trenger'} flere voksne</h2>
        <p class="small muted">Neste 7 dager. Første: ${esc(shiftLabel(need[0].date, need[0].slot))}.</p>
        <button type="button" class="pill sm self-start" data-act="goto-need" data-date="${need[0].date}">Vis første ledige</button></div></div></section>`;
    }

    html += `<section class="stack" aria-labelledby="ukestatus">
      <div class="between"><h2 id="ukestatus">Ukestatus</h2>
        <div class="week-nav"><button type="button" class="icon-btn" data-act="week" data-dir="-1" aria-label="Forrige uke">${I.left()}</button>
        <button type="button" class="icon-btn" data-act="week" data-dir="0" aria-label="Denne uka" style="width:auto;padding:0 .875rem;font-weight:600;font-size:.875rem">I dag</button>
        <button type="button" class="icon-btn" data-act="week" data-dir="1" aria-label="Neste uke">${I.right()}</button></div></div>
      <div class="days">${days.map((d, i) => {
        const st = dayStatus(d); const dd = parseIso(d);
        return `<button type="button" id="day-${d}" class="day${d === t ? ' today' : ''}${st === 'none' ? ' off' : ''}" data-act="sel-day" data-date="${d}" aria-pressed="${d === S.selDay}"
          aria-label="${cap(fmtDay(d))}: ${STATUS_TEXT[st]}${d === t ? ', i dag' : ''}"><span>${DAYS_SHORT[i]}</span><span class="num">${dd.getDate()}</span><span class="mark ${st}"></span></button>`;
      }).join('')}</div>
      <ul class="legend" aria-hidden="true"><li><span class="mark ok"></span>Dekket</li><li><span class="mark warn"></span>Trenger flere</li><li>Minst ${MIN_PER_SHIFT} voksne per vakt</li></ul>
    </section>`;

    const d = S.selDay;
    html += `<section class="stack" aria-labelledby="dagtittel"><h2 id="dagtittel">${cap(fmtDay(d))}${d === t ? ' · i dag' : ''}</h2><div class="timeline">`;
    if (!slotsOn(d).length) html += `<p class="empty">Det er ingen vakter på ${DAYS[dow(parseIso(d))]}er.</p>`;
    slotsOn(d).forEach((slot) => {
      const list = shiftPeople(d, slot);
      html += `<div class="tl-item"><div class="tl-time" aria-hidden="true"><b>${slotInfo(slot).start}</b><span class="tl-line"></span><span>${slotInfo(slot).end}</span></div>
        <article class="card ${SLOT_COLORS[slot - 1]}" style="padding:1.125rem;border-radius:1.75rem" aria-label="${slotInfo(slot).name} ${slotInfo(slot).start} til ${slotInfo(slot).end}">
          <div class="between"><h3>${slotInfo(slot).name}</h3>${statusBadge(list.length)}</div>
          <p class="small muted">Går sammen (${list.length} av minst ${MIN_PER_SHIFT})</p>
          <ul class="people">${personChips(list)}</ul>
          ${bookButtons(d, slot)}
        </article></div>`;
    });
    html += `</div><label class="check-row"><input type="checkbox" id="repeat" data-act="repeat"${S.repeat ? ' checked' : ''}> Gjenta nye bookinger 4 uker frem</label></section>`;
    if (isCoordOf(myTeamId())) html += `<a class="card ink tight" href="#/kontor" style="text-decoration:none;flex-direction:row;align-items:center;justify-content:space-between;min-height:3.5rem"><b>Kontor for koordinatorer</b>${I.right()}</a>`;
    return html;
  }

  // ------------------------------------------------------------------ Kalender
  function viewKalender() {
    const { y, m } = S.cal;
    const first = new Date(y, m, 1); const daysIn = new Date(y, m + 1, 0).getDate();
    const t = iso(today());
    const evByDate = {};
    S.events.forEach((e) => { (evByDate[e.event_date] = evByDate[e.event_date] || []).push(e); });
    let cells = '';
    for (let i = 0; i < dow(first); i++) cells += '<span aria-hidden="true"></span>';
    for (let n = 1; n <= daysIn; n++) {
      const d = iso(new Date(y, m, n));
      const st = dayStatus(d); const ev = evByDate[d];
      const past = d < t;
      cells += `<button type="button" id="c-${d}" class="cell${d === t ? ' today' : ''}${past ? ' past' : ''}" data-act="cal-sel" data-date="${d}" aria-pressed="${d === S.calSel}"
        aria-label="${cap(fmtDay(d))}: ${STATUS_TEXT[st]}${ev ? ', ' + ev.length + ' arrangement' : ''}${d === t ? ', i dag' : ''}">
        <span>${n}</span><span class="dots" aria-hidden="true">${st === 'none' ? '' : `<span class="mark ${st}"></span>`}${ev ? '<span class="mark event"></span>' : ''}</span></button>`;
    }
    const sel = S.calSel;
    let panel = `<section class="stack" aria-labelledby="valgt"><h2 id="valgt">${cap(fmtDay(sel))}${sel === t ? ' · i dag' : ''}</h2>`;
    if (!slotsOn(sel).length) panel += `<p class="empty">Ingen vakter denne dagen.</p>`;
    slotsOn(sel).forEach((slot) => {
      const list = shiftPeople(sel, slot);
      panel += `<div class="card ${SLOT_COLORS[slot - 1]} tight"><div class="between"><p style="font-weight:700;font-size:1.0625rem">${slotInfo(slot).start}–${slotInfo(slot).end}</p>${statusBadge(list.length)}</div>
        <ul class="people">${personChips(list)}</ul>${bookButtons(sel, slot, true)}</div>`;
    });
    (evByDate[sel] || []).forEach((e) => {
      panel += `<div class="card pink tight"><p class="eyebrow">Arrangement</p><p style="font-weight:700;font-size:1.0625rem">${esc(e.title)}</p>
        <p class="small muted">kl. ${esc(fmtTime(e.event_time))} · ${esc(e.place)}</p><a class="pill ghost sm self-start" href="#/arrangement">Se arrangement</a></div>`;
    });
    panel += '</section>';
    return `${teamSwitcher()}<div class="between"><h1 tabindex="-1">${cap(MONTHS[m])} ${y}</h1>
        <div class="week-nav"><button type="button" class="icon-btn" data-act="month" data-dir="-1" aria-label="Forrige måned">${I.left()}</button>
        <button type="button" class="icon-btn" data-act="month" data-dir="1" aria-label="Neste måned">${I.right()}</button></div></div>
      <section class="cal" aria-label="Månedskalender for ${MONTHS[m]} ${y}">
        <div class="cal-head" aria-hidden="true"><span>Ma</span><span>Ti</span><span>On</span><span>To</span><span>Fr</span><span>Lø</span><span>Sø</span></div>
        <div class="cal-grid">${cells}</div>
        <ul class="legend" style="padding:.5rem .375rem 0"><li><span class="mark ok"></span>Dekket</li><li><span class="mark warn"></span>Trenger flere</li><li><span class="mark event"></span>Arrangement</li></ul>
      </section>${panel}`;
  }

  // ------------------------------------------------------------------ Nyheter og vaktrapporter
  function moodBadge(m) { const x = MOODS[m] || MOODS.rolig; return `<span class="badge ${x.cls}">${x.mark} ${x.label}</span>`; }
  function viewNyheter() {
    const pending = pendingReports();
    let html = '<div class="page-head"><h1 tabindex="-1">Ukas nyheter</h1><p class="muted">Fra koordinatorene og vaktlagene</p></div>';
    if (pending.length) {
      html += `<form class="card pink" data-form="report" aria-labelledby="rapport">
        <div class="stack-s"><h2 id="rapport">Hvordan gikk vakta?</h2></div>
        ${pending.length > 1
          ? `<label class="field">Vakt<select id="r-shift" name="shift">${pending.map((p) => `<option value="${p.shift_date}|${p.slot}">${esc(shiftLabel(p.shift_date, p.slot))}</option>`).join('')}</select></label>`
          : `<p class="muted">${esc(shiftLabel(pending[0].shift_date, pending[0].slot))}</p><input type="hidden" name="shift" value="${pending[0].shift_date}|${pending[0].slot}">`}
        <fieldset><legend>Velg det som passer best</legend>
          ${Object.keys(MOODS).map((k, i) => `<label class="opt"><input type="radio" id="r-mood-${k}" name="mood" value="${k}"${i === 0 ? ' checked' : ''}><span class="ring" aria-hidden="true"></span>${MOODS[k].label}</label>`).join('')}
        </fieldset>
        <label class="field" for="r-note">Kort notat<span class="hint" id="r-hint">Ikke skriv navn på barn eller ungdom. <span data-count="r-note">0</span>/280 tegn.</span>
          <textarea id="r-note" name="note" maxlength="280" aria-describedby="r-hint" data-counter placeholder="F.eks. stille ved skolen, noen ungdommer på Torget, alt fint."></textarea></label>
        <button type="submit" class="pill self-start">Send rapport</button>
      </form>`;
    }
    html += '<section class="stack" aria-labelledby="nytt"><div class="between"><h2 id="nytt">Fra koordinatorene</h2>';
    const canPost = isCoordOf(myTeamId());
    if (canPost) html += `<button type="button" class="pill sm" data-act="toggle-news" aria-expanded="${S.newsForm}" aria-label="Skriv ny nyhet">${I.plus()}Ny</button>`;
    html += '</div>';
    if (canPost && S.newsForm) {
      const targets = !hasTeams() ? [] : isAdmin() ? [['', 'Alle lag']].concat(S.teams.map((t) => [t.id, t.name])) : [];
      html += `<form class="card" data-form="news" aria-label="Ny nyhet">
        ${targets.length ? `<label class="field">Til<select id="n-team" name="team">${targets.map(([v, l]) => `<option value="${v}"${v === (myTeamId() || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
          : hasTeams() ? `<p class="small muted">Til: ${esc((teamById(myTeamId()) || {}).name || 'ditt lag')}</p>` : ''}
        <label class="field">Tittel<input id="n-title" name="title" required maxlength="120"></label>
        <label class="field">Tekst<textarea id="n-body" name="body" required maxlength="2000" rows="4"></textarea></label>
        <div class="wrap-row"><button type="submit" class="pill">Legg ut</button><button type="button" class="pill ghost" data-act="toggle-news">Avbryt</button></div></form>`;
    }
    const news = S.news.filter((n) => !hasTeams() || !n.team_id || n.team_id === myTeamId() || isAdmin());
    if (!news.length) html += '<p class="empty">Ingen nyheter ennå.</p>';
    news.forEach((n, i) => {
      const a = S.profiles[n.author_id] || {};
      const to = !hasTeams() ? '' : n.team_id ? (teamById(n.team_id) || {}).name || '' : 'Alle lag';
      const canDel = n.team_id ? isCoordOf(n.team_id) : (hasTeams() ? isAdmin() : isAnyCoord());
      html += `<article class="card ${i % 2 ? 'yellow' : 'blue'}"><p class="small muted"><b style="color:var(--ink)">${esc(a.full_name || 'Koordinator')}</b> · ${esc(fmtStamp(n.created_at))}${to ? ` · <span class="badge soft">${esc(to)}</span>` : ''}</p>
        <h3>${esc(n.title)}</h3><p class="pre">${esc(n.body)}</p>
        ${canDel ? `<button type="button" class="link-btn self-start" data-act="del-news" data-id="${n.id}">Slett nyheten</button>` : ''}</article>`;
    });
    html += '</section><section class="stack" aria-labelledby="rapporter"><h2 id="rapporter">Vaktrapporter</h2>';
    if (!S.reports.length) html += '<p class="empty">Ingen vaktrapporter ennå.</p>';
    S.reports.forEach((r) => {
      html += `<article class="card tight"><div class="between"><p class="small"><b>${esc(cap(fmtShort(r.shift_date)))} · ${slotInfo(r.slot).start}–${slotInfo(r.slot).end}</b></p>${moodBadge(r.mood)}</div>
        ${r.note ? `<p class="pre">${esc(r.note)}</p>` : '<p class="small muted">Ingen notat.</p>'}</article>`;
    });
    return html + '</section>';
  }

  // ------------------------------------------------------------------ Arrangement
  function viewArrangement() {
    const t = iso(today());
    const upcoming = S.events.filter((e) => e.event_date >= t);
    const colors = ['pink', 'blue', 'yellow'];
    let html = `<div class="between" style="align-items:flex-end"><div class="page-head"><h1 tabindex="-1">Arrangement</h1><p class="muted">Alle kan lage noe for nabolaget</p></div>
      ${S.eventForm ? '' : `<button type="button" class="pill sm" data-act="toggle-event" aria-expanded="false" aria-label="Nytt arrangement">${I.plus()}Nytt</button>`}</div>`;
    if (S.eventForm) {
      html += `<form class="card" data-form="event" aria-labelledby="nyttarr"><h2 id="nyttarr">Nytt arrangement</h2>
        <label class="field">Tittel<input id="e-title" name="title" required maxlength="120" placeholder="F.eks. Refleksvandring"></label>
        <div class="grid-2"><label class="field">Dato<input id="e-date" name="date" type="date" required min="${t}"></label>
        <label class="field">Tid${timeInput('e-time', '', 'name="time" required')}</label></div>
        <p class="small muted" id="tid-hjelp">Tid skrives med 24-timersklokke, for eksempel 18:30.</p>
        <label class="field">Sted<input id="e-place" name="place" required maxlength="120" placeholder="F.eks. Torget"></label>
        <label class="field">Beskrivelse<textarea id="e-desc" name="description" maxlength="1000" rows="3"></textarea></label>
        <div class="wrap-row"><button type="submit" class="pill">Opprett</button><button type="button" class="pill ghost" data-act="toggle-event">Avbryt</button></div></form>`;
    }
    if (!upcoming.length) html += '<p class="empty">Ingen kommende arrangementer. Lag det første!</p>';
    upcoming.forEach((e, i) => {
      const d = parseIso(e.event_date);
      const going = S.attendees.filter((a) => a.event_id === e.id);
      const mine = going.some((a) => a.user_id === S.user.id);
      const canDelete = e.created_by === S.user.id || isAnyCoord();
      html += `<article class="card ${colors[i % 3]}" aria-labelledby="ev-${e.id}">
        <div class="row" style="align-items:flex-start;gap:.875rem">
          <div class="date-tile" aria-hidden="true"><span class="dt-s">${DAYS_SHORT[dow(d)]}</span><span class="dt-d">${d.getDate()}</span><span class="dt-m">${MONTHS[d.getMonth()].slice(0, 3)}</span></div>
          <div class="stack-s grow"><h2 id="ev-${e.id}" style="font-size:1.1875rem">${esc(e.title)}</h2>
          <p class="small" style="font-weight:600">${esc(cap(fmtDay(e.event_date)))} kl. ${esc(fmtTime(e.event_time))}</p>
          <p class="small muted">${esc(e.place)} · av ${esc(nameOf(e.created_by))}</p></div></div>
        ${e.description ? `<p class="pre">${esc(e.description)}</p>` : ''}
        <div class="between"><p class="small muted">${going.length} kommer${mine ? ', også du' : ''}</p>
        <button type="button" id="go-${e.id}" class="pill sm${mine ? ' ghost' : ''}" data-act="attend" data-id="${e.id}" aria-pressed="${mine}">${mine ? '✓ Jeg kommer' : 'Jeg kommer'}</button></div>
        ${canDelete ? `<button type="button" class="link-btn self-start" data-act="del-event" data-id="${e.id}">Slett arrangementet</button>` : ''}
      </article>`;
    });
    return html;
  }

  // ------------------------------------------------------------------ Info
  function viewInfo() {
    const mp = meeting();
    const now = new Date();
    const done = S.myBookings.filter((b) => shiftEnd(b.shift_date, b.slot) <= now);
    let html = '<h1 tabindex="-1">Info</h1>';
    if (hasTeams()) {
      const mine = teamById(myTeamId());
      html += `<section class="card ink tight" aria-labelledby="mittlag"><div class="between"><span><span class="small" style="opacity:.8">Mitt lag</span><br><b id="mittlag" style="font-size:1.125rem">${esc(mine ? mine.name : 'Ikke valgt')}</b></span>
        ${S.teams.length > 1 ? `<label class="sr-only" for="my-team">Bytt lag</label><select id="my-team" class="input" style="width:auto;min-height:2.75rem;border-radius:999px;font-weight:600;font-size:.875rem;background:var(--bg)" data-change="my-team">${S.teams.map((t) => `<option value="${t.id}"${t.id === myTeamId() ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}</div></section>`;
    }
    html += `<section class="card blue" aria-labelledby="oppmote"><div class="between"><h2 id="oppmote" class="eyebrow">Oppmøtested</h2>
      ${isCoord() && !S.meetingForm ? '<button type="button" class="pill ghost sm" data-act="toggle-meeting" aria-label="Endre oppmøtested">Endre</button>' : ''}</div>`;
    if (isCoord() && S.meetingForm) {
      html += `<form class="stack" data-form="meeting" aria-label="Endre oppmøtested">
        <label class="field">Sted<input id="m-name" name="mname" required maxlength="120" value="${esc(mp.name)}" placeholder="F.eks. Nærbutikken ved Torget"></label>
        <label class="field">Adresse<input id="m-address" name="maddress" maxlength="200" value="${esc(mp.address)}"></label>
        <label class="field">Beskjed til de som går vakt<textarea id="m-note" name="mnote" maxlength="500" rows="3">${esc(mp.note)}</textarea></label>
        <div class="wrap-row"><button type="submit" class="pill">Lagre</button><button type="button" class="pill ghost" data-act="toggle-meeting">Avbryt</button></div></form>`;
    } else {
      html += `<p style="font-family:Bricolage,sans-serif;font-size:1.375rem;font-weight:700">${esc(mp.name || 'Ikke satt')}</p>
      ${mp.address ? `<p style="font-weight:600">${esc(mp.address)}</p>` : ''}${mp.note ? `<p class="pre">${esc(mp.note)}</p>` : ''}`;
    }
    html += '</section>';
    const md = currentMap();
    html += `<a class="card map-card" href="#/kart"><span class="map-card-icon" aria-hidden="true">${I.map(26)}</span>
      <span class="grow stack-s" style="gap:.125rem"><b style="font-size:1.0625rem">Vaktområde og sjekkpunkter</b>
      <span class="small muted">${md ? `${esc(md.name || 'Kart over området')} · ${(md.checkpoints || []).length} sjekkpunkter` : 'Ikke satt opp ennå'}</span></span>${I.right()}</a>`;
    html += `<section class="card yellow" aria-labelledby="koord"><h2 id="koord" style="font-size:1.25rem">Koordinatorer</h2>
      ${S.contacts.length ? S.contacts.map((c) => c.phone
        ? `<a class="tel-card" href="${esc(telHref(c.phone))}"><b>${esc(c.full_name)}</b><span class="muted">Ring ${esc(c.phone)}</span></a>`
        : `<div class="tel-card"><b>${esc(c.full_name)}</b><span class="muted">Har ikke lagt inn telefon</span></div>`).join('') : '<p class="muted">Ingen koordinatorer ennå.</p>'}
    </section>`;
    html += `<section class="card" id="guide" aria-labelledby="guidetittel"><h2 id="guidetittel" style="font-size:1.25rem">Slik går en vakt</h2>
      <ol class="steps"><li>Møt de andre på oppmøtestedet 10 minutter før, og ta på vest.</li>
      <li>Gå sammen, aldri alene. Hils og vær synlige, trygge voksne.</li>
      <li>Snakk med ungdommene, ikke om dem. Ikke grip inn i slåsskamp.</li>
      <li>Er noen i fare: ring 112 (politi) eller 113 (ambulanse) med en gang.</li>
      <li>Lever utstyret tilbake og skriv en kort vaktrapport uten navn på barn.</li></ol></section>`;
    html += `<section class="stack" aria-labelledby="nod"><h2 id="nod" style="font-size:1.25rem">Nødnumre</h2>
      <div class="grid-2" style="gap:.5rem">
        ${[['112', 'Politi'], ['113', 'Ambulanse'], ['110', 'Brann'], ['02800', 'Politiet, ikke akutt']].map(([n, l], i) =>
          `<a class="tel-card" href="tel:${n}" style="background:var(--${i < 3 ? 'pink' : 'surface'})" aria-label="Ring ${n}, ${l}"><span style="font-family:Bricolage,sans-serif;font-weight:800;font-size:1.625rem">${n}</span><span class="small">${l}</span></a>`).join('')}
      </div><p class="small muted">Safetly varsler ikke nødetatene. Du må ringe selv.</p></section>`;
    html += `<section class="card pink" aria-labelledby="innsats"><h2 id="innsats" style="font-size:1.25rem">Din innsats</h2>
      <dl class="stats"><div><dt>vakter</dt><dd>${done.length}</dd></div><div><dt>timer</dt><dd>${done.length * 2}</dd></div><div><dt>rapporter</dt><dd>${S.myReports.length}</dd></div></dl></section>`;
    html += viewPushCard();
    html += `<section class="card" aria-labelledby="profil"><h2 id="profil" style="font-size:1.25rem">Profil</h2>
      <p class="small muted">${esc(S.user.email || '')} · ${isAdmin() ? 'Administrator' : isCoordOf(myTeamId()) ? 'Koordinator' : 'Forelder'}</p>
      <form class="stack" data-form="profile">
        <label class="field">Navn<input id="p-name" name="name" required maxlength="80" autocomplete="name" value="${esc(S.me.full_name)}"></label>
        <label class="field">Telefon<input id="p-phone" name="phone" type="tel" maxlength="30" autocomplete="tel" value="${esc(S.phones[S.user.id] || '')}" aria-describedby="p-phone-hint">
          <span class="hint" id="p-phone-hint">Bare koordinatorer ser nummeret ditt.</span></label>
        <button type="submit" class="pill ghost self-start">Lagre profil</button>
      </form>
      <div>
        <label class="switch-row">Større tekst<input type="checkbox" role="switch" class="switch" id="pref-big" data-act="pref-big"${S.big ? ' checked' : ''}></label>
        <div class="stack-s" role="group" aria-labelledby="tema-l" style="padding-top:.5rem"><span id="tema-l" style="font-weight:600">Utseende</span>
          <div class="tabs">${[['auto', 'System'], ['light', 'Lys'], ['dark', 'Mørk']].map(([v, l]) => `<button type="button" id="theme-${v}" data-act="theme" data-v="${v}" aria-pressed="${S.theme === v}">${l}</button>`).join('')}</div></div>
      </div>
      <button type="button" class="pill ghost self-start" data-act="logout">Logg ut</button>
    </section>`;
    if (isCoordOf(myTeamId())) html += `<a class="card ink tight" href="#/kontor" style="text-decoration:none;flex-direction:row;align-items:center;justify-content:space-between;min-height:4rem"><b>Kontor for koordinatorer</b>${I.right()}</a>`;
    return html;
  }

  // ------------------------------------------------------------------ Kontor
  function viewKontor() {
    if (!isCoord()) return '<h1 tabindex="-1">Kontor</h1><p class="empty">Kontoret er bare for koordinatorer.</p>';
    const open = needsPeople(14);
    const ws = weekStart(today());
    let html = `<div class="page-head"><a href="#/info" class="row" style="min-height:2.75rem;text-decoration:none;font-weight:600;align-self:flex-start">${I.left()}Info</a>
      <div class="row" style="flex-wrap:wrap"><h1 tabindex="-1">Kontor</h1><span class="badge ink">${isAdmin() ? 'Administrator' : 'Kun koordinatorer'}</span></div></div>`;
    if (hasTeams()) html += (isAdmin() ? teamSwitcher() : '') + `<p class="small muted">Du styrer laget <b style="color:var(--ink)">${esc((curTeam() || {}).name)}</b>.</p>`;

    html += `<section class="card yellow" aria-labelledby="apne"><div class="between"><h2 id="apne" style="font-size:1.25rem">Åpne vakter</h2><span class="small muted">neste 14 dager</span></div>`;
    if (!open.length) html += '<p>Alle vakter de neste 14 dagene er dekket.</p>';
    open.forEach(({ date, slot }) => {
      const list = shiftPeople(date, slot);
      html += `<div class="card tight"><div class="between"><p style="font-weight:700">${esc(cap(fmtShort(date)))} · ${slotInfo(slot).start}–${slotInfo(slot).end}</p><span class="badge warn">Trenger ${MIN_PER_SHIFT - list.length} til</span></div>
        <ul class="people">${personChips(list, { removable: true })}</ul></div>`;
    });
    html += '</section>';

    html += viewShiftEditor();
    html += '<section class="card blue" aria-labelledby="dekning"><h2 id="dekning" style="font-size:1.25rem">Dekning uke for uke</h2>';
    for (let w = 0; w < 4; w++) {
      const start = addDays(ws, w * 7); let ok = 0; let total = 0;
      for (let i = 0; i < 7; i++) { const d = iso(addDays(start, i)); slotsOn(d).forEach((s) => { total++; if (shiftPeople(d, s).length >= MIN_PER_SHIFT) ok++; }); }
      const pct = total ? Math.round(ok / total * 100) : 0;
      html += `<div class="stack-s"><div class="between small"><b>Uke ${isoWeek(start)}</b><span>${ok} av ${total} vakter dekket</span></div>
        <div class="bar" role="img" aria-label="Uke ${isoWeek(start)}: ${ok} av ${total} vakter dekket"><span style="width:${pct}%"></span></div></div>`;
    }
    html += '</section>';

    const kw = S.kontorWeek;
    html += `<section class="card" aria-labelledby="vaktliste"><div class="between"><h2 id="vaktliste" style="font-size:1.25rem">Vaktliste uke ${isoWeek(kw)}</h2>
      <div class="week-nav"><button type="button" class="icon-btn" data-act="kweek" data-dir="-1" aria-label="Forrige uke">${I.left()}</button><button type="button" class="icon-btn" data-act="kweek" data-dir="1" aria-label="Neste uke">${I.right()}</button></div></div><div>`;
    for (let i = 0; i < 7; i++) {
      const d = iso(addDays(kw, i));
      slotsOn(d).forEach((slot) => {
        const list = shiftPeople(d, slot);
        html += `<div class="list-row" style="flex-direction:column;align-items:stretch"><div class="between"><span class="small"><b>${esc(cap(fmtShort(d)))}</b> · ${slotInfo(slot).start}–${slotInfo(slot).end}</span>${statusBadge(list.length)}</div>
          <ul class="people">${personChips(list, { removable: true })}</ul></div>`;
      });
    }
    html += '</div></section>';

    const people = Object.values(S.profiles).filter((p) => !hasTeams() || p.team_id === curTeamId() || (isAdmin() && !p.team_id))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'nb'));
    html += `<section class="card" aria-labelledby="foreldre"><div class="between"><h2 id="foreldre" style="font-size:1.25rem">Foreldre</h2><span class="small muted">${people.length} i laget</span></div><div>`;
    people.forEach((p) => {
      const ph = S.phones[p.id];
      const teamSel = hasTeams() && isAdmin() && S.teams.length > 1;
      html += `<div class="person-row">
        <div class="person-top"><div class="grow stack-s" style="gap:.125rem;min-width:0"><b class="person-name">${esc(p.full_name || 'Uten navn')}${p.id === S.user.id ? ' (deg)' : ''}</b>
          ${ph ? `<a class="small muted" href="${esc(telHref(ph))}">${esc(ph)}</a>` : '<span class="small muted">Ingen telefon</span>'}</div>
          ${p.id !== S.user.id ? `<a class="icon-btn" href="#/chat/${p.id}" aria-label="Skriv melding til ${esc(p.full_name)}">${I.chat(20)}</a>` : ''}</div>
        <div class="person-controls${teamSel ? '' : ' one'}">
          <label class="mini-field"><span>Rolle</span><select id="role-${p.id}" data-change="role" data-id="${p.id}" aria-label="Rolle for ${esc(p.full_name)}">
            <option value="forelder"${p.role === 'forelder' ? ' selected' : ''}>Forelder</option><option value="koordinator"${p.role === 'koordinator' ? ' selected' : ''}>Koordinator</option></select></label>
          ${teamSel ? `<label class="mini-field"><span>Lag</span><select id="pteam-${p.id}" data-change="person-team" data-id="${p.id}" aria-label="Lag for ${esc(p.full_name)}">${p.team_id ? '' : '<option value="">Uten lag</option>'}${S.teams.map((t) => `<option value="${t.id}"${t.id === p.team_id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
        </div></div>`;
    });
    html += `</div></section>
      <button type="button" class="pill block" style="min-height:3.5rem" data-act="csv">${I.download()}Last ned vaktliste (CSV, 4 uker)</button>`;
    if (hasTeams() && isAdmin()) {
      const t = curTeam();
      html += `<section class="card" aria-labelledby="lag-h"><h2 id="lag-h" style="font-size:1.25rem">Lag</h2>
        <ul class="stack-s" style="list-style:none;margin:0;padding:0">${S.teams.map((x) => `<li class="between"><span>${esc(x.name)}</span><span class="small muted">${Object.values(S.profiles).filter((p) => p.team_id === x.id).length} foreldre</span></li>`).join('')}</ul>
        <form class="stack" data-form="team-rename"><label class="field">Nytt navn på «${esc(t.name)}»<input id="team-name" name="name" maxlength="60" required value="${esc(t.name)}"></label>
          <button type="submit" class="pill ghost sm self-start">Lagre navn</button></form>
        <form class="stack" data-form="team-new"><label class="field">Nytt lag<input id="team-new" name="name" maxlength="60" required placeholder="F.eks. Ugla – Dalgård"></label>
          <button type="submit" class="pill sm self-start">${I.plus()}Lag nytt lag</button></form>
        <p class="small muted">Et nytt lag får egne vakttider, eget kart og oppmøtested. Gjør en forelder til koordinator i laget, så kan de styre det selv.</p></section>`;
    }
    return html;
  }

  // ------------------------------------------------------------------ Nødhjelp
  function viewSos() {
    const calls = [['112', 'Politi', 'Vold, trusler, fare for liv'], ['113', 'Ambulanse', 'Syk, skadet, bevisstløs'], ['110', 'Brann', 'Brann, røyk, gass'], ['02800', 'Politiet', 'Ikke akutt, tips']];
    return `<div class="wrap"><header class="top"><span class="sos" style="cursor:default">${I.phone()}Nødhjelp</span>
      <a href="${esc(S.backRoute)}" class="icon-btn" style="width:3rem;height:3rem" aria-label="Lukk nødhjelp">${I.x(22)}</a></header>
      <main id="innhold" tabindex="-1" class="no-nav">
        <div class="page-head"><h1 tabindex="-1" style="font-size:2rem">Ring hvis noen er i fare</h1><p class="muted">Trykk på et nummer for å ringe fra telefonen din.</p></div>
        <div class="notice" role="note">${I.alert()}<p>Safetly varsler ikke nødetatene. Du må ringe selv.</p></div>
        <nav aria-label="Ring nødnummer" class="stack" style="gap:.625rem">${calls.map(([n, t, d], i) =>
          `<a class="call" href="tel:${n}"${i === 3 ? ' style="background:var(--surface)"' : ''}><span class="num"${n.length > 3 ? ' style="font-size:1.75rem"' : ''}>${n}</span>
          <span class="stack-s" style="gap:.125rem"><b style="font-size:1.0625rem">${t}</b><span class="small muted">${d}</span></span><span class="ring-btn"${i === 3 ? ' style="background:var(--ink);color:var(--bg)"' : ''} aria-hidden="true">Ring</span></a>`).join('')}</nav>
        <section class="card yellow" aria-labelledby="huske"><h2 id="huske" style="font-size:1.25rem">Husk når du ringer</h2>
          <ul class="stack" style="list-style:none;margin:0;padding:0;gap:.25rem">${['Hvem du er, og at du er natteravn', 'Hvor du er: gate, nummer eller landemerke', 'Hva som har skjedd', 'Hvor mange som trenger hjelp, og hvordan de har det', 'Følg rådene du får. Ikke legg på før de sier det']
            .map((x, i) => `<li><label class="switch-row" style="justify-content:flex-start;gap:.75rem;min-height:2.75rem"><input type="checkbox" id="sos-${i}" style="width:1.5rem;height:1.5rem;margin:0;accent-color:var(--ink);flex:none"><span>${x}</span></label></li>`).join('')}</ul></section>
        <p class="small muted">Gi beskjed til en koordinator etterpå, og skriv en kort vaktrapport uten navn på barn.</p>
      </main></div>`;
  }

  // ------------------------------------------------------------------ Innlogging
  function viewAuth() {
    const signup = S.authMode === 'signup'; const reset = S.authMode === 'reset';
    let form;
    if (S.confirmSent) {
      form = '<div class="card yellow" role="status"><h2>Sjekk e-posten din</h2><p>Vi har sendt en lenke for å bekrefte kontoen. Åpne den, og logg inn etterpå.</p><button type="button" class="pill self-start" data-act="auth-mode" data-v="login">Til innlogging</button></div>';
    } else if (reset) {
      form = S.resetSent
        ? '<div class="card yellow" role="status"><p>Hvis e-posten finnes, har vi sendt en lenke for å lage nytt passord.</p><button type="button" class="pill self-start" data-act="auth-mode" data-v="login">Til innlogging</button></div>'
        : `<form class="stack" data-form="reset" aria-labelledby="glemt"><h2 id="glemt">Glemt passord</h2>
          <label class="field">E-post<input id="a-email" name="email" type="email" required autocomplete="email"></label>
          <button type="submit" class="pill">Send lenke</button><button type="button" class="link-btn" data-act="auth-mode" data-v="login">Tilbake</button></form>`;
    } else {
      form = `<div class="tabs" role="group" aria-label="Velg innlogging eller ny konto">
          <button type="button" id="tab-login" data-act="auth-mode" data-v="login" aria-pressed="${!signup}">Logg inn</button>
          <button type="button" id="tab-signup" data-act="auth-mode" data-v="signup" aria-pressed="${signup}">Ny konto</button></div>
        <form class="stack" data-form="${signup ? 'signup' : 'login'}" aria-label="${signup ? 'Opprett konto' : 'Logg inn'}">
          ${signup ? '<label class="field">Navn<input id="a-name" name="name" required maxlength="80" autocomplete="name"></label>' : ''}
          <label class="field">E-post<input id="a-email" name="email" type="email" required autocomplete="email" placeholder="navn@eksempel.no"></label>
          <label class="field">Passord<input id="a-pass" name="password" type="password" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}">${signup ? '<span class="hint">Minst 6 tegn.</span>' : ''}</label>
          ${signup ? `<label class="field">Telefon<input id="a-phone" name="phone" type="tel" maxlength="30" autocomplete="tel" aria-describedby="a-phone-hint"><span class="hint" id="a-phone-hint">Bare koordinatorer ser nummeret ditt.</span></label>
          <p class="card yellow tight small">Den første kontoen i nabolaget blir koordinator. Alle andre blir foreldre, og en koordinator kan endre roller.</p>` : ''}
          <button type="submit" class="pill" style="min-height:3.25rem">${signup ? 'Opprett konto' : 'Logg inn'}</button>
          ${signup ? '' : '<button type="button" class="link-btn" data-act="auth-mode" data-v="reset">Glemt passord?</button>'}
        </form>`;
    }
    return `<div class="wrap"><header class="top"><span class="brand"><span class="logo">${I.moon()}</span><span class="brand-name">Safetly</span></span><a class="sos" href="#/nodhjelp">${I.phone()}Nødhjelp</a></header>
      ${api.mode === 'demo' ? '<p class="demo-banner">Demomodus: data lagres bare på denne enheten.</p>' : ''}
      <main id="innhold" tabindex="-1" class="no-nav" style="gap:1.375rem">
        <div class="hero" aria-hidden="true"><span style="left:0;top:1.125rem;width:10.5rem;height:7rem;background:var(--blue);transform:rotate(-6deg)"></span>
          <span style="left:7rem;top:0;width:9.5rem;height:7.5rem;background:var(--yellow);transform:rotate(4deg)"></span>
          <span style="left:13rem;top:1.875rem;width:8.25rem;height:6.75rem;background:var(--pink);transform:rotate(-3deg)"></span>
          <span style="left:9.5rem;top:2.5rem;width:4.5rem;height:4.5rem;border-radius:1.5rem;background:var(--ink);color:var(--bg);display:grid;place-items:center">${I.moon(38)}</span></div>
        <div class="page-head"><h1 tabindex="-1" style="font-size:2.5rem">Safetly</h1><p class="muted" style="font-size:1.0625rem">Foreldre som går natteravn sammen, for et tryggere nabolag.</p></div>
        ${form}
      </main></div>`;
  }
  function viewRecovery() {
    return `<div class="wrap"><header class="top"><span class="brand"><span class="logo">${I.moon()}</span><span class="brand-name">Safetly</span></span></header>
      <main id="innhold" tabindex="-1" class="no-nav"><h1 tabindex="-1">Nytt passord</h1>
      <form class="stack" data-form="newpass"><label class="field">Nytt passord<input id="np" name="password" type="password" required minlength="6" autocomplete="new-password"></label>
      <button type="submit" class="pill">Lagre passord</button></form></main></div>`;
  }


  // ------------------------------------------------------------------ Meldinger
  async function loadReceipts() {
    try {
      const [peers, alle] = await Promise.all([api.peerReads(), isAnyCoord() ? api.alleReadTimes() : Promise.resolve([])]);
      S.peerReads = {}; peers.forEach((r) => { S.peerReads[r.user_id] = r.last_read_at; });
      S.alleReads = (alle || []).map((x) => (typeof x === 'string' ? x : (x && (x.alle_read_times || x.last_read_at)) || '')).filter(Boolean);
    } catch (e) { /* «sett»-funksjonen er ikke satt opp i databasen ennå */ }
  }
  function onReadUpdate(row) {
    if (!S.user || !row) return;
    if (row.thread === S.user.id && row.user_id !== S.user.id) { S.peerReads[row.user_id] = row.last_read_at; render(); }
    else if (row.thread === 'alle' && isAnyCoord()) { loadReceipts().then(render); }
  }
  function seenLabel(ts) {
    const d = new Date(ts); const t = today(); const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((t - day) / 86400000);
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return diff === 0 ? `Sett ${hm}` : diff === 1 ? `Sett i går ${hm}` : `Sett ${d.getDate()}.${d.getMonth() + 1}.`;
  }
  const threadOf = (m) => (!m.recipient_id ? 'alle' : (m.sender_id === S.user.id ? m.recipient_id : m.sender_id));
  // Nye brukere ser siste ukes meldinger som uleste.
  function readBaseline(thread) {
    if (S.reads[thread]) return S.reads[thread];
    const joined = Date.parse((S.me && S.me.created_at) || '') || 0;
    return new Date(joined - 7 * 86400000).toISOString();
  }
  function unreadIn(thread) { const base = Date.parse(readBaseline(thread)) || 0; return S.messages.filter((m) => threadOf(m) === thread && m.sender_id !== S.user.id && Date.parse(m.created_at) > base).length; }
  function unreadTotal() {
    if (!S.user || !S.loaded) return 0;
    const seen = {}; let n = 0;
    S.messages.forEach((m) => { const t = threadOf(m); if (!seen[t]) { seen[t] = 1; n += unreadIn(t); } });
    return n;
  }
  function fmtChatTime(ts) {
    const d = new Date(ts); const t = today(); const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((t - day) / 86400000);
    if (diff === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (diff === 1) return 'I går';
    if (diff < 7) return cap(DAYS[dow(d)]);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  }
  function dayLabel(ts) {
    const d = new Date(ts); const t = today(); const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((t - day) / 86400000);
    return diff === 0 ? 'I dag' : diff === 1 ? 'I går' : cap(fmtDay(iso(day)));
  }
  function chatAvatar(thread, big) {
    const cls = big ? 'chat-av big' : 'chat-av';
    if (thread === 'alle') return `<span class="${cls} alle" aria-hidden="true">${I.megaphone(big ? 24 : 22)}</span>`;
    const p = S.profiles[thread] || {};
    return `<span class="${cls}${p.role === 'koordinator' ? ' koord' : ''}" aria-hidden="true">${esc(initials(p.full_name))}</span>`;
  }
  function threadName(thread) { return thread === 'alle' ? 'Til alle' : ((S.profiles[thread] || {}).full_name || 'Ukjent'); }

  function viewChat() {
    const param = routeParam();
    if (param === 'ny') return viewChatNew();
    if (param) return viewThread(param);
    const last = {};
    S.messages.forEach((m) => { last[threadOf(m)] = m; });
    const threads = Object.keys(last).filter((t) => t !== 'alle' && S.profiles[t]).sort((a, b) => Date.parse(last[b].created_at) - Date.parse(last[a].created_at));
    const row = (t) => {
      const m = last[t]; const n = unreadIn(t);
      const who = m ? (m.sender_id === S.user.id ? 'Du: ' : (t === 'alle' ? shortName((S.profiles[m.sender_id] || {}).full_name) + ': ' : '')) : '';
      const preview = m ? who + m.body : (t === 'alle' ? 'Beskjeder fra koordinatorene til alle' : '');
      return `<li><a class="chat-row${t === 'alle' ? ' alle' : ''}${n ? ' unread' : ''}" href="#/chat/${t}">
        ${chatAvatar(t)}
        <span class="grow stack-s" style="gap:.125rem"><span class="between"><b>${esc(threadName(t))}</b>${m ? `<span class="small muted">${esc(fmtChatTime(m.created_at))}</span>` : ''}</span>
        <span class="between"><span class="preview">${esc(preview)}</span>${n ? `<span class="count-pill">${n}<span class="sr-only"> uleste</span></span>` : ''}</span></span></a></li>`;
    };
    return `<div class="between" style="align-items:flex-end"><div class="page-head"><h1 tabindex="-1">Meldinger</h1><p class="muted">Skriv til andre i nabolaget</p></div>
        <a class="pill sm" href="#/chat/ny">${I.plus()}Ny melding</a></div>
      <ul class="chat-list">${row('alle')}${threads.map(row).join('')}</ul>
      ${threads.length ? '' : '<p class="empty">Ingen samtaler ennå. Trykk «Ny melding» for å skrive til noen.</p>'}
      <p class="small muted">Meldinger til én person ser bare dere to. Ikke del sensitive opplysninger om barn.</p>`;
  }
  function viewChatNew() {
    const people = Object.values(S.profiles).filter((p) => p.id !== S.user.id).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'nb'));
    return `<div class="page-head"><a href="#/chat" class="row back-link">${I.left()}Meldinger</a><h1 tabindex="-1">Ny melding</h1></div>
      <label class="field">Søk etter navn<input id="chat-search" type="search" autocomplete="off" placeholder="Skriv et navn"></label>
      <ul class="chat-list" id="pick-list">${isAnyCoord() ? `<li data-name="til alle"><a class="chat-row alle" href="#/chat/alle">${chatAvatar('alle')}<span class="grow stack-s" style="gap:.125rem"><b>Til alle</b><span class="preview">Beskjed til hele nabolaget</span></span></a></li>` : ''}
      ${people.map((p) => `<li data-name="${esc((p.full_name || '').toLowerCase())}"><a class="chat-row" href="#/chat/${p.id}">${chatAvatar(p.id)}<span class="grow stack-s" style="gap:.125rem"><b>${esc(p.full_name || 'Uten navn')}</b><span class="preview">${p.role === 'koordinator' ? 'Koordinator' : 'Forelder'}</span></span></a></li>`).join('')}</ul>
      <p class="empty" id="pick-empty" hidden>Fant ingen med det navnet.</p>`;
  }
  function viewThread(thread) {
    if (thread !== 'alle' && !S.profiles[thread]) return `<a href="#/chat" class="row back-link">${I.left()}Meldinger</a><p class="empty">Fant ikke denne personen.</p>`;
    const msgs = S.messages.filter((m) => threadOf(m) === thread);
    if (unreadIn(thread)) { S.reads[thread] = new Date().toISOString(); api.markRead(thread).catch(() => {}); }
    const p = S.profiles[thread] || {};
    const sub = thread === 'alle' ? 'Koordinatorene skriver, alle leser' : (p.role === 'koordinator' ? 'Koordinator' : 'Forelder');
    let html = `<div class="chat-head">
      <a href="#/chat" class="icon-btn plain" aria-label="Tilbake til meldinger">${I.left()}</a>${chatAvatar(thread, true)}
      <div class="grow"><h1 tabindex="-1" style="font-size:1.25rem">${esc(threadName(thread))}</h1><p class="small muted">${esc(sub)}</p></div></div>
      <ol class="bubbles" aria-label="Meldinger" aria-live="polite">`;
    let lastDay = '';
    const mineMsgs = msgs.filter((m) => m.sender_id === S.user.id);
    const lastMineId = mineMsgs.length ? mineMsgs[mineMsgs.length - 1].id : null;
    const audience = Math.max(0, Object.keys(S.profiles).length - 1);
    msgs.forEach((m, i) => {
      const dl = dayLabel(m.created_at);
      if (dl !== lastDay) { html += `<li class="day-sep"><span>${esc(dl)}</span></li>`; lastDay = dl; }
      const mine = m.sender_id === S.user.id;
      const prev = msgs[i - 1];
      const showName = thread === 'alle' && !mine && (!prev || prev.sender_id !== m.sender_id || dayLabel(prev.created_at) !== dl);
      const d = new Date(m.created_at);
      let receipt = '';
      if (mine && thread !== 'alle' && m.id === lastMineId) {
        const seen = S.peerReads[thread] && Date.parse(S.peerReads[thread]) >= Date.parse(m.created_at);
        receipt = seen ? `<span class="receipt seen">${I.checks()}${esc(seenLabel(S.peerReads[thread]))}</span>` : `<span class="receipt">${I.check()}Sendt</span>`;
      } else if (mine && thread === 'alle' && isAnyCoord()) {
        const n = S.alleReads.filter((t) => Date.parse(t) >= Date.parse(m.created_at)).length;
        receipt = `<span class="receipt${n ? ' seen' : ''}">${n ? I.checks() : I.check()}Sett av ${n} av ${audience}</span>`;
      }
      html += `<li class="bubble-row ${mine ? 'mine' : 'theirs'}${thread === 'alle' && !mine ? ' alle' : ''}">
        ${showName ? `<span class="small muted bubble-name">${esc((S.profiles[m.sender_id] || {}).full_name || 'Koordinator')}</span>` : ''}
        <div class="bubble"><span class="sr-only">${mine ? 'Du' : esc(nameOf(m.sender_id))} skrev: </span><p class="pre">${esc(m.body)}</p></div>
        <span class="bubble-time">${pad(d.getHours())}:${pad(d.getMinutes())}${receipt ? ' · ' : ''}${receipt}</span></li>`;
    });
    html += '</ol>';
    if (!msgs.length) html += `<p class="empty">${thread === 'alle' ? 'Ingen beskjeder til alle ennå.' : 'Ingen meldinger ennå. Si hei!'}</p>`;
    if (thread === 'alle' && !isAnyCoord()) {
      html += `<div class="composer readonly"><p class="small">Bare koordinatorene kan skrive her. Vil du svare, send en melding til én koordinator.</p>
        <a class="pill sm self-start" href="#/chat/ny">Skriv til en koordinator</a></div>`;
    } else {
      html += `<form class="composer" data-form="chat" data-thread="${esc(thread)}">
        <label class="sr-only" for="chat-input-${esc(thread)}">${thread === 'alle' ? 'Beskjed til alle' : 'Melding til ' + esc(threadName(thread))}</label>
        <textarea id="chat-input-${esc(thread)}" name="body" rows="1" maxlength="1000" required data-autogrow placeholder="${thread === 'alle' ? 'Skriv en beskjed til alle …' : 'Skriv en melding …'}" aria-describedby="chat-hint"></textarea>
        <button type="submit" class="send-btn" aria-label="Send">${I.send()}</button>
        <p id="chat-hint" class="chat-hint">Ikke del sensitive opplysninger om barn.</p>
      </form>`;
    }
    return html;
  }
  function onIncoming(m) {
    if (!S.user || S.messages.some((x) => x.id === m.id)) return;
    S.messages.push(m);
    const t = threadOf(m);
    const open = route() === 'chat' && routeParam() === t;
    if (open) S.chatBottom = true;
    else if (m.sender_id !== S.user.id) toast(`Ny melding fra ${t === 'alle' ? 'koordinator, til alle' : nameOf(m.sender_id)}`);
    render();
  }




  // ------------------------------------------------------------------ Varsler (push)
  const NOTIFY_TYPES = [
    ['meldinger', 'Ny melding til meg'], ['alle', 'Beskjed til alle fra koordinatorene'], ['nyheter', 'Ukas nyheter'],
    ['vakt', 'Påminnelse 2 timer før vakten min'], ['mangler', 'Kl. 17 når kveldens vakt mangler folk']
  ];
  const NOTIFY_DEFAULT = { meldinger: true, alle: true, nyheter: true, vakt: true, mangler: true };
  function pushSupport() {
    if (!api.pushReady) return 'demo';
    if (isNative()) return 'native';
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios && !standalone ? 'ios-browser' : 'unsupported';
    return 'ok';
  }
  async function currentSubscription() {
    try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; }
  }
  function b64uToBytes(s) { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
  async function pushOn() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { S.pushPerm = perm; throw new Error('Du må trykke «Tillat» for å få varsler.'); }
    const reg = await navigator.serviceWorker.ready;
    const key = await api.pushKey();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
    const j = sub.toJSON();
    await api.savePush(j.endpoint, j.keys.p256dh, j.keys.auth);
    S.pushOn = true; S.pushPerm = 'granted';
    toast('Varsler er slått på. 🔔');
  }
  async function pushOff(quiet) {
    if (pushSupport() !== 'ok') return;
    const sub = await currentSubscription(); if (!sub) { S.pushOn = false; return; }
    try { await api.removePush(sub.endpoint); } catch (e) { if (!quiet) throw e; }
    try { await sub.unsubscribe(); } catch (e) { /* tom */ }
    S.pushOn = false;
  }
  // Ved innlogging: knytt telefonen til riktig bruker hvis varsler allerede er på.
  async function syncPush() {
    S.notify = Object.assign({}, NOTIFY_DEFAULT, (await api.myNotify().catch(() => null)) || {});
    if (pushSupport() !== 'ok') return;
    S.pushPerm = Notification.permission;
    const sub = await currentSubscription();
    S.pushOn = !!sub && S.pushPerm === 'granted';
    if (S.pushOn) { const j = sub.toJSON(); api.savePush(j.endpoint, j.keys.p256dh, j.keys.auth).catch(() => {}); }
    if (route() === 'info') render();
  }
  function viewPushCard() {
    const sup = pushSupport();
    let inner;
    if (sup === 'demo') inner = '<p class="small muted">Varsler virker når appen er koblet til nabolagets database.</p>';
    else if (sup === 'native') inner = `<p>Varsler virker i nettappen. Åpne <b>raadkawa.github.io/safetly</b> i Chrome, trykk ⋮ og <b>Legg til på startskjermen</b>, og slå på varsler der.</p>`;
    else if (sup === 'ios-browser') inner = `<p>På iPhone må Safetly ligge på Hjem-skjermen for å få varsler:</p>
      <ol class="steps"><li>Trykk Del-knappen (firkanten med pil opp) nederst i Safari.</li><li>Velg <b>Legg til på Hjem-skjerm</b>.</li><li>Åpne Safetly fra Hjem-skjermen og slå på varsler her.</li></ol>
      <p class="small muted">Krever iOS 16.4 eller nyere.</p>`;
    else if (sup === 'unsupported') inner = '<p class="small">Denne nettleseren støtter ikke varsler. Prøv Chrome på Android, eller Safetly fra Hjem-skjermen på iPhone.</p>';
    else if (S.pushPerm === 'denied') inner = `<p>Varsler er blokkert for Safetly på denne telefonen.</p>
      <p class="small muted">iPhone: Innstillinger → Varslinger → Safetly → Tillat varslinger. Android: hold inne Safetly-ikonet → Appinfo → Varsler.</p>`;
    else if (!S.pushOn) inner = `<p>Få beskjed om nye meldinger og vakter, også når appen er lukket.</p>
      <button type="button" class="pill self-start" data-act="push-on">${I.bell()}Slå på varsler</button>`;
    else inner = `<p class="small" style="font-weight:600;color:var(--ok)">✓ Varsler er på for denne telefonen</p>
      <div>${NOTIFY_TYPES.map(([k, l]) => `<label class="switch-row">${l}<input type="checkbox" role="switch" class="switch" id="nt-${k}" data-change="notify" data-key="${k}"${S.notify && S.notify[k] === false ? '' : ' checked'}></label>`).join('')}</div>
      <div class="wrap-row"><button type="button" class="pill ghost sm" data-act="push-test">Send testvarsel</button><button type="button" class="link-btn" data-act="push-off">Slå av på denne telefonen</button></div>`;
    return `<section class="card blue" aria-labelledby="varsler-h"><h2 id="varsler-h" style="font-size:1.25rem">Varsler</h2>${inner}</section>`;
  }

  // ------------------------------------------------------------------ Vakttider (koordinator)
  function currentShifts() { const c = S.settings && S.settings.shifts; return validShifts(c) ? c : DEFAULT_SHIFTS; }
  const slotKey = () => 'k' + Math.random().toString(36).slice(2, 8);
  function viewShiftEditor() {
    const c = currentShifts();
    if (!S.shiftDraft) {
      return `<section class="card pink" aria-labelledby="vt"><div class="between"><h2 id="vt" style="font-size:1.25rem">Vakttider</h2>
        <button type="button" class="pill ghost sm" data-act="shift-edit">${I.pen()}Endre</button></div>
        <ul class="stack-s" style="list-style:none;margin:0;padding:0">${c.slots.map((x) => `<li class="between"><b>${esc(x.name)}</b><span>${esc(x.start)}–${esc(x.end)}</span></li>`).join('')}</ul>
        <p class="small">Minst ${c.min} ${c.min === 1 ? 'voksen' : 'voksne'} per vakt · ${c.days.length === 7 ? 'alle dager' : c.days.slice().sort().map((d) => DAYS_SHORT[d].toLowerCase()).join(', ')}</p></section>`;
    }
    const d = S.shiftDraft;
    return `<form class="card pink" data-form="shifts" aria-labelledby="vt"><h2 id="vt" style="font-size:1.25rem">Vakttider</h2>
      <p class="small" id="tid-hjelp">Klokkeslett skrives med 24-timersklokke, for eksempel 21:00 eller 2300.</p>
      <p class="small">Endringene gjelder for alle med en gang. Bookinger følger vakten de er på (vakt 1, 2 …), så sjekk dem hvis du fjerner en vakt.</p>
      ${d.slots.map((x, i) => `<fieldset class="slot-edit"><legend>Vakt ${i + 1}</legend>
        <label class="field">Navn<input id="sl-name-${x.key}" maxlength="30" required value="${esc(x.name)}"></label>
        <div class="grid-2"><label class="field">Fra${timeInput('sl-start-' + x.key, x.start, 'required')}</label>
        <label class="field">Til${timeInput('sl-end-' + x.key, x.end, 'required')}</label></div>
        ${d.slots.length > 1 ? `<button type="button" class="link-btn self-start" data-act="slot-del" data-key="${x.key}">Fjern vakt ${i + 1}</button>` : ''}</fieldset>`).join('')}
      ${d.slots.length < MAX_SLOTS ? `<button type="button" class="pill ghost sm self-start" data-act="slot-add">${I.plus()}Legg til vakt</button>` : ''}
      <label class="field">Minst antall voksne per vakt<select id="sl-min">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === d.min ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <fieldset><legend>Dager med vakt</legend><div class="day-picks">${DAYS_SHORT.map((n, i) => `<label class="day-pick"><input type="checkbox" id="sl-day-${i}" value="${i}"${d.days.includes(i) ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div></fieldset>
      <div class="wrap-row"><button type="submit" class="pill">Lagre vakttider</button><button type="button" class="pill ghost" data-act="shift-cancel">Avbryt</button></div>
    </form>`;
  }
  function readShiftInputs() {
    const d = S.shiftDraft; if (!d) return;
    d.slots.forEach((x) => {
      const n = document.getElementById('sl-name-' + x.key); const a = document.getElementById('sl-start-' + x.key); const b = document.getElementById('sl-end-' + x.key);
      if (n) x.name = n.value.trim(); if (a) x.start = normTime(a.value); if (b) x.end = normTime(b.value);
    });
    const m = $('#sl-min'); if (m) d.min = +m.value;
    const days = [...document.querySelectorAll('[id^="sl-day-"]')]; if (days.length) d.days = days.filter((c) => c.checked).map((c) => +c.value);
  }

  // ------------------------------------------------------------------ Vaktområde (kart)
  const TILE_URL = 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png';
  let MAP = null; let LAYERS = null; let ME = null;
  function currentMap() {
    const st = S.settings && S.settings.map;
    if (st && Array.isArray(st.area) && st.area.length > 2) return st;
    return (!hasTeams() || isFirstTeam(curTeam())) ? (window.SAFETLY_OMRADE || null) : null;
  }
  function mapData() { return S.mapEdit ? S.mapDraft : currentMap(); }
  function roundKey() { const n = new Date(); if (n.getHours() < 6) n.setDate(n.getDate() - 1); return 'safetly-runde-' + iso(n); }
  function visited() { try { return new Set(JSON.parse(localStorage.getItem(roundKey())) || []); } catch (e) { return new Set(); } }
  function saveVisited(set) { try { localStorage.setItem(roundKey(), JSON.stringify([...set])); } catch (e) { /* tom */ } }
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function isDark() { return S.theme === 'dark' || (S.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }

  function viewKart() {
    const d = mapData();
    if (!d) return `<div class="page-head"><a href="#/info" class="row back-link">${I.left()}Info</a><h1 tabindex="-1">Vaktområde</h1></div>${teamSwitcher()}
      <p class="empty">Vaktområdet for ${esc((curTeam() || {}).name || 'laget')} er ikke tegnet ennå.</p>
      ${isCoord() ? `<button type="button" class="pill self-start" data-act="map-edit">${I.pen()}Tegn vaktområdet</button>` : ''}`;
    const cps = d.checkpoints || [];
    const seen = visited();
    const done = cps.filter((c) => seen.has(c.id)).length;
    let html = `<div class="page-head"><a href="#/info" class="row back-link">${I.left()}Info</a>
      <h1 tabindex="-1">Vaktområde</h1><p class="muted">${esc(d.name || '')}${d.name ? ' · ' : ''}Gå innom alle sjekkpunktene i løpet av vakten.</p></div>${S.mapEdit ? '' : teamSwitcher()}`;
    if (S.mapEdit) {
      html += `<div class="card ink tight" role="status">${S.mapDraw
        ? `<b>Tegn grensen</b><p class="small">Trykk på kartet rundt hele området, ett punkt om gangen. <span id="draw-count">${d.area.length}</span> punkter så langt.</p>`
        : S.mapAdd ? '<b>Legg til sjekkpunkt</b><p class="small">Trykk på kartet der sjekkpunktet skal være.</p>'
        : '<b>Redigerer kartet</b><p class="small">Dra punktene for å flytte dem. Endringene lagres først når du trykker «Lagre kart».</p>'}</div>`;
    }
    html += `<div class="map-wrap">
      <div id="map" class="map${isDark() ? ' dark' : ''}" role="region" aria-label="Kart over vaktområdet med grense og ${cps.length} sjekkpunkter"></div>
      ${S.mapEdit ? '' : `<button type="button" class="pill sm map-locate" data-act="locate">${I.locate()}Vis meg</button>`}
    </div>
    <ul class="legend"><li><span class="lg-area" aria-hidden="true"></span>Vaktområde</li><li><span class="lg-cp" aria-hidden="true">1</span>Sjekkpunkt</li><li><span class="lg-meet" aria-hidden="true">${I.moon(12)}</span>Oppmøte</li></ul>`;

    if (!S.mapEdit) {
      html += `<section class="card yellow" aria-labelledby="runde">
        <div class="between"><h2 id="runde" style="font-size:1.25rem">Kveldens runde</h2><span class="badge soft" id="round-count">${done} av ${cps.length}</span></div>
        <div class="bar" role="img" id="round-bar" aria-label="${done} av ${cps.length} sjekkpunkter besøkt"><span style="width:${cps.length ? Math.round(done / cps.length * 100) : 0}%"></span></div>
        <ol class="cp-list">
          <li class="cp-row meet-row"><span class="cp-num meet" aria-hidden="true">${I.moon(14)}</span>
            <span class="grow stack-s" style="gap:0"><b>Oppmøte: ${esc(meeting().name || 'oppmøtestedet')}</b><span class="small muted">Start og slutt her</span></span>
            ${d.meet ? `<button type="button" class="icon-btn" data-act="map-focus" data-meet="1" aria-label="Vis oppmøtestedet på kartet">${I.map(18)}</button>` : ''}</li>
          ${cps.map((c, i) => `<li class="cp-row">
            <label class="cp-check"><input type="checkbox" id="cp-${esc(c.id)}" data-change="visit" data-id="${esc(c.id)}"${seen.has(c.id) ? ' checked' : ''}>
              <span class="cp-num" aria-hidden="true">${i + 1}</span>
              <span class="grow stack-s" style="gap:0"><b>${esc(c.name)}</b>${c.note ? `<span class="small muted">${esc(c.note)}</span>` : ''}</span></label>
            <button type="button" class="icon-btn" data-act="map-focus" data-i="${i}" aria-label="Vis ${esc(c.name)} på kartet">${I.map(18)}</button></li>`).join('')}
        </ol>
        <button type="button" class="link-btn self-start" data-act="round-reset">Nullstill runden</button>
      </section>
      <p class="small muted">Avkrysningen lagres bare på denne telefonen og nullstilles neste kveld. «Vis meg» bruker posisjonen din bare her på skjermen, den sendes ikke til noen.</p>`;
      if (isCoord()) html += `<button type="button" class="pill ghost self-start" data-act="map-edit">${I.pen()}Rediger kart</button>`;
    } else {
      html += `<div class="wrap-row">
        <button type="button" class="pill sm${S.mapAdd ? '' : ' ghost'}" data-act="map-add" aria-pressed="${S.mapAdd}">${I.plus()}Legg til sjekkpunkt</button>
        ${S.mapDraw
          ? `<button type="button" class="pill sm" data-act="map-draw-done">Ferdig med grensen</button>`
          : `<button type="button" class="pill sm ghost" data-act="map-draw">Tegn grensen på nytt</button>`}
      </div>
      <label class="field">Navn på området<input id="map-name" maxlength="80" value="${esc(d.name || '')}"></label>
      <section class="stack" aria-labelledby="cp-edit-h"><h2 id="cp-edit-h" style="font-size:1.25rem">Sjekkpunkter</h2>
        ${cps.length ? '' : '<p class="empty">Ingen sjekkpunkter. Trykk «Legg til sjekkpunkt» og så på kartet.</p>'}
        ${cps.map((c, i) => `<div class="card tight cp-edit">
          <div class="between"><span class="cp-num" aria-hidden="true">${i + 1}</span>
            <span class="row" style="gap:.25rem">
              ${i > 0 ? `<button type="button" class="icon-btn" data-act="cp-up" data-i="${i}" aria-label="Flytt ${esc(c.name)} opp">${I.up()}</button>` : ''}
              <button type="button" class="icon-btn" data-act="cp-del" data-i="${i}" aria-label="Slett ${esc(c.name)}">${I.trash()}</button></span></div>
          <label class="field">Navn<input id="cpn-${esc(c.id)}" maxlength="60" value="${esc(c.name)}"></label>
          <label class="field">Hva skal dere se etter<input id="cpt-${esc(c.id)}" maxlength="120" value="${esc(c.note || '')}"></label></div>`).join('')}
      </section>
      <div class="wrap-row"><button type="button" class="pill" data-act="map-save">Lagre kart</button><button type="button" class="pill ghost" data-act="map-cancel">Avbryt</button></div>
      ${S.settings && S.settings.map && (!hasTeams() || isFirstTeam(curTeam())) ? '<button type="button" class="link-btn self-start" data-act="map-default">Gå tilbake til standardkartet</button>' : ''}`;
    }
    return html;
  }

  function mountMap() {
    const el = document.getElementById('map');
    if (MAP) { MAP.remove(); MAP = null; LAYERS = null; }
    if (!el || !window.L) return;
    const d = mapData(); if (!d) return;
    MAP = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, zoomSnap: 0.25, zoomDelta: 0.5 });
    MAP.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.tileLayer(TILE_URL, { maxZoom: 19, maxNativeZoom: 18, attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>' }).addTo(MAP);
    if (S.mapView) MAP.setView(S.mapView.c, S.mapView.z);
    else if (d.area && d.area.length > 2) MAP.fitBounds(L.polygon(d.area).getBounds(), { padding: [6, 6] });
    else MAP.setView([63.396, 10.368], 15);
    MAP.on('moveend', () => { if (MAP) S.mapView = { c: MAP.getCenter(), z: MAP.getZoom() }; });
    MAP.on('click', onMapClick);
    drawLayers();
  }
  function drawLayers() {
    if (!MAP) return;
    if (LAYERS) LAYERS.remove();
    LAYERS = L.layerGroup().addTo(MAP);
    const d = mapData(); const ink = cssVar('--ink') || '#1C1A16';
    const area = d.area || [];
    const style = { color: ink, weight: 3, dashArray: '8 7', fillColor: cssVar('--blue') || '#D4E3F5', fillOpacity: 0.45, interactive: false };
    if (area.length > 2 && !S.mapDraw) L.polygon(area, style).addTo(LAYERS);
    else if (area.length > 1) L.polyline(area, style).addTo(LAYERS);
    if (S.mapDraw) area.forEach((p) => L.circleMarker(p, { radius: 6, color: ink, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(LAYERS));
    const seen = visited();
    if (d.meet) {
      const m = L.marker([d.meet.lat, d.meet.lng], {
        icon: L.divIcon({ className: 'map-pin meet', html: I.moon(16), iconSize: [32, 32], iconAnchor: [16, 16] }),
        title: 'Oppmøte: ' + (meeting().name || ''), alt: 'Oppmøte', draggable: !!S.mapEdit && !S.mapDraw, keyboard: true
      }).addTo(LAYERS);
      m.bindTooltip('Oppmøte: ' + esc(meeting().name || ''), { direction: 'top', offset: [0, -14] });
      if (S.mapEdit) m.on('dragend', (e) => { const ll = e.target.getLatLng(); d.meet = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) }; });
    }
    (d.checkpoints || []).forEach((c, i) => {
      const done = !S.mapEdit && seen.has(c.id);
      const m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: 'map-pin cp' + (done ? ' done' : ''), html: done ? '✓' : String(i + 1), iconSize: [28, 28], iconAnchor: [14, 14] }),
        title: `${i + 1}. ${c.name}${done ? ' (besøkt)' : ''}`, alt: c.name, draggable: !!S.mapEdit && !S.mapDraw, keyboard: true
      }).addTo(LAYERS);
      m.bindTooltip(`${i + 1}. ${esc(c.name)}`, { direction: 'top', offset: [0, -12] });
      if (S.mapEdit) m.on('dragend', (e) => { const ll = e.target.getLatLng(); c.lat = +ll.lat.toFixed(6); c.lng = +ll.lng.toFixed(6); });
    });
    if (ME) ME.addTo(LAYERS);
  }
  function onMapClick(e) {
    if (!S.mapEdit) return;
    const ll = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (S.mapDraw) {
      S.mapDraft.area.push(ll); drawLayers();
      const c = $('#draw-count'); if (c) c.textContent = S.mapDraft.area.length;
    } else if (S.mapAdd) {
      const n = S.mapDraft.checkpoints.length + 1;
      S.mapDraft.checkpoints.push({ id: 'cp' + Date.now().toString(36), name: 'Sjekkpunkt ' + n, note: '', lat: ll[0], lng: ll[1] });
      S.mapAdd = false; render(); toast('Sjekkpunkt lagt til. Gi det et navn under kartet.');
    }
  }
  function readDraftInputs() {
    const d = S.mapDraft; if (!d) return;
    const nm = $('#map-name'); if (nm) d.name = nm.value.trim();
    d.checkpoints.forEach((c) => {
      const a = document.getElementById('cpn-' + c.id); const b = document.getElementById('cpt-' + c.id);
      if (a) c.name = a.value.trim() || c.name; if (b) c.note = b.value.trim();
    });
  }
  function updateRound() {
    const d = mapData(); const cps = (d && d.checkpoints) || []; const seen = visited();
    const done = cps.filter((c) => seen.has(c.id)).length;
    const rc = $('#round-count'); if (rc) rc.textContent = `${done} av ${cps.length}`;
    const rb = $('#round-bar'); if (rb) { rb.setAttribute('aria-label', `${done} av ${cps.length} sjekkpunkter besøkt`); rb.firstElementChild.style.width = (cps.length ? Math.round(done / cps.length * 100) : 0) + '%'; }
    drawLayers();
    if (cps.length && done === cps.length) toast('Alle sjekkpunktene er besøkt. Godt jobbet!');
  }

  // ------------------------------------------------------------------ tegning
  const VIEWS = { kart: viewKart, chat: viewChat, vakter: viewVakter, kalender: viewKalender, nyheter: viewNyheter, arrangement: viewArrangement, info: viewInfo, kontor: viewKontor };
  function render() {
    // Info handler alltid om eget lag; koordinatorer (ikke administrator) styrer bare eget lag i Kontor.
    if (hasTeams() && S.me && (route() === 'info' || route() === 'nyheter' || (route() === 'kontor' && !isAdmin()))) S.viewTeam = myTeamId();
    if (hasTeams()) syncTeamSettings();
    applyShifts(S.settings && S.settings.shifts);
    const app = $('#app');
    const r = route();
    const key = routeKey();
    const routeChanged = key !== S.lastRoute;
    // Ta vare på det brukeren har skrevet og hvor fokus er.
    const active = document.activeElement && document.activeElement.id;
    const kept = {};
    if (!routeChanged) app.querySelectorAll('input[id], textarea[id], select[id]').forEach((el) => {
      if (el.type === 'hidden' || el.dataset.change) return;
      kept[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? { c: el.checked } : { v: el.value };
    });
    const scrollY = window.scrollY;
    let html;
    if (!S.ready) html = '<p class="loading">Laster Safetly …</p>';
    else if (r === 'nodhjelp') html = viewSos();
    else if (S.recovery) html = viewRecovery();
    else if (!S.user) html = viewAuth();
    else if (!S.loaded) html = `<div class="wrap">${header()}<main id="innhold" tabindex="-1"><p class="loading">Henter vakter …</p></main></div>`;
    else if (!S.loadError && hasTeams() && S.me && !S.me.team_id) html = viewChooseTeam();
    else if (S.loadError) html = `<div class="wrap">${header()}<main id="innhold" tabindex="-1"><h1 tabindex="-1">Noe gikk galt</h1><p>${esc(S.loadError)}</p><button type="button" class="pill self-start" data-act="retry">Prøv igjen</button><button type="button" class="pill ghost self-start" data-act="logout">Logg ut</button></main></div>`;
    else {
      const inThread = r === 'chat' && routeParam() && routeParam() !== 'ny';
      html = `<div class="wrap">${header()}<main id="innhold" tabindex="-1"${inThread ? ' class="chat-main"' : ''}>${VIEWS[r]()}</main>${inThread ? '' : nav(r)}</div>`;
    }
    app.innerHTML = html;
    if (!routeChanged) {
      Object.keys(kept).forEach((id) => {
        const el = document.getElementById(id); if (!el) return;
        if ('c' in kept[id]) { if (!el.dataset.act) el.checked = kept[id].c; } else el.value = kept[id].v;
      });
      updateCounters();
      if (active) { const el = document.getElementById(active); if (el) el.focus({ preventScroll: true }); }
      window.scrollTo(0, scrollY);
    } else {
      S.lastRoute = key;
      if (r === 'chat') S.chatBottom = true;
      document.title = (TITLES[r] && S.user ? TITLES[r] + ' – ' : '') + 'Safetly';
      window.scrollTo(0, 0);
      const h1 = $('#app h1');
      if (h1 && S.ready && document.readyState === 'complete' && S.navigated) h1.focus({ preventScroll: true });
    }
    document.querySelectorAll('[data-autogrow]').forEach(autogrow);
    if (S.chatBottom && r === 'chat' && routeParam() && routeParam() !== 'ny') { window.scrollTo(0, document.documentElement.scrollHeight); }
    S.chatBottom = false;
    if (r === 'kart' && S.user && S.loaded) mountMap(); else if (MAP) { MAP.remove(); MAP = null; LAYERS = null; }
  }
  function autogrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 4, 160) + 'px'; }
  function updateCounters() {
    document.querySelectorAll('[data-count]').forEach((s) => { const t = document.getElementById(s.dataset.count); if (t) s.textContent = t.value.length; });
  }

  // ------------------------------------------------------------------ handlinger
  const actions = {
    'skip'(el, ev) { ev.preventDefault(); const m = $('#innhold'); if (m) { m.focus(); m.scrollIntoView(); } },
    'sel-day'(el) { S.selDay = el.dataset.date; render(); },
    'week'(el) {
      const dir = +el.dataset.dir;
      S.weekStart = dir === 0 ? weekStart(today()) : addDays(S.weekStart, dir * 7);
      S.selDay = dir === 0 ? iso(today()) : iso(S.weekStart);
      run(() => ensureRange(iso(S.weekStart), iso(addDays(S.weekStart, 6))));
    },
    'goto-need'(el) { const d = parseIso(el.dataset.date); S.weekStart = weekStart(d); S.selDay = el.dataset.date; render(); const t = $('#dagtittel'); if (t) t.scrollIntoView({ block: 'start' }); },
    'repeat'(el) { S.repeat = el.checked; },
    'book'(el) {
      const date = el.dataset.date; const slot = +el.dataset.slot;
      const tid = hasTeams() ? curTeamId() : undefined;
      const row = (d) => (tid ? { user_id: S.user.id, shift_date: d, slot, team_id: tid } : { user_id: S.user.id, shift_date: d, slot });
      const rows = [row(date)];
      if (S.repeat) for (let w = 1; w <= 4; w++) rows.push(row(iso(addDays(parseIso(date), 7 * w))));
      run(async () => {
        await api.book(rows);
        await ensureRange(S.range.from, rows[rows.length - 1].shift_date);
        await reloadBookings();
      }, S.repeat ? 'Booket, og gjentatt 4 uker frem.' : 'Du er booket på vakten.');
    },
    'unbook'(el) {
      if (!confirm(`Avbooke ${el.dataset.label || 'vakten'}?`)) return;
      run(async () => { await api.unbook(el.dataset.id); await reloadBookings(); }, 'Vakten er avbooket.');
    },
    'remove-booking'(el) {
      const b = S.bookings.find((x) => x.id === el.dataset.id); if (!b) return;
      if (!confirm(`Fjerne ${nameOf(b.user_id)} fra ${shiftLabel(b.shift_date, b.slot)}?`)) return;
      run(async () => { await api.unbook(b.id); await reloadBookings(); }, 'Fjernet fra vakten.');
    },
    'month'(el) {
      let { y, m } = S.cal; m += +el.dataset.dir; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
      S.cal = { y, m }; S.calSel = iso(new Date(y, m, 1));
      if (y === today().getFullYear() && m === today().getMonth()) S.calSel = iso(today());
      run(() => ensureRange(iso(addDays(new Date(y, m, 1), -7)), iso(new Date(y, m + 1, 7))));
    },
    'cal-sel'(el) { S.calSel = el.dataset.date; render(); },
    'toggle-news'() { S.newsForm = !S.newsForm; render(); },
    'map-focus'(el) {
      const d = mapData(); if (!MAP || !d) return;
      const p = el.dataset.meet ? [d.meet.lat, d.meet.lng] : [d.checkpoints[+el.dataset.i].lat, d.checkpoints[+el.dataset.i].lng];
      MAP.flyTo(p, Math.max(MAP.getZoom(), 17), { duration: 0.6 });
      $('#map').scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    'round-reset'() { saveVisited(new Set()); document.querySelectorAll('[data-change="visit"]').forEach((c) => { c.checked = false; }); updateRound(); },
    'locate'(el) {
      if (!navigator.geolocation) { toast('Telefonen din støtter ikke posisjon.', true); return; }
      el.disabled = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        el.disabled = false;
        const ll = [pos.coords.latitude, pos.coords.longitude];
        ME = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#2F6FD6', fillOpacity: 1 }).bindTooltip('Her er du');
        drawLayers(); if (MAP) MAP.flyTo(ll, 17, { duration: 0.6 });
      }, () => { el.disabled = false; toast('Fikk ikke tak i posisjonen. Sjekk at appen har lov til å bruke posisjon.', true); }, { enableHighAccuracy: true, timeout: 10000 });
    },
    'map-edit'() { S.mapDraft = JSON.parse(JSON.stringify(currentMap() || { name: (curTeam() || {}).name || '', area: [], checkpoints: [], meet: null })); S.mapDraft.checkpoints = S.mapDraft.checkpoints || []; S.mapDraft.area = S.mapDraft.area || []; S.mapEdit = true; S.mapAdd = false; S.mapDraw = false; render(); },
    'map-cancel'() { S.mapEdit = false; S.mapDraft = null; S.mapAdd = false; S.mapDraw = false; render(); },
    'map-add'() { readDraftInputs(); S.mapAdd = !S.mapAdd; S.mapDraw = false; render(); },
    'map-draw'() { readDraftInputs(); S.mapDraft.area = []; S.mapDraw = true; S.mapAdd = false; render(); },
    'map-draw-done'() {
      if (S.mapDraft.area.length < 3) { toast('Grensen trenger minst tre punkter.', true); return; }
      readDraftInputs(); S.mapDraw = false; render();
    },
    'cp-del'(el) { readDraftInputs(); const c = S.mapDraft.checkpoints[+el.dataset.i]; if (!confirm(`Slette sjekkpunktet «${c.name}»?`)) return; S.mapDraft.checkpoints.splice(+el.dataset.i, 1); render(); },
    'cp-up'(el) { readDraftInputs(); const i = +el.dataset.i; const a = S.mapDraft.checkpoints; [a[i - 1], a[i]] = [a[i], a[i - 1]]; render(); },
    'map-save'() {
      if (S.mapDraw) { toast('Trykk «Ferdig med grensen» først.', true); return; }
      readDraftInputs();
      const d = S.mapDraft;
      if (d.area.length < 3) { toast('Grensen trenger minst tre punkter.', true); return; }
      run(async () => {
        S.settings = await saveTeamSettings({ map: d });
        if (!S.settings || !S.settings.map) throw new Error('Kartet kunne ikke lagres. Er kart.sql kjørt i databasen?');
        S.mapEdit = false; S.mapDraft = null;
      }, 'Kartet er lagret for alle.');
    },
    'choose-team'(el) { run(async () => { await api.setTeam(S.user.id, el.dataset.id); await reloadTeamsAndProfiles(); S.viewTeam = myTeamId(); S.lastRoute = null; }, 'Velkommen i laget!'); },
    'shift-edit'() { const c = currentShifts(); S.shiftDraft = { slots: c.slots.map((x) => Object.assign({ key: slotKey() }, x)), min: c.min, days: c.days.slice() }; render(); const f = $('[id^="sl-name-"]'); if (f) f.focus(); },
    'shift-cancel'() { S.shiftDraft = null; render(); },
    'slot-add'() {
      readShiftInputs(); const d = S.shiftDraft; const last = d.slots[d.slots.length - 1];
      d.slots.push({ key: slotKey(), name: `Vakt ${d.slots.length + 1}`, start: last ? last.end : '21:00', end: '' }); render();
      const n = document.getElementById('sl-end-' + d.slots[d.slots.length - 1].key); if (n) n.focus();
    },
    'slot-del'(el) {
      readShiftInputs(); const d = S.shiftDraft; const i = d.slots.findIndex((x) => x.key === el.dataset.key);
      if (i >= 0 && confirm(`Fjerne «${d.slots[i].name}»?`)) { d.slots.splice(i, 1); render(); }
    },
    'map-default'() {
      if (!confirm('Gå tilbake til standardkartet? Endringene dere har lagret forsvinner.')) return;
      run(async () => { S.settings = await saveTeamSettings({ map: null }); S.mapEdit = false; S.mapDraft = null; }, 'Standardkartet brukes igjen.');
    },
    'toggle-meeting'() { S.meetingForm = !S.meetingForm; render(); const f = $('#m-name'); if (f) f.focus(); },
    'del-news'(el) { if (!confirm('Slette nyheten?')) return; run(async () => { await api.deleteNews(el.dataset.id); S.news = await api.news(); }, 'Nyheten er slettet.'); },
    'toggle-event'() { S.eventForm = !S.eventForm; render(); if (S.eventForm) { const f = $('#e-title'); if (f) f.focus(); } },
    'del-event'(el) { if (!confirm('Slette arrangementet?')) return; run(async () => { await api.deleteEvent(el.dataset.id); await reloadEvents(); }, 'Arrangementet er slettet.'); },
    'attend'(el) {
      const id = el.dataset.id; const going = el.getAttribute('aria-pressed') === 'true';
      run(async () => { if (going) await api.unattend(id); else await api.attend(id); S.attendees = await api.attendees(); }, going ? 'Du er meldt av.' : 'Så fint! Du er påmeldt.');
    },
    'pref-big'(el) { S.big = el.checked; savePrefs(); applyPrefs(); },
    'theme'(el) { S.theme = el.dataset.v; savePrefs(); applyPrefs(); render(); },
    'logout'() { run(async () => { await pushOff(true); await api.signOut(); }); },
    'push-on'() { run(pushOn); },
    'push-off'() { run(() => pushOff(false), 'Varsler er slått av på denne telefonen.'); },
    'push-test'() { run(async () => { const r = await api.notify({ type: 'test' }); if (!r || !r.sent) throw new Error('Fant ingen telefon å sende til. Prøv å slå varsler av og på igjen.'); }, 'Testvarsel sendt. Det kommer om noen sekunder.'); },
    'retry'() { S.loaded = false; render(); run(loadAll); },
    'kweek'(el) { S.kontorWeek = addDays(S.kontorWeek, 7 * +el.dataset.dir); run(() => ensureRange(iso(S.kontorWeek), iso(addDays(S.kontorWeek, 7)))); },
    'csv'() { run(exportCsv); },
    'auth-mode'(el) { S.authMode = el.dataset.v; S.resetSent = false; S.confirmSent = false; S.lastRoute = null; render(); }
  };
  async function reloadEvents() {
    const [ev, att] = await Promise.all([api.events(iso(addDays(today(), -60))), api.attendees()]);
    S.events = ev; S.attendees = att;
  }

  const forms = {
    async login(f) { await api.signIn(f.email.value.trim(), f.password.value); },
    async signup(f) {
      const r = await api.signUp({ email: f.email.value.trim(), password: f.password.value, name: f.name.value.trim(), phone: f.phone.value.trim() });
      if (r.needsConfirm) { S.confirmSent = true; S.lastRoute = null; }
    },
    async reset(f) { await api.resetPassword(f.email.value.trim()); S.resetSent = true; S.lastRoute = null; },
    async newpass(f) { await api.updatePassword(f.password.value); S.recovery = false; S.lastRoute = null; toast('Passordet er endret.'); await startSession(); },
    async report(f) {
      const [date, slot] = f.shift.value.split('|');
      await api.addReport({ shift_date: date, slot: +slot, mood: f.mood.value, note: f.note.value.trim() });
      f.reset();
      const [reports, mine] = await Promise.all([api.reports(), api.myReports()]); S.reports = reports; S.myReports = mine;
      toast('Takk! Rapporten vises under vaktrapporter.');
    },
    async news(f) {
      const item = { title: f.title.value.trim(), body: f.body.value.trim() };
      if (hasTeams()) item.team_id = f.team ? (f.team.value || null) : myTeamId();
      const created = await api.addNews(item);
      if (created && created.id) api.notify({ type: 'news', id: created.id }).catch(() => {});
      f.reset(); S.newsForm = false; S.news = await api.news(); toast('Nyheten er lagt ut.');
    },
    async event(f) {
      const time = normTime(f.time.value);
      if (!TIME_RE.test(time)) throw new Error('Skriv tiden som TT:MM, for eksempel 18:30.');
      await api.addEvent({ title: f.title.value.trim(), event_date: f.date.value, event_time: time, place: f.place.value.trim(), description: f.description.value.trim() });
      f.reset(); S.eventForm = false; await reloadEvents(); toast('Arrangementet er opprettet.');
    },
    async chat(f) {
      const body = f.body.value.trim(); if (!body) return;
      const thread = f.dataset.thread;
      const msg = await api.sendMessage(thread === 'alle' ? null : thread, body);
      if (msg && msg.id) api.notify({ type: 'message', id: msg.id }).catch(() => {});
      f.body.value = '';
      if (msg && !S.messages.some((x) => x.id === msg.id)) S.messages.push(msg);
      S.reads[thread] = new Date().toISOString(); api.markRead(thread).catch(() => {});
      S.chatBottom = true;
    },
    async 'team-new'(f) {
      const name = f.name.value.trim(); if (!name) return;
      const t = await api.createTeam(name);
      f.reset(); await reloadTeamsAndProfiles(); S.viewTeam = t.id;
      toast(`Laget «${name}» er laget. Sett vakttider, oppmøtested og kart for det.`);
    },
    async 'team-rename'(f) {
      const name = f.name.value.trim(); if (!name) return;
      await api.updateTeam(curTeamId(), { name }); await reloadTeamsAndProfiles(); toast('Navnet er endret.');
    },
    async shifts() {
      readShiftInputs();
      const d = S.shiftDraft;
      const cfg = { slots: d.slots.map((x) => ({ name: x.name || 'Vakt', start: x.start, end: x.end })), min: d.min, days: d.days.slice().sort() };
      if (!cfg.days.length) throw new Error('Velg minst én dag med vakt.');
      if (cfg.slots.some((x) => !TIME_RE.test(x.start) || !TIME_RE.test(x.end))) throw new Error('Fyll inn klokkeslett for alle vaktene (TT:MM).');
      if (cfg.slots.some((x) => x.start === x.end)) throw new Error('En vakt kan ikke starte og slutte på samme klokkeslett.');
      S.settings = await saveTeamSettings({ shifts: cfg });
      if (!S.settings || !validShifts(S.settings.shifts)) throw new Error('Vakttidene kunne ikke lagres. Er vakttider.sql kjørt i databasen?');
      S.shiftDraft = null;
      toast('Vakttidene er lagret for alle.');
    },
    async meeting(f) {
      S.settings = await saveTeamSettings({ meeting_name: f.mname.value.trim(), meeting_address: f.maddress.value.trim(), meeting_note: f.mnote.value.trim() });
      S.meetingForm = false;
      toast('Oppmøtestedet er lagret.');
    },
    async profile(f) {
      const name = f.name.value.trim(); const phone = f.phone.value.trim();
      if (name !== S.me.full_name) await api.updateName(name);
      if (phone !== (S.phones[S.user.id] || '')) await api.updatePhone(phone);
      const [profiles, phones, contacts] = await Promise.all([api.profiles(), api.phones(), api.contacts()]);
      S.profiles = {}; profiles.forEach((p) => { S.profiles[p.id] = p; }); S.me = S.profiles[S.user.id];
      S.phones = {}; phones.forEach((p) => { S.phones[p.user_id] = p.phone; }); S.contacts = contacts;
      toast('Profilen er lagret.');
    }
  };
  const changes = {
    'team-view'(el) { S.viewTeam = el.value; S.mapView = null; S.shiftDraft = null; S.mapEdit = false; render(); },
    'my-team'(el) {
      const t = teamById(el.value); const old = myTeamId();
      const warn = isCoordOf(old) && !isAdmin() ? ' Du mister koordinatorrollen i det gamle laget.' : '';
      if (!confirm(`Bytte til laget «${t.name}»? Vaktene du har booket blir liggende i det gamle laget.${warn}`)) { el.value = old; return; }
      run(async () => { await api.setTeam(S.user.id, el.value); await reloadTeamsAndProfiles(); S.viewTeam = myTeamId(); }, 'Du har byttet lag.');
    },
    'person-team'(el) {
      const p = S.profiles[el.dataset.id]; const t = teamById(el.value);
      if (!confirm(`Flytte ${p.full_name} til «${t.name}»?`)) { el.value = p.team_id || ''; return; }
      run(async () => { await api.setTeam(p.id, el.value); await reloadTeamsAndProfiles(); }, 'Flyttet.');
    },
    notify(el) {
      const v = Object.assign({}, S.notify, { [el.dataset.key]: el.checked }); S.notify = v;
      api.updateNotify(v).then(() => toast('Lagret.')).catch((e) => { toast(errText(e), true); });
    },
    visit(el) {
      const set = visited(); if (el.checked) set.add(el.dataset.id); else set.delete(el.dataset.id);
      saveVisited(set); updateRound();
    },
    role(el) {
      const id = el.dataset.id; const role = el.value; const p = S.profiles[id];
      if (!confirm(`Gjøre ${p.full_name} til ${role}?`)) { el.value = p.role; return; }
      run(async () => {
        await api.setRole(id, role);
        const [profiles, phones, contacts] = await Promise.all([api.profiles(), api.phones(), api.contacts()]);
        S.profiles = {}; profiles.forEach((x) => { S.profiles[x.id] = x; }); S.me = S.profiles[S.user.id];
        S.phones = {}; phones.forEach((x) => { S.phones[x.user_id] = x.phone; }); S.contacts = contacts;
      }, 'Rollen er endret.');
    }
  };

  // ------------------------------------------------------------------ CSV
  function csvCell(v) { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  async function exportCsv() {
    const start = weekStart(today()); const end = addDays(start, 27);
    await ensureRange(iso(start), iso(end));
    const rows = [['Dato', 'Ukedag', 'Uke', 'Vakt', 'Start', 'Slutt', 'Påmeldt', 'Status', 'Navn', 'Telefon']];
    for (let i = 0; i < 28; i++) {
      const date = addDays(start, i); const d = iso(date);
      slotsOn(d).forEach((slot) => {
        const list = shiftPeople(d, slot);
        const names = list.map((b) => (S.profiles[b.user_id] || {}).full_name || '');
        const phones = list.map((b) => S.phones[b.user_id] || '');
        rows.push([`${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`, cap(DAYS[dow(date)]), isoWeek(date), slotInfo(slot).name,
          slotInfo(slot).start, slotInfo(slot).end, list.length, list.length >= MIN_PER_SHIFT ? 'Dekket' : 'Trenger flere', names.join(', '), phones.join(', ')]);
      });
    }
    const text = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
    const name = `safetly-vaktliste-uke-${isoWeek(start)}-${isoWeek(end)}.csv`;
    await saveFile(name, text, 'text/csv;charset=utf-8');
    toast('Vaktlisten er klar: ' + name);
  }
  async function saveFile(name, text, mime) {
    const P = window.Capacitor && window.Capacitor.Plugins;
    if (isNative() && P && P.Filesystem && P.Share) {
      const r = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: name, url: r.uri, dialogTitle: 'Del vaktlisten' });
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ------------------------------------------------------------------ hendelser
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, ev);
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.act && el.tagName === 'INPUT' && actions[el.dataset.act]) actions[el.dataset.act](el, ev);
    if (el.dataset && el.dataset.change && changes[el.dataset.change]) changes[el.dataset.change](el, ev);
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t.hasAttribute) return;
    if (t.hasAttribute('data-counter')) updateCounters();
    if (t.hasAttribute('data-autogrow')) autogrow(t);
    if (t.id === 'chat-search') {
      const q = t.value.trim().toLowerCase(); let shown = 0;
      document.querySelectorAll('#pick-list li').forEach((li) => { const hit = !q || li.dataset.name.includes(q); li.hidden = !hit; if (hit) shown++; });
      const e = $('#pick-empty'); if (e) e.hidden = shown > 0;
    }
  });
  // Ctrl/Cmd + Enter sender meldingen.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && ev.target.hasAttribute && ev.target.hasAttribute('data-autogrow')) {
      ev.preventDefault(); const f = ev.target.closest('form'); if (f) f.requestSubmit();
    }
  });
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    const fn = forms[f.dataset.form];
    if (fn) run(() => fn(f));
  });
  window.addEventListener('hashchange', () => {
    S.navigated = true;
    const r = route();
    if (r !== 'nodhjelp') S.backRoute = '#/' + r;
    render();
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !S.user || !S.loaded || S.busy) return;
    try {
      await loadAll();
      const a = document.activeElement;
      if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
    } catch (e) { /* prøver igjen neste gang */ }
  });

  // ------------------------------------------------------------------ oppstart
  let stopLive = null; let pollTimer = null;
  async function startSession() {
    S.loaded = false; render();
    try { await loadAll(); } catch (e) { console.error(e); S.loaded = true; S.loadError = errText(e); }
    render();
    syncPush().catch(() => {});
    if (stopLive) stopLive();
    try {
      const a = api.onMessage(onIncoming); const b = api.onRead(onReadUpdate);
      stopLive = () => { a(); b(); };
    } catch (e) { stopLive = null; }
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!S.user || !S.loaded || document.visibilityState !== 'visible' || S.busy) return;
      try {
        const msgs = await api.messages();
        const fresh = msgs.filter((m) => !S.messages.some((x) => x.id === m.id));
        const before = JSON.stringify([S.peerReads, S.alleReads]);
        await loadReceipts();
        const changed = before !== JSON.stringify([S.peerReads, S.alleReads]);
        if (fresh.length || msgs.length !== S.messages.length) { S.messages = msgs; fresh.forEach((m) => { if (route() === 'chat' && routeParam() === threadOf(m)) S.chatBottom = true; }); render(); }
        else if (changed && route() === 'chat') render();
      } catch (e) { /* prøver igjen */ }
    }, 20000);
  }
  async function boot() {
    applyPrefs();
    if (!location.hash.startsWith('#/') && !/access_token|type=recovery|error_description/.test(location.hash)) history.replaceState(null, '', '#/vakter');
    S.backRoute = route() === 'nodhjelp' ? '#/vakter' : '#/' + route();
    api.onAuth((user, event) => {
      if (event === 'PASSWORD_RECOVERY') { S.recovery = true; S.user = user; render(); return; }
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { S.user = user; return; }
      const changed = (user && user.id) !== (S.user && S.user.id);
      S.user = user;
      if (!S.ready || !changed) return;
      S.lastRoute = null;
      if (user) { history.replaceState(null, '', '#/vakter'); S.backRoute = '#/vakter'; S.weekStart = weekStart(today()); S.selDay = iso(today()); startSession(); } else { S.loaded = false; S.me = null; render(); }
    });
    try { S.user = await api.getUser(); } catch (e) { S.user = null; }
    S.ready = true;
    if (/type=recovery/.test(location.hash)) S.recovery = true;
    if (S.user && !S.recovery) await startSession(); else render();
    if ('serviceWorker' in navigator && !isNative() && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => { swReg = reg; }).catch(() => { /* valgfritt */ });
    }
  }
  // ------------------------------------------------------------------ automatiske oppdateringer
  // Ser etter ny versjon ved oppstart, når appen åpnes igjen og hvert 10. minutt.
  // Oppdaterer av seg selv når det er trygt; ellers vises en knapp.
  let swReg = null; let newVersion = null;
  const APP_VERSION = window.SAFETLY_VERSION || '';
  const versionsOn = /^[0-9a-z]{4,}$/i.test(APP_VERSION) && location.protocol.startsWith('http');
  function busyEditing() {
    if (S.mapEdit || S.shiftDraft || S.eventForm || S.newsForm || S.meetingForm) return true;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return true;
    return [...document.querySelectorAll('#app textarea, #app input[type="text"], #app input:not([type])')].some((el) => el.value && el.value.trim() && !el.readOnly && el.id !== 'chat-search');
  }
  function reloadToNew(v) {
    try { sessionStorage.setItem('safetly-oppdatert', v); } catch (e) { /* tom */ }
    toast('Oppdaterer Safetly …');
    setTimeout(() => location.reload(), 700);
  }
  function showUpdateBar() {
    if (document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>Ny versjon av Safetly er klar.</span><button type="button" class="pill sm">Oppdater</button>';
    bar.querySelector('button').addEventListener('click', () => reloadToNew(newVersion));
    document.body.appendChild(bar);
  }
  async function checkVersion() {
    if (!versionsOn || document.visibilityState !== 'visible') return;
    try {
      if (swReg) swReg.update().catch(() => {});
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = String((await r.json()).version || '');
      if (!v || v === APP_VERSION) return;
      let tried = ''; try { tried = sessionStorage.getItem('safetly-oppdatert') || ''; } catch (e) { /* tom */ }
      newVersion = v;
      if (tried === v) { showUpdateBar(); return; } // unngå at den laster om igjen og igjen
      if (busyEditing()) showUpdateBar(); else reloadToNew(v);
    } catch (e) { /* offline: prøver igjen senere */ }
  }
  if (versionsOn) {
    setTimeout(checkVersion, 4000);
    setInterval(checkVersion, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
    window.addEventListener('focus', checkVersion);
  }

  boot();
})();
