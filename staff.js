/* Elevate EMS Staff portal (staff.elevateemsacademy.com).
   Instructors, assistants and patients sign in with their email + password and fill in their start/end times
   for each day they're on a cohort's Staffing tab. Everything goes through the "Elevate EMS Staff" Apps Script
   (STAFF_SCRIPT_URL in config.js); this page keeps only their sign-in (localStorage 'staff-session').
   While config.js still says PASTE, it runs on pretend data (sample mode) so the screens can be looked at. */

const SAMPLE = /PASTE/.test(STAFF_SCRIPT_URL);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDay = iso => new Date(iso + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
// Times are military, like you write them: typed "0745" (or "745") = 07:45; shown as 0745.
const hm = t => { const d = String(t || '').replace(/\D/g, ''); if (d.length < 3 || d.length > 4) return ''; const h = +d.slice(0, -2), m = +d.slice(-2); return h <= 23 && m <= 59 ? String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') : ''; };
const mil = t => String(t || '').replace(':', '');
const hoursOf = (a, b) => { if (!a || !b) return 0; const m = t => { const [h, x] = t.split(':').map(Number); return h * 60 + x; }; const d = m(b) - m(a); return d > 0 ? Math.round(d / 15) / 4 : 0; };
const keep = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };

const S = {
  session: keep('staff-session'), me: null, tab: keep('staff-tab') || 'time',
  mode: 'signin', // signin | setup | forgot | reset
  busy: false, err: '', note: '', edit: {}, vals: {}, // edit: { 'cohort|date': { start, end } } (typed digits)
  resetToken: new URLSearchParams(location.search).get('reset') || '',
};
if (S.resetToken) S.mode = 'reset';

async function call(action, params = {}) {
  if (SAMPLE) return sampleCall(action, params);
  let res;
  try { res = await fetch(STAFF_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action, session: S.session, ...params }) }); }
  catch { throw new Error('No internet connection. Try again in a minute.'); }
  const out = await res.json();
  if (!out.ok) {
    if (out.signIn) { S.session = null; keep('staff-session', null); S.me = null; }
    throw new Error(out.error || 'Something went wrong.');
  }
  return out;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- Screens ---------- */
function render() {
  const app = document.getElementById('app');
  app.innerHTML = S.session && S.me ? homeView() : S.session ? '<p class="loading">Loading your days…</p>' : signedOutView();
  // What they'd typed stays put when the page redraws (a wrong password, a save that didn't go through).
  Object.entries(S.vals).forEach(([id, v]) => { const el = app.querySelector('form [name="' + id + '"]'); if (el) el.value = v; });
}

function card(inner) {
  return `<div class="signin"><div class="signin-card"><img class="signin-logo" src="logo.png" alt="Elevate EMS">${inner}</div></div>`;
}
const errLine = () => S.err ? `<p class="err">${esc(S.err)}</p>` : '';
const noteLine = () => S.note ? `<p class="note">${esc(S.note)}</p>` : '';
const field = (id, label, type = 'text', extra = '') => `<label class="field">${label}<input id="${id}" name="${id}" type="${type}" ${extra}></label>`;

