/* Safetly – natteravner i nabolaget.
 * Ren JavaScript uten byggesteg. Bruker Supabase når config.js har nøkler, ellers demomodus (localStorage).
 */
(function () {
  'use strict';

  const CFG = window.SAFETLY_CONFIG || {};
  const MIN_PER_SHIFT = 2;
  const SLOTS = {
    1: { start: '21:00', end: '23:00', name: 'Kveldsvakt' },
    2: { start: '23:00', end: '01:00', name: 'Nattvakt' }
  };
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
  function shiftStart(date, slot) { const d = parseIso(date); d.setHours(slot === 1 ? 21 : 23, 0, 0, 0); return d; }
  function shiftEnd(date, slot) { const d = parseIso(date); if (slot === 1) d.setHours(23, 0, 0, 0); else { d.setDate(d.getDate() + 1); d.setHours(1, 0, 0, 0); } return d; }
  const shiftLabel = (date, slot) => `${cap(fmtDay(date))}, ${SLOTS[slot].start}–${SLOTS[slot].end}`;
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
    pen: () => svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', { s: 20 })
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
      async profiles() { return ok(await sb.from('profiles').select('id,full_name,role,created_at').order('full_name')); },
      async phones() { return ok(await sb.from('private_contacts').select('user_id,phone')); },
      async contacts() { return ok(await sb.rpc('coordinator_contacts')); },
      async bookings(from, to) { return ok(await sb.from('bookings').select('id,user_id,shift_date,slot').gte('shift_date', from).lte('shift_date', to)); },
      async myBookings() { return ok(await sb.from('bookings').select('id,shift_date,slot').eq('user_id', userId)); },
      async book(rows) { ok(await sb.from('bookings').upsert(rows, { onConflict: 'user_id,shift_date,slot', ignoreDuplicates: true })); },
      async unbook(id) { ok(await sb.from('bookings').delete().eq('id', id)); },
      async news() { return ok(await sb.from('news').select('id,author_id,title,body,created_at').order('created_at', { ascending: false }).limit(30)); },
      async addNews(n) { ok(await sb.from('news').insert({ author_id: userId, title: n.title, body: n.body })); },
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
      async settings() { return ok(await sb.from('settings').select('meeting_name,meeting_address,meeting_note').eq('id', 1).maybeSingle()); },
      async updateSettings(v) {
        const rows = ok(await sb.from('settings').update(Object.assign({ updated_at: new Date().toISOString() }, v)).eq('id', 1).select('id'));
        if (!rows || !rows.length) throw new Error('permission denied');
      },
      async setRole(id, role) { ok(await sb.from('profiles').update({ role }).eq('id', id)); }
    };
  }

  // ------------------------------------------------------------------ datalag: demomodus (lokalt)
  function localApi() {
    const KEY = 'safetly-demo-v1';
    let db = load();
    const listeners = [];
    function load() {
      try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.v === 1) return x; } catch (e) { /* tom */ }
      return seed();
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* privat modus */ } }
    function seed() {
      const people = [
        ['Kari Nilsen', '412 34 567', 'koordinator'], ['Ahmed Said', '934 56 789', 'forelder'], ['Lene Berg', '977 10 204', 'forelder'],
        ['Tor Eide', '908 44 120', 'forelder'], ['Marte Vik', '473 98 001', 'forelder'], ['Jonas Lie', '416 22 870', 'forelder'], ['Sara Khan', '455 67 890', 'forelder']
      ];
      const users = people.map((p, i) => ({ id: 'demo-' + i, email: '', password: null, full_name: p[0], phone: p[1], role: p[2], seed: true, created_at: new Date(2026, 7, 20 + i).toISOString() }));
      const t = today();
      const bookings = [];
      for (let d = -14; d <= 28; d++) {
        const date = iso(addDays(t, d));
        [1, 2].forEach((slot) => {
          const n = Math.abs((d * 7 + slot * 5 + 3) % 4); // 0–3 personer
          for (let k = 0; k < n; k++) bookings.push({ id: uid(), user_id: users[(Math.abs(d) * 3 + slot * 2 + k) % users.length].id, shift_date: date, slot });
        });
      }
      const uniq = {}; const bk = bookings.filter((b) => { const k = b.user_id + b.shift_date + b.slot; if (uniq[k]) return false; uniq[k] = 1; return true; });
      const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
      return {
        v: 1, session: null, users, bookings: bk,
        news: [
          { id: uid(), author_id: 'demo-0', title: 'Vi trenger flere voksne i helgen', body: 'Flere vakter mangler folk denne uka. Ta gjerne en ekstra vakt hvis du kan.', created_at: ago(30) },
          { id: uid(), author_id: 'demo-0', title: 'Nye refleksvester og lykter', body: 'Kassen bak disken på oppmøtestedet er fylt opp. Legg alt tilbake etter vakt.', created_at: ago(80) }
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
        attendees: [['ev1', 'demo-0'], ['ev1', 'demo-3'], ['ev1', 'demo-4'], ['ev2', 'demo-1'], ['ev3', 'demo-5']].map(([e, u]) => ({ event_id: e, user_id: u }))
      };
    }
    const me = () => db.users.find((u) => u.id === db.session);
    const need = () => { const m = me(); if (!m) throw new Error('Du er ikke logget inn'); return m; };
    const coord = () => { const m = need(); if (m.role !== 'koordinator') throw new Error('Bare koordinatorer kan gjøre dette'); return m; };
    const user = () => { const m = me(); return m ? { id: m.id, email: m.email } : null; };
    const emit = (ev) => listeners.forEach((cb) => cb(user(), ev));
    return {
      mode: 'demo',
      async getUser() { return user(); },
      onAuth(cb) { listeners.push(cb); },
      async signUp({ email, password, name, phone }) {
        email = email.trim().toLowerCase();
        if (db.users.some((u) => u.email === email)) throw new Error('User already registered');
        if (password.length < 6) throw new Error('Password should be at least 6 characters');
        const first = !db.users.some((u) => !u.seed);
        const u = { id: uid(), email, password, full_name: name, phone, role: first ? 'koordinator' : 'forelder', created_at: new Date().toISOString() };
        db.users.push(u); db.session = u.id; save(); emit('SIGNED_IN');
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
      async profiles() { return db.users.map((u) => ({ id: u.id, full_name: u.full_name, role: u.role, created_at: u.created_at })); },
      async phones() { const m = need(); return db.users.filter((u) => m.role === 'koordinator' || u.id === m.id).map((u) => ({ user_id: u.id, phone: u.phone || '' })); },
      async contacts() { need(); return db.users.filter((u) => u.role === 'koordinator').map((u) => ({ full_name: u.full_name, phone: u.phone || '' })); },
      async bookings(from, to) { need(); return db.bookings.filter((b) => b.shift_date >= from && b.shift_date <= to); },
      async myBookings() { const m = need(); return db.bookings.filter((b) => b.user_id === m.id); },
      async book(rows) {
        const m = need(); const min = iso(addDays(today(), -1));
        rows.forEach((r) => {
          if (r.user_id !== m.id) throw new Error('Du kan bare booke deg selv');
          if (r.shift_date < min) throw new Error('Vakten er passert');
          if (!db.bookings.some((b) => b.user_id === r.user_id && b.shift_date === r.shift_date && b.slot === r.slot)) db.bookings.push(Object.assign({ id: uid() }, r));
        });
        save();
      },
      async unbook(id) {
        const m = need(); const b = db.bookings.find((x) => x.id === id);
        if (!b) return;
        if (b.user_id !== m.id && m.role !== 'koordinator') throw new Error('Ingen tilgang');
        db.bookings = db.bookings.filter((x) => x.id !== id); save();
      },
      async news() { need(); return db.news.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)); },
      async addNews(n) { const m = coord(); db.news.push({ id: uid(), author_id: m.id, title: n.title, body: n.body, created_at: new Date().toISOString() }); save(); },
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
        coord(); const u = db.users.find((x) => x.id === id);
        if (!u) return;
        if (u.role === 'koordinator' && role !== 'koordinator' && db.users.filter((x) => x.role === 'koordinator').length <= 1) throw new Error('Det må være minst én koordinator');
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
    eventForm: false, newsForm: false, meetingForm: false, settings: null, kontorWeek: weekStart(today()),
    theme: prefs.theme || 'auto', big: !!prefs.big,
    busy: false, lastRoute: null, backRoute: '#/vakter'
  };
  function savePrefs() { try { localStorage.setItem('safetly-prefs', JSON.stringify({ theme: S.theme, big: S.big })); } catch (e) { /* tom */ } }
  function applyPrefs() {
    const root = document.documentElement;
    root.dataset.theme = S.theme;
    root.classList.toggle('big', S.big);
  }

  const isCoord = () => !!(S.me && S.me.role === 'koordinator');
  function meeting() {
    const st = S.settings; const cf = CFG.meetingPlace || {};
    if (st && (st.meeting_name || st.meeting_address || st.meeting_note)) return { name: st.meeting_name, address: st.meeting_address, note: st.meeting_note };
    return { name: cf.name || '', address: cf.address || '', note: cf.note || '' };
  }
  const nameOf = (id) => (id === (S.user && S.user.id) ? 'Deg' : shortName((S.profiles[id] || {}).full_name));
  function shiftPeople(date, slot) { return S.bookings.filter((b) => b.shift_date === date && b.slot === slot); }
  function myBooking(date, slot) { return S.bookings.find((b) => b.shift_date === date && b.slot === slot && b.user_id === S.user.id); }
  function covered(date) { return shiftPeople(date, 1).length >= MIN_PER_SHIFT && shiftPeople(date, 2).length >= MIN_PER_SHIFT; }

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
    try { S.settings = await api.settings(); } catch (e) { S.settings = null; } // før settings-tabellen finnes
    S.contacts = contacts || []; S.bookings = bookings; S.myBookings = mine; S.news = news; S.reports = reports;
    S.myReports = myReports; S.events = events; S.attendees = attendees;
    S.me = S.profiles[S.user.id] || null;
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
      [/duplicate key/i, 'Dette er allerede registrert.']
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
  const TITLES = { vakter: 'Vakter', kalender: 'Kalender', nyheter: 'Ukas nyheter', arrangement: 'Arrangement', info: 'Info', kontor: 'Kontor', nodhjelp: 'Nødhjelp' };
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const name = h.split('/')[0];
    return TITLES[name] ? name : 'vakter';
  }

  // ------------------------------------------------------------------ felles byggeklosser
  function header() {
    return `<header class="top">
      <a class="brand" href="#/vakter" aria-label="Safetly, til Vakter"><span class="logo">${I.moon()}</span><span class="brand-name" aria-hidden="true">Safetly</span></a>
      <a class="sos" href="#/nodhjelp">${I.phone()}Nødhjelp</a>
    </header>${api.mode === 'demo' ? '<p class="demo-banner">Demomodus: data lagres bare på denne enheten. Legg inn Supabase-nøkler i config.js for å dele med nabolaget.</p>' : ''}`;
  }
  function nav(current) {
    const active = current === 'kontor' ? 'info' : current;
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
      [1, 2].forEach((slot) => { if (shiftEnd(date, slot) > now && shiftPeople(date, slot).length < MIN_PER_SHIFT) out.push({ date, slot }); });
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

    if (next) {
      const partners = shiftPeople(next.shift_date, next.slot).filter((b) => b.user_id !== S.user.id).map((b) => nameOf(b.user_id));
      const isToday = next.shift_date === t;
      html += `<section class="card blue" aria-labelledby="neste">
        <h2 id="neste" class="eyebrow">Din neste vakt</h2>
        <div class="stack-s"><p class="big-num">${SLOTS[next.slot].start}–${SLOTS[next.slot].end}</p><p style="font-weight:600;font-size:1.0625rem">${isToday ? 'I kveld · ' : ''}${cap(fmtDay(next.shift_date))}</p></div>
        <p class="muted">${partners.length ? `Du går sammen med <b style="color:var(--ink)">${esc(partners.join(' og '))}</b>` : '<b style="color:var(--ink)">Ingen andre er påmeldt ennå.</b>'} · Oppmøte: ${esc(meeting().name || 'se Info')}</p>
        <div class="wrap-row"><a class="pill sm" href="#/info">Slik går en vakt</a><button type="button" class="pill ghost sm" data-act="unbook" data-id="${next.id}" data-label="${esc(shiftLabel(next.shift_date, next.slot))}">Avbook</button></div>
      </section>`;
    }
    if (pending.length) {
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
        const ok = covered(d); const dd = parseIso(d);
        return `<button type="button" id="day-${d}" class="day${d === t ? ' today' : ''}" data-act="sel-day" data-date="${d}" aria-pressed="${d === S.selDay}"
          aria-label="${cap(fmtDay(d))}: ${ok ? 'dekket' : 'trenger flere'}${d === t ? ', i dag' : ''}"><span>${DAYS_SHORT[i]}</span><span class="num">${dd.getDate()}</span><span class="mark ${ok ? 'ok' : 'warn'}"></span></button>`;
      }).join('')}</div>
      <ul class="legend" aria-hidden="true"><li><span class="mark ok"></span>Dekket</li><li><span class="mark warn"></span>Trenger flere</li><li>Minst ${MIN_PER_SHIFT} voksne per vakt</li></ul>
    </section>`;

    const d = S.selDay;
    html += `<section class="stack" aria-labelledby="dagtittel"><h2 id="dagtittel">${cap(fmtDay(d))}${d === t ? ' · i dag' : ''}</h2><div class="timeline">`;
    [1, 2].forEach((slot) => {
      const list = shiftPeople(d, slot);
      html += `<div class="tl-item"><div class="tl-time" aria-hidden="true"><b>${SLOTS[slot].start}</b><span class="tl-line"></span><span>${SLOTS[slot].end}</span></div>
        <article class="card ${slot === 1 ? 'blue' : 'yellow'}" style="padding:1.125rem;border-radius:1.75rem" aria-label="${SLOTS[slot].name} ${SLOTS[slot].start} til ${SLOTS[slot].end}">
          <div class="between"><h3>${SLOTS[slot].name}</h3>${statusBadge(list.length)}</div>
          <p class="small muted">Går sammen (${list.length} av minst ${MIN_PER_SHIFT})</p>
          <ul class="people">${personChips(list)}</ul>
          ${bookButtons(d, slot)}
        </article></div>`;
    });
    html += `</div><label class="check-row"><input type="checkbox" id="repeat" data-act="repeat"${S.repeat ? ' checked' : ''}> Gjenta nye bookinger 4 uker frem</label></section>`;
    if (isCoord()) html += `<a class="card ink tight" href="#/kontor" style="text-decoration:none;flex-direction:row;align-items:center;justify-content:space-between;min-height:3.5rem"><b>Kontor for koordinatorer</b>${I.right()}</a>`;
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
      const ok = covered(d); const ev = evByDate[d];
      const past = d < t;
      cells += `<button type="button" id="c-${d}" class="cell${d === t ? ' today' : ''}${past ? ' past' : ''}" data-act="cal-sel" data-date="${d}" aria-pressed="${d === S.calSel}"
        aria-label="${cap(fmtDay(d))}: ${ok ? 'dekket' : 'trenger flere'}${ev ? ', ' + ev.length + ' arrangement' : ''}${d === t ? ', i dag' : ''}">
        <span>${n}</span><span class="dots" aria-hidden="true"><span class="mark ${ok ? 'ok' : 'warn'}"></span>${ev ? '<span class="mark event"></span>' : ''}</span></button>`;
    }
    const sel = S.calSel;
    let panel = `<section class="stack" aria-labelledby="valgt"><h2 id="valgt">${cap(fmtDay(sel))}${sel === t ? ' · i dag' : ''}</h2>`;
    [1, 2].forEach((slot) => {
      const list = shiftPeople(sel, slot);
      panel += `<div class="card ${slot === 1 ? 'blue' : 'yellow'} tight"><div class="between"><p style="font-weight:700;font-size:1.0625rem">${SLOTS[slot].start}–${SLOTS[slot].end}</p>${statusBadge(list.length)}</div>
        <ul class="people">${personChips(list)}</ul>${bookButtons(sel, slot, true)}</div>`;
    });
    (evByDate[sel] || []).forEach((e) => {
      panel += `<div class="card pink tight"><p class="eyebrow">Arrangement</p><p style="font-weight:700;font-size:1.0625rem">${esc(e.title)}</p>
        <p class="small muted">kl. ${esc(fmtTime(e.event_time))} · ${esc(e.place)}</p><a class="pill ghost sm self-start" href="#/arrangement">Se arrangement</a></div>`;
    });
    panel += '</section>';
    return `<div class="between"><h1 tabindex="-1">${cap(MONTHS[m])} ${y}</h1>
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
    if (isCoord()) html += `<button type="button" class="pill sm" data-act="toggle-news" aria-expanded="${S.newsForm}" aria-label="Skriv ny nyhet">${I.plus()}Ny</button>`;
    html += '</div>';
    if (isCoord() && S.newsForm) {
      html += `<form class="card" data-form="news" aria-label="Ny nyhet">
        <label class="field">Tittel<input id="n-title" name="title" required maxlength="120"></label>
        <label class="field">Tekst<textarea id="n-body" name="body" required maxlength="2000" rows="4"></textarea></label>
        <div class="wrap-row"><button type="submit" class="pill">Legg ut</button><button type="button" class="pill ghost" data-act="toggle-news">Avbryt</button></div></form>`;
    }
    if (!S.news.length) html += '<p class="empty">Ingen nyheter ennå.</p>';
    S.news.forEach((n, i) => {
      const a = S.profiles[n.author_id] || {};
      html += `<article class="card ${i % 2 ? 'yellow' : 'blue'}"><p class="small muted"><b style="color:var(--ink)">${esc(a.full_name || 'Koordinator')}</b> · koordinator · ${esc(fmtStamp(n.created_at))}</p>
        <h3>${esc(n.title)}</h3><p class="pre">${esc(n.body)}</p>
        ${isCoord() ? `<button type="button" class="link-btn self-start" data-act="del-news" data-id="${n.id}">Slett nyheten</button>` : ''}</article>`;
    });
    html += '</section><section class="stack" aria-labelledby="rapporter"><h2 id="rapporter">Vaktrapporter</h2>';
    if (!S.reports.length) html += '<p class="empty">Ingen vaktrapporter ennå.</p>';
    S.reports.forEach((r) => {
      html += `<article class="card tight"><div class="between"><p class="small"><b>${esc(cap(fmtShort(r.shift_date)))} · ${SLOTS[r.slot].start}–${SLOTS[r.slot].end}</b></p>${moodBadge(r.mood)}</div>
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
        <label class="field">Tid<input id="e-time" name="time" type="time" required step="300"></label></div>
        <label class="field">Sted<input id="e-place" name="place" required maxlength="120" placeholder="F.eks. Torget"></label>
        <label class="field">Beskrivelse<textarea id="e-desc" name="description" maxlength="1000" rows="3"></textarea></label>
        <div class="wrap-row"><button type="submit" class="pill">Opprett</button><button type="button" class="pill ghost" data-act="toggle-event">Avbryt</button></div></form>`;
    }
    if (!upcoming.length) html += '<p class="empty">Ingen kommende arrangementer. Lag det første!</p>';
    upcoming.forEach((e, i) => {
      const d = parseIso(e.event_date);
      const going = S.attendees.filter((a) => a.event_id === e.id);
      const mine = going.some((a) => a.user_id === S.user.id);
      const canDelete = e.created_by === S.user.id || isCoord();
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
    html += `<section class="card" aria-labelledby="profil"><h2 id="profil" style="font-size:1.25rem">Profil</h2>
      <p class="small muted">${esc(S.user.email || '')} · ${isCoord() ? 'Koordinator' : 'Forelder'}</p>
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
    if (isCoord()) html += `<a class="card ink tight" href="#/kontor" style="text-decoration:none;flex-direction:row;align-items:center;justify-content:space-between;min-height:4rem"><b>Kontor for koordinatorer</b>${I.right()}</a>`;
    return html;
  }

  // ------------------------------------------------------------------ Kontor
  function viewKontor() {
    if (!isCoord()) return '<h1 tabindex="-1">Kontor</h1><p class="empty">Kontoret er bare for koordinatorer.</p>';
    const open = needsPeople(14);
    const ws = weekStart(today());
    let html = `<div class="page-head"><a href="#/info" class="row" style="min-height:2.75rem;text-decoration:none;font-weight:600;align-self:flex-start">${I.left()}Info</a>
      <div class="row" style="flex-wrap:wrap"><h1 tabindex="-1">Kontor</h1><span class="badge ink">Kun koordinatorer</span></div></div>`;

    html += `<section class="card yellow" aria-labelledby="apne"><div class="between"><h2 id="apne" style="font-size:1.25rem">Åpne vakter</h2><span class="small muted">neste 14 dager</span></div>`;
    if (!open.length) html += '<p>Alle vakter de neste 14 dagene er dekket.</p>';
    open.forEach(({ date, slot }) => {
      const list = shiftPeople(date, slot);
      html += `<div class="card tight"><div class="between"><p style="font-weight:700">${esc(cap(fmtShort(date)))} · ${SLOTS[slot].start}–${SLOTS[slot].end}</p><span class="badge warn">Trenger ${MIN_PER_SHIFT - list.length} til</span></div>
        <ul class="people">${personChips(list, { removable: true })}</ul></div>`;
    });
    html += '</section>';

    html += '<section class="card blue" aria-labelledby="dekning"><h2 id="dekning" style="font-size:1.25rem">Dekning uke for uke</h2>';
    for (let w = 0; w < 4; w++) {
      const start = addDays(ws, w * 7); let ok = 0;
      for (let i = 0; i < 7; i++) { const d = iso(addDays(start, i)); [1, 2].forEach((s) => { if (shiftPeople(d, s).length >= MIN_PER_SHIFT) ok++; }); }
      const pct = Math.round(ok / 14 * 100);
      html += `<div class="stack-s"><div class="between small"><b>Uke ${isoWeek(start)}</b><span>${ok} av 14 vakter dekket</span></div>
        <div class="bar" role="img" aria-label="Uke ${isoWeek(start)}: ${ok} av 14 vakter dekket"><span style="width:${pct}%"></span></div></div>`;
    }
    html += '</section>';

    const kw = S.kontorWeek;
    html += `<section class="card" aria-labelledby="vaktliste"><div class="between"><h2 id="vaktliste" style="font-size:1.25rem">Vaktliste uke ${isoWeek(kw)}</h2>
      <div class="week-nav"><button type="button" class="icon-btn" data-act="kweek" data-dir="-1" aria-label="Forrige uke">${I.left()}</button><button type="button" class="icon-btn" data-act="kweek" data-dir="1" aria-label="Neste uke">${I.right()}</button></div></div><div>`;
    for (let i = 0; i < 7; i++) {
      const d = iso(addDays(kw, i));
      [1, 2].forEach((slot) => {
        const list = shiftPeople(d, slot);
        html += `<div class="list-row" style="flex-direction:column;align-items:stretch"><div class="between"><span class="small"><b>${esc(cap(fmtShort(d)))}</b> · ${SLOTS[slot].start}–${SLOTS[slot].end}</span>${statusBadge(list.length)}</div>
          <ul class="people">${personChips(list, { removable: true })}</ul></div>`;
      });
    }
    html += '</div></section>';

    const people = Object.values(S.profiles).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'nb'));
    html += `<section class="card" aria-labelledby="foreldre"><div class="between"><h2 id="foreldre" style="font-size:1.25rem">Foreldre</h2><span class="small muted">${people.length} i nabolaget</span></div><div>`;
    people.forEach((p) => {
      const ph = S.phones[p.id];
      html += `<div class="list-row"><div class="grow stack-s" style="gap:.125rem"><b>${esc(p.full_name || 'Uten navn')}${p.id === S.user.id ? ' (deg)' : ''}</b>
        ${ph ? `<a class="small muted" href="${esc(telHref(ph))}">${esc(ph)}</a>` : '<span class="small muted">Ingen telefon</span>'}</div>
        <label class="sr-only" for="role-${p.id}">Rolle for ${esc(p.full_name)}</label>
        <select id="role-${p.id}" class="input" style="width:auto;min-height:2.75rem;border-radius:999px;font-weight:600;font-size:.875rem" data-change="role" data-id="${p.id}">
          <option value="forelder"${p.role === 'forelder' ? ' selected' : ''}>Forelder</option><option value="koordinator"${p.role === 'koordinator' ? ' selected' : ''}>Koordinator</option></select></div>`;
    });
    html += `</div></section>
      <button type="button" class="pill block" style="min-height:3.5rem" data-act="csv">${I.download()}Last ned vaktliste (CSV, 4 uker)</button>`;
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

  // ------------------------------------------------------------------ tegning
  const VIEWS = { vakter: viewVakter, kalender: viewKalender, nyheter: viewNyheter, arrangement: viewArrangement, info: viewInfo, kontor: viewKontor };
  function render() {
    const app = $('#app');
    const r = route();
    const routeChanged = r !== S.lastRoute;
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
    else if (S.loadError) html = `<div class="wrap">${header()}<main id="innhold" tabindex="-1"><h1 tabindex="-1">Noe gikk galt</h1><p>${esc(S.loadError)}</p><button type="button" class="pill self-start" data-act="retry">Prøv igjen</button><button type="button" class="pill ghost self-start" data-act="logout">Logg ut</button></main></div>`;
    else html = `<div class="wrap">${header()}<main id="innhold" tabindex="-1">${VIEWS[r]()}</main>${nav(r)}</div>`;
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
      S.lastRoute = r;
      document.title = (TITLES[r] && S.user ? TITLES[r] + ' – ' : '') + 'Safetly';
      window.scrollTo(0, 0);
      const h1 = $('#app h1');
      if (h1 && S.ready && document.readyState === 'complete' && S.navigated) h1.focus({ preventScroll: true });
    }
  }
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
      const rows = [{ user_id: S.user.id, shift_date: date, slot }];
      if (S.repeat) for (let w = 1; w <= 4; w++) rows.push({ user_id: S.user.id, shift_date: iso(addDays(parseIso(date), 7 * w)), slot });
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
    'logout'() { run(async () => { await api.signOut(); }); },
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
      await api.addNews({ title: f.title.value.trim(), body: f.body.value.trim() });
      f.reset(); S.newsForm = false; S.news = await api.news(); toast('Nyheten er lagt ut.');
    },
    async event(f) {
      await api.addEvent({ title: f.title.value.trim(), event_date: f.date.value, event_time: f.time.value, place: f.place.value.trim(), description: f.description.value.trim() });
      f.reset(); S.eventForm = false; await reloadEvents(); toast('Arrangementet er opprettet.');
    },
    async meeting(f) {
      await api.updateSettings({ meeting_name: f.mname.value.trim(), meeting_address: f.maddress.value.trim(), meeting_note: f.mnote.value.trim() });
      S.settings = await api.settings(); S.meetingForm = false;
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
      [1, 2].forEach((slot) => {
        const list = shiftPeople(d, slot);
        const names = list.map((b) => (S.profiles[b.user_id] || {}).full_name || '');
        const phones = list.map((b) => S.phones[b.user_id] || '');
        rows.push([`${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`, cap(DAYS[dow(date)]), isoWeek(date), SLOTS[slot].name,
          SLOTS[slot].start, SLOTS[slot].end, list.length, list.length >= MIN_PER_SHIFT ? 'Dekket' : 'Trenger flere', names.join(', '), phones.join(', ')]);
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
  document.addEventListener('input', (ev) => { if (ev.target.hasAttribute && ev.target.hasAttribute('data-counter')) updateCounters(); });
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
  async function startSession() {
    S.loaded = false; render();
    try { await loadAll(); } catch (e) { console.error(e); S.loaded = true; S.loadError = errText(e); }
    render();
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
      navigator.serviceWorker.register('sw.js').catch(() => { /* valgfritt */ });
    }
  }
  boot();
})();