function signedOutView() {
  if (S.mode === 'reset') return card(`<h1>New password</h1>
    <form data-form="reset">${field('pw1', 'New password', 'password', 'autocomplete="new-password" minlength="8" required')}
      ${field('pw2', 'Type it again', 'password', 'autocomplete="new-password" minlength="8" required')}
      ${errLine()}<button class="btn primary wide" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Saving…' : 'Save and sign in'}</button></form>`);
  if (S.mode === 'forgot') return card(`<h1>Forgot password</h1><p class="muted">We'll email you a link to pick a new one.</p>
    <form data-form="forgot">${field('email', 'Email', 'email', 'autocomplete="username" required')}
      ${errLine()}${noteLine()}<button class="btn primary wide" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Sending…' : 'Email me a link'}</button></form>
    <p><button class="link" data-act="mode" data-m="signin">Back to sign in</button></p>`);
  if (S.mode === 'setup') return card(`<h1>Set up your account</h1>
    <p class="muted small">Use your legal name and the phone number Nick/Bella have on file for you.</p>
    <form data-form="setup">
      ${field('name', 'Your legal name', 'text', 'autocomplete="name" required')}
      ${field('phone', 'Your phone number', 'tel', 'autocomplete="tel" required')}
      ${field('email', 'Your email (you\'ll sign in with this)', 'email', 'autocomplete="username" required')}
      ${field('pw1', 'Pick a password (8+ characters)', 'password', 'autocomplete="new-password" minlength="8" required')}
      <fieldset><legend>Emergency contact <span class="opt">(optional)</span></legend>
        ${field('emName', 'Name')}
        ${field('emPhone', 'Phone', 'tel')}
        ${field('emRel', 'How they\'re related to you', 'text', 'placeholder="Mom, husband, friend…"')}
      </fieldset>
      ${errLine()}<button class="btn primary wide" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Setting up…' : 'Create my account'}</button></form>
    <p><button class="link" data-act="mode" data-m="signin">I already have an account</button></p>`);
  return card(`<h1>Elevate EMS Staff</h1><p class="muted">Timesheets, schedule and pay</p>
    <form data-form="login">${field('email', 'Email', 'email', 'autocomplete="username" required')}
      ${field('pw', 'Password', 'password', 'autocomplete="current-password" required')}
      ${errLine()}<button class="btn primary wide" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Signing in…' : 'Sign in'}</button></form>
    <p><button class="link" data-act="mode" data-m="forgot">Forgot password?</button></p>
    <div class="first-time"><button class="btn wide" data-act="mode" data-m="setup">Set up your account</button></div>`);
}

const TABS = [['time', 'Timesheet'], ['schedule', 'Schedule'], ['pay', 'Pay'], ['info', 'My info']];
function homeView() {
  const m = S.me;
  return `<div class="sticky"><header class="top"><img src="logo.png" alt="Elevate EMS"><div><h1>Elevate EMS Staff</h1><p>${esc(m.name)}</p></div>
    <button class="refresh ${S.loadingMe ? 'spin' : ''}" data-act="refresh" title="Check for changes" aria-label="Check for changes">↻</button></header>
  <nav class="tabs">${TABS.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</nav></div>
  <main class="wrap">${{ time: timeView, schedule: scheduleView, pay: payView, info: infoView }[S.tab]()}</main>`;
}

// Timesheet: each cohort's days. Days that haven't come yet are grayed out; each day is signed when it's filled in.
function timeView() {
  const list = S.me.cohorts.filter(c => c.days.length || c.flats.length);
  if (!list.length) return `<section class="box"><p class="empty">You're not on a Staffing schedule right now. If you should be, check with Nick or Bella, then tap ↻ at the top.</p></section>`;
  const fixes = [];
  list.forEach(c => c.days.filter(d => d.needsSig && d.fix).forEach(d => fixes.push(d)));
  const banner = fixes.length ? `<div class="banner">${esc(fixes[0].fix.by)} corrected ${fixes.length === 1 ? 'a day' : fixes.length + ' days'} on your timesheet. Please review and sign ${fixes.length === 1 ? 'it' : 'them'} below.</div>` : '';
  return banner + list.map(c => `<section class="box">
    <div class="box-head"><h2>${esc(c.cohort)} Academy Week</h2>${c.paid ? '<span class="tag sage">Paid</span>' : c.total ? '<span class="tag">Not paid yet</span>' : ''}</div>
    <ul class="days">${c.days.map(d => dayRow(c, d)).join('')}
      ${c.flats.map(f => `<li class="day flat"><div class="day-top"><b>${longDay(f.date)}</b><span class="muted small">Flat rate</span></div>
        <div class="day-saved"><span>${esc(f.desc)}</span><b>${money(f.total)}</b>${f.paid ? `<span class="tag sage">Paid${f.check ? ' · #' + esc(f.check) : ''}</span>` : ''}</div></li>`).join('')}
    </ul>
    <div class="total-row"><span>Total</span><b>${money(c.total)}</b></div>
  </section>`).join('');
}
const dayHead = d => `<div class="day-top"><b>${longDay(d.date)}${d.sched ? ` <span class="day-hours">· ${esc(d.sched)}</span>` : ''}</b>${d.exam ? '<span class="tag exam">Psychomotor Exam</span>' : ''}</div>
  <div class="day-sub">${esc(d.role)} · ${money(d.rate)}/hr</div>`;
const signedTag = d => d.signed ? '<span class="tag sage">Signed ✓</span>' : '';
function dayRow(c, d) {
  const k = c.cohort + '|' + d.date, ed = S.edit[k];
  const times = `${mil(d.start)}–${mil(d.end)} · ${d.hours} hrs`;
  if (d.future) return `<li class="day future">${dayHead(d)}<p class="muted small">You can fill this in on ${longDay(d.date)}.</p></li>`;
  if (d.row && d.needsSig) { // a correction (or a day that still needs their signature): sign what's there
    return `<li class="day needs">${dayHead(d)}
      ${d.fix ? `<p class="fix-note">${esc(d.fix.by)} ${d.fix.from ? `changed this from <s>${esc(d.fix.from)}</s> to <b>${mil(d.start)}–${mil(d.end)}</b>` : `filled in <b>${mil(d.start)}–${mil(d.end)}</b> for you`}.</p>` : ''}
      <div class="day-saved"><span>${times}</span><b>${money(d.total)}</b></div>
      <div class="day-btns"><span class="muted small">Doesn't look right? Notify Nick or Bella first.</span>
        <button class="btn primary small" data-act="sign" data-cohort="${esc(c.cohort)}" data-date="${d.date}" ${S.busy ? 'disabled' : ''}>Sign</button></div></li>`;
  }
  if (d.paid || (!d.canEdit && d.row)) return `<li class="day">${dayHead(d)}<div class="day-saved"><span>${d.start ? times : d.hours + ' hrs'}</span><b>${money(d.total)}</b>${signedTag(d)}${d.paid ? `<span class="tag sage">Paid${d.check ? ' · #' + esc(d.check) : ''}</span>` : ''}</div></li>`;
  if (!ed && d.row) return `<li class="day">${dayHead(d)}<div class="day-saved"><span>${times}</span><b>${money(d.total)}</b>${signedTag(d)}
    <button class="btn small" data-act="edit" data-k="${esc(k)}">Change</button></div></li>`;
  if (!d.canEdit) return `<li class="day">${dayHead(d)}<p class="muted small">Ask Bella or Nick about this day.</p></li>`;
  const e = ed || { start: mil(d.start), end: mil(d.end) };
  const [ps, pe] = (d.sched || '0800–1700').split('–');
  const hrs = hoursOf(hm(e.start), hm(e.end));
  return `<li class="day editing">${dayHead(d)}${d.row ? '' : '<span class="tag honey">Not filled in</span>'}
    <div class="times">
      <label>Start<input type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${esc(ps)}" data-k="${esc(k)}" data-f="start" value="${esc(e.start)}"></label>
      <label>End<input type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${esc(pe)}" data-k="${esc(k)}" data-f="end" value="${esc(e.end)}"></label>
      <div class="calc">${hrs ? `${hrs} hrs<br><b>${money(hrs * d.rate)}</b>` : '<span class="muted small">—</span>'}</div>
    </div>
    <div class="day-btns">${ed && d.row ? `<button class="link" data-act="cancelEdit" data-k="${esc(k)}">Cancel</button>` : '<span class="muted small hint">Sign at the end of your shift. Use military time.</span>'}
      <button class="btn primary small" data-act="sign" data-cohort="${esc(c.cohort)}" data-date="${d.date}" ${S.busy ? 'disabled' : ''}>Sign</button></div>
  </li>`;
}

// Schedule: each cohort's days still to come (and today), under the cohort's name.
function scheduleView() {
  const groups = S.me.cohorts.map(c => ({ cohort: c.cohort, days: c.days.filter(d => d.future || d.date === S.me.today) })).filter(g => g.days.length);
  return (groups.length ? groups.map(g => `<section class="box"><div class="box-head"><h2>${esc(g.cohort)} Academy Week</h2></div>
    <ul class="sched">${g.days.map(d => `<li><div><b>${longDay(d.date)}</b>${d.sched ? `<span class="muted small">${esc(d.sched)}</span>` : ''}</div>
      <div class="sched-role">${d.exam ? '<span class="tag exam">Psychomotor Exam</span>' : ''}<span class="muted">${esc(d.role)}</span></div></li>`).join('')}</ul></section>`).join('')
    : '<section class="box"><p class="empty">No days on the schedule right now.</p></section>')
    + '<p class="page-note">This is from the Staffing schedule. If something looks wrong, text Bella or Nick.</p>';
}

function payView() {
  const h = S.me.history;
  const owed = S.me.cohorts.filter(c => c.unpaid > 0);
  return `${owed.length ? `<section class="box"><div class="box-head"><h2>Not paid yet</h2></div><ul class="pay">${owed.map(c => `<li><span>${esc(c.cohort)} Academy Week</span><b>${money(c.unpaid)}</b></li>`).join('')}</ul>
    <p class="muted small">You're paid by check after your last day of the week.</p></section>` : ''}
  <section class="box"><div class="box-head"><h2>Pay history</h2></div>
    ${h.length ? `<ul class="pay">${h.map(x => `<li><div><b>${esc(x.cohort ? x.cohort + ' Academy Week' : x.what || 'Pay')}</b><span class="muted small">${longDay(x.last)}${x.check ? ' · Check #' + esc(x.check) : ''}</span></div>
      <b>${money(x.amount)}</b>${x.pdf ? `<button class="btn small" data-act="pdf" data-cohort="${esc(x.cohort)}">Timesheet</button>` : '<span></span>'}</li>`).join('')}</ul>`
      : '<p class="empty">Nothing paid yet.</p>'}</section>`;
}

function infoView() {
  const i = S.me.info, em = i.emergency || {};
  return `<section class="box"><div class="box-head"><h2>My info</h2></div>
    <form data-form="info">
      ${field('phone', 'Phone', 'tel', `value="${esc(i.phone)}" autocomplete="tel"`)}
      ${field('email', 'Email (you sign in with this)', 'email', `value="${esc(i.email)}" autocomplete="username" required`)}
      <fieldset><legend>Emergency contact <span class="opt">(optional)</span></legend>
        ${field('emName', 'Name', 'text', `value="${esc(em.name)}"`)}
        ${field('emPhone', 'Phone', 'tel', `value="${esc(em.phone)}"`)}
        ${field('emRel', 'How they\'re related to you', 'text', `value="${esc(em.relation)}"`)}
      </fieldset>
      <button class="btn primary" ${S.busy ? 'disabled' : ''}>Save</button>
    </form></section>
  <section class="box"><div class="box-head"><h2>Change password</h2></div>
    <form data-form="password">
      ${field('old', 'Current password', 'password', 'autocomplete="current-password" required')}
      ${field('pw1', 'New password (8+ characters)', 'password', 'autocomplete="new-password" minlength="8" required')}
      <button class="btn" ${S.busy ? 'disabled' : ''}>Change password</button>
    </form></section>
  <p class="center"><button class="link" data-act="signout">Sign out</button></p>`;
}

/* ---------- Doing things ---------- */
async function loadMe() {
  S.loadingMe = true; if (S.me) render();
  try { S.me = await call('me'); } catch (e) { if (!S.session) S.err = e.message; else toast(e.message); }
  S.loadingMe = false; render();
}
function signedIn(out) {
  S.session = out.session; keep('staff-session', out.session);
  S.err = ''; S.note = ''; S.mode = 'signin'; S.vals = {};
  if (S.resetToken) { S.resetToken = ''; history.replaceState(null, '', location.pathname); }
  render(); window.scrollTo(0, 0); loadMe().then(() => window.scrollTo(0, 0));
}

document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const v = id => (f.querySelector('#' + id) || {}).value || '';
  S.busy = true; S.err = ''; S.note = ''; render();
  try {
    const kind = f.dataset.form;
    if (kind === 'login') signedIn(await call('login', { email: v('email'), password: v('pw') }));
    else if (kind === 'setup') signedIn(await call('setupAccount', { name: v('name'), phone: v('phone'), email: v('email'), password: v('pw1'),
      emergency: { name: v('emName'), phone: v('emPhone'), relation: v('emRel') } }));
    else if (kind === 'forgot') S.note = (await call('forgot', { email: v('email') })).message;
    else if (kind === 'reset') {
      if (v('pw1') !== v('pw2')) throw new Error('Those two passwords don\'t match.');
      signedIn(await call('reset', { token: S.resetToken, password: v('pw1') }));
    } else if (kind === 'info') {
      S.me = await call('saveInfo', { phone: v('phone'), email: v('email'), emergency: { name: v('emName'), phone: v('emPhone'), relation: v('emRel') } });
      S.vals = {}; toast('Saved.');
    } else if (kind === 'password') {
      const out = await call('changePassword', { old: v('old'), password: v('pw1') });
      S.session = out.session; keep('staff-session', out.session); S.vals = {}; toast(out.message);
    }
  } catch (err) {
    if (S.session && S.me) toast(err.message); else S.err = err.message;
  }
  S.busy = false; render();
});

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'mode': S.mode = d.m; S.err = ''; S.note = ''; render(); window.scrollTo(0, 0); break;
    case 'tab': S.vals = {}; S.tab = d.t; keep('staff-tab', d.t); render(); window.scrollTo(0, 0); break;
    case 'signout': S.session = null; S.me = null; keep('staff-session', null); render(); window.scrollTo(0, 0); break;
    case 'refresh': if (!S.loadingMe) loadMe(); break;
    case 'edit': { const [cohort, date] = d.k.split('|'); const day = findDay(cohort, date); S.edit[d.k] = { start: mil(day.start), end: mil(day.end) }; render(); break; }
    case 'cancelEdit': delete S.edit[d.k]; render(); break;
    case 'sign': { // their times (or a correction as it is) + their signature
      const k = d.cohort + '|' + d.date, day = findDay(d.cohort, d.date), correction = day.row && day.needsSig;
      let start = '', end = '';
      if (!correction) {
        const ed = S.edit[k] || { start: mil(day.start), end: mil(day.end) };
        start = hm(ed.start); end = hm(ed.end);
        if (!start || !end) { toast('Type your start and end time, like 0800 and 1630.'); return; }
        if (!hoursOf(start, end)) { toast('The end time has to be after the start time.'); return; }
      } else { start = day.start; end = day.end; }
      const hrs = hoursOf(start, end);
      const png = await signPad(`Sign for ${longDay(d.date)}`, `${mil(start)}–${mil(end)} · ${hrs} hrs · ${money(hrs * day.rate)}. Sign with your finger.`);
      if (!png) return;
      S.busy = true; render();
      try { S.me = await call('signDay', { cohort: d.cohort, date: d.date, start, end, png }); delete S.edit[k]; toast('Signed.'); }
      catch (err) { toast(err.message); }
      S.busy = false; render(); break;
    }
    case 'pdf': {
      el.disabled = true;
      try {
        const out = await call('timesheetPdf', { cohort: d.cohort });
        const bytes = Uint8Array.from(atob(out.pdf), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a = document.createElement('a'); a.href = url; a.download = out.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (err) { toast(err.message); }
      el.disabled = false; break;
    }
  }
});
const findDay = (cohort, date) => (S.me.cohorts.find(c => c.cohort === cohort) || { days: [] }).days.find(x => x.date === date) || {};

// Typing times: kept per day, and the hours/$ update as they change.
document.addEventListener('input', e => {
  const t = e.target;
  if (t.name && t.closest('form[data-form]')) { S.vals[t.name] = t.value; return; }
  if (!t.dataset || !t.dataset.k || !t.dataset.f) return;
  const [cohort, date] = t.dataset.k.split('|'), day = findDay(cohort, date);
  const ed = S.edit[t.dataset.k] = S.edit[t.dataset.k] || { start: mil(day.start), end: mil(day.end) };
  const digits = t.value.replace(/\D/g, '').slice(0, 4);
  if (t.value !== digits) t.value = digits; // numbers only
  ed[t.dataset.f] = digits;
  const calc = t.closest('.day').querySelector('.calc'), h = hoursOf(hm(ed.start), hm(ed.end));
  calc.innerHTML = h ? `${h} hrs<br><b>${money(h * day.rate)}</b>` : '<span class="muted small">—</span>';
  if (t.dataset.f === 'start' && digits.length === 4) { const nx = t.closest('.times').querySelector('[data-f="end"]'); if (nx && !nx.value) nx.focus(); } // on to End
});
// "745" → "0745" when they leave the box.
document.addEventListener('focusout', e => {
  const t = e.target;
  if (!t.dataset || !t.dataset.k || !t.dataset.f) return;
  const v = hm(t.value);
  if (v && mil(v) !== t.value) { t.value = mil(v); (S.edit[t.dataset.k] || {})[t.dataset.f] = t.value; }
});

/* ---------- Signature pop-up ---------- */
function signPad(title, note) {
  return new Promise(done => {
    const wrap = document.createElement('div');
    wrap.className = 'sig-overlay';
    wrap.innerHTML = `<div class="sig-modal"><div class="sig-head"><h2>${esc(title)}</h2><button class="sig-x" data-x aria-label="Cancel">×</button></div>
      <p class="muted small">${esc(note)}</p>
      <div class="sig-box"><div class="sig-line"></div><canvas aria-label="Signature box"></canvas></div>
      <div class="sig-foot"><button class="link" data-clear>Clear</button><button class="btn primary" data-done disabled>Sign</button></div></div>`;
    document.body.appendChild(wrap);
    const pad = SigPad(wrap.querySelector('canvas')), btn = wrap.querySelector('[data-done]');
    const close = v => { wrap.remove(); done(v); };
    wrap.querySelector('canvas').addEventListener('pointerup', () => { btn.disabled = !pad.hasInk(); });
    wrap.querySelector('[data-clear]').onclick = () => { pad.clear(); btn.disabled = true; };
    wrap.querySelector('[data-x]').onclick = () => close('');
    wrap.addEventListener('click', e => { if (e.target === wrap) close(''); });
    btn.onclick = () => close(pad.png());
  });
}

/* ---------- Sample mode (config.js not filled in yet) ---------- */
function sampleCall(action, p) {
  const t = new Date(), iso = d => d.toISOString().slice(0, 10), back = n => { const d = new Date(t); d.setDate(d.getDate() - n); return iso(d); };
  const me = () => ({
    name: 'Jason Kearney', today: iso(t), rates: { 'EC & Equivalent': 35, 'Non-Certified Instructor': 30, Assistant: 25, Patient: 17.5 },
    info: { phone: '609-850-1006', email: 'jason@example.com', emergency: { name: 'Jane Kearney', phone: '609-555-0100', relation: 'Mom' } },
    cohorts: [{ cohort: 'Spring 2027', total: 255, unpaid: 255, paid: false, flats: [],
      days: [
        { n: 1, date: back(3), sched: '0800–1700', role: 'Non-Certified Instructor', rate: 30, start: '08:00', end: '16:30', hours: 8.5, total: 255, row: 5, canEdit: true, editable: true, signed: true },
        { n: 2, date: back(2), sched: '0800–1700', role: 'Non-Certified Instructor', rate: 30, start: '08:00', end: '17:00', hours: 9, total: 270, row: 6, canEdit: true, editable: true, needsSig: true, fix: { by: 'Bella', from: '0800–1630' } },
        { n: 3, date: back(1), sched: '0730–1700', role: 'Non-Certified Instructor', rate: 30, start: '', end: '', hours: 0, total: 0, row: 0, canEdit: true, editable: true },
        { n: 5, date: back(-3), sched: '0800–1700', exam: true, role: 'Non-Certified Instructor', rate: 30, future: true },
      ] }],
    history: [{ cohort: 'Summer 2026', check: '', amount: 450, last: '2026-08-09', what: 'Summer 2026 academy week', pdf: false }],
  });
  if (action === 'login' || action === 'setupAccount' || action === 'reset') return Promise.resolve({ session: 'sample', name: 'Jason Kearney' });
  if (action === 'forgot') return Promise.resolve({ message: 'If that email has an account, a reset link is on its way. It works for an hour.' });
  if (action === 'changePassword') return Promise.resolve({ session: 'sample', message: 'Password changed.' });
  return Promise.resolve(me());
}

render();
if (S.session) loadMe();
