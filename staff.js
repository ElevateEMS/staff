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
  session: keep('staff-session'), me: null, tab: keep('staff-tab') || 'time', // me: their last copy shows at once (see loadMe)
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
    if (out.signIn) { S.session = null; keep('staff-session', null); S.me = null; keep('staff-me', null); }
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
  Object.entries(S.vals).forEach(([id, v]) => { const el = app.querySelector('form [name="' + id + '"]'); if (el && el.type !== 'radio' && el.type !== 'checkbox') el.value = v; });
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

const TABS = [['time', 'Timesheet'], ['schedule', 'Schedule'], ['avail', 'Availability']]; // (My info + Pay History: the person icon's menu)
const PERSON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.8-3.8 3.6-6 7.2-6s6.4 2.2 7.2 6"/></svg>';
function homeView() {
  const m = S.me;
  return `<div class="sticky"><header class="top"><img src="logo.png" alt="Elevate EMS"><div><h1>Elevate EMS Staff</h1><p>${esc(m.name)}${S.loadingMe ? ' <span class="checking">· checking for changes…</span>' : ''}</p></div>
    <div class="menu-wrap"><button class="icon-btn ${S.menu || ['info', 'pay', 'w9'].includes(S.tab) ? 'on' : ''}" data-act="menu" title="Menu" aria-label="Menu" aria-expanded="${S.menu ? 'true' : 'false'}">${PERSON}</button>
      ${S.menu ? `<div class="menu-pop" role="menu">
        <button data-act="tab" data-t="info" class="${S.tab === 'info' ? 'on' : ''}">My info</button>
        <button data-act="tab" data-t="pay" class="${S.tab === 'pay' ? 'on' : ''}">Pay History</button>
        <button data-act="refresh" ${S.loadingMe ? 'disabled' : ''}>${S.loadingMe ? 'Checking…' : 'Check for changes'}</button>
        <button data-act="signout">Sign out</button></div>` : ''}</div></header>
  <nav class="tabs">${TABS.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</nav></div>
  <main class="wrap">${S.tab !== 'w9' && m.w9 && !m.w9.on ? `<div class="banner w9-banner orange"><span>Please fill out your W-9 so we have it on file.</span><button class="btn small primary" data-act="tab" data-t="w9">Fill out W-9</button></div>` : ''}
    ${({ time: timeView, schedule: scheduleView, avail: availView, pay: payView, info: infoView, w9: w9View }[S.tab] || timeView)()}</main>`;
}

// Timesheet: each cohort's days. Days that haven't come yet are grayed out; each day is signed when it's filled in.
function timeView() {
  const list = S.me.cohorts.filter(c => c.days.length || c.flats.length || (c.others || []).length);
  if (!list.length) return `<section class="box"><p class="empty">You're not on a Staffing schedule right now. If you should be, reach out to Nick or Bella, then tap the refresh button at the top.</p></section>`;
  const fixes = [];
  list.forEach(c => c.days.filter(d => d.needsSig && d.fix).forEach(d => fixes.push(d)));
  const banner = fixes.length ? `<div class="banner">${esc(fixes[0].fix.by)} corrected ${fixes.length === 1 ? 'a day' : fixes.length + ' days'} on your timesheet. Please review and sign ${fixes.length === 1 ? 'it' : 'them'} below. Doesn't look right? Notify Nick or Bella first.</div>` : '';
  return banner + list.map(c => `<section class="box">
    <div class="box-head"><h2>${esc(c.cohort)} Academy Week</h2>${c.paid ? '<span class="tag sage">Paid</span>' : c.total ? '<span class="tag">Not paid yet</span>' : ''}</div>
    <ul class="days">${c.days.map(d => dayRow(c, d)).join('')}
      ${(c.others || []).filter(o => !c.flats.some(f => f.date === o.date && f.desc === o.what)).map(o => `<li class="day flat ${o.date > S.me.today ? 'future' : ''}"><div class="day-top"><b>${longDay(o.date)}</b><b>${money(o.amount)}</b></div>
        <div class="day-row"><span>${esc(o.what)} <span class="muted small">· flat amount, no times needed</span></span></div></li>`).join('')}
      ${c.flats.map(f => `<li class="day flat"><div class="day-top"><b>${longDay(f.date)}</b><b>${money(f.total)}</b></div>
        <div class="day-row"><span>${esc(f.desc)} <span class="muted small">· ${f.reimb ? 'Reimbursement' : 'Extra pay'}</span></span>${f.paid ? `<span class="tag sage">Paid${f.check ? ' · #' + esc(f.check) : ''}</span>` : ''}</div></li>`).join('')}
    </ul>
    <div class="total-row"><span>Total</span><b>${money(c.total)}</b></div>
  </section>`).join('');
}
// Each day: date (+ scheduled hours) with the amount (or a tag) on the right; role + rate under it; then one row of
// worked times with the button on the right.
const dayHead = (d, right = '', tags = '') => `<div class="day-top"><b>${longDay(d.date)}${d.sched ? ` <span class="day-hours">· ${esc(d.sched)}</span>` : ''}</b><span class="day-amt">${right}</span></div>
  <div class="day-sub"><span>${esc(d.role)} · ${money(d.rate)}/hr</span><span class="tags">${d.exam ? '<span class="tag exam">Psychomotor Exam</span>' : ''}${tags}</span></div>`;
const amtOf = total => `<b>${money(total)}</b>`;
const signedTag = d => d.signed ? '<span class="tag sage">Signed ✓</span>' : '';
function dayRow(c, d) {
  const k = c.cohort + '|' + d.date, ed = S.edit[k];
  const times = `${mil(d.start)}–${mil(d.end)}`, worked = `${times} · ${d.hours} hrs`;
  const signBtn = `<button class="btn primary small" data-act="sign" data-cohort="${esc(c.cohort)}" data-date="${d.date}" ${S.busy ? 'disabled' : ''}>Sign</button>`;
  if (d.future) return `<li class="day future">${dayHead(d)}<p class="muted small">You can fill this in on ${longDay(d.date)}.</p></li>`;
  if (d.row && d.needsSig) { // a correction (or a day that still needs their signature): sign what's there
    return `<li class="day needs">${dayHead(d, amtOf(d.total))}
      ${d.fix ? `<p class="fix-note">${esc(d.fix.by)} ${d.fix.from ? `changed this from <s>${esc(d.fix.from)}</s> to <b>${times}</b>` : `filled in <b>${times}</b> for you`}.</p>` : ''}
      <div class="day-row"><span>${worked}</span>${signBtn}</div></li>`;
  }
  if (d.paid || (!d.canEdit && d.row)) return `<li class="day">${dayHead(d, amtOf(d.total), signedTag(d) + (d.paid ? `<span class="tag sage">Paid${d.check ? ' · #' + esc(d.check) : ''}</span>` : ''))}<div class="day-row"><span>${d.start ? worked : d.hours + ' hrs'}</span></div></li>`;
  if (!ed && d.row) return `<li class="day">${dayHead(d, amtOf(d.total), signedTag(d))}<div class="day-row"><span>${worked}</span>
    <button class="btn small" data-act="edit" data-k="${esc(k)}">Change</button></div></li>`;
  if (!d.canEdit) return `<li class="day">${dayHead(d)}<p class="muted small">Reach out to Nick or Bella about this day.</p></li>`;
  const e = ed || { start: mil(d.start), end: mil(d.end) };
  const [ps, pe] = (d.sched || '0800–1700').split('–');
  const hrs = hoursOf(hm(e.start), hm(e.end));
  return `<li class="day editing" data-empty="${d.row ? '' : '<span class=&quot;tag honey&quot;>Not filled in</span>'}">${dayHead(d, hrs ? amtOf(hrs * d.rate) : d.row ? '' : '<span class="tag honey">Not filled in</span>')}
    <div class="times">
      <label>Start<input type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${esc(ps)}" data-k="${esc(k)}" data-f="start" value="${esc(e.start)}"></label>
      <label>End<input type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${esc(pe)}" data-k="${esc(k)}" data-f="end" value="${esc(e.end)}"></label>
      ${signBtn}
    </div>
    ${ed && d.row ? `<button class="link cancel" data-act="cancelEdit" data-k="${esc(k)}">Cancel</button>` : ''}
  </li>`;
}

// Schedule: each cohort's days still to come (and today), under the cohort's name.
function scheduleView() {
  // (Other days, like admin help, show with what they're for)
  const groups = S.me.cohorts.map(c => ({ cohort: c.cohort, days: c.days.filter(d => d.future || d.date === S.me.today)
    .concat((c.others || []).filter(o => o.date >= S.me.today).map(o => ({ date: o.date, role: o.what, sched: '' })))
    .sort((a, b) => a.date < b.date ? -1 : 1) })).filter(g => g.days.length);
  return (groups.length ? groups.map(g => `<section class="box"><div class="box-head"><h2>${esc(g.cohort)} Academy Week</h2></div>
    <ul class="sched">${g.days.map(d => `<li><div><b>${longDay(d.date)}</b>${d.sched ? `<span class="muted small">${esc(d.sched)}</span>` : ''}</div>
      <div class="sched-role">${d.exam ? '<span class="tag exam">Psychomotor Exam</span>' : ''}<span class="muted">${esc(d.role)}</span></div></li>`).join('')}</ul></section>`).join('')
    : '<section class="box"><p class="empty">No days on the schedule right now.</p></section>')
    + '<p class="page-note">This is from the Staffing schedule. If something looks wrong, reach out to Nick or Bella.</p>';
}

// Availability: every upcoming Academy Week, each day Available / Maybe / Unavailable (+ a note). It locks 2 weeks before.
const AV = [['yes', 'Available'], ['maybe', 'Maybe'], ['no', 'Unavailable']];
function availView() {
  if (S.me.inactive) return `<section class="box"><p class="empty">You're marked as away for now, so there's nothing to fill in here. Reach out to Nick or Bella when you're back.</p></section>`;
  const list = S.me.avail || [];
  if (!list.length) return `<section class="box"><p class="empty">No Academy Weeks coming up right now. When there's a new one, you can tell Nick and Bella which days you can work here.</p></section>`;
  return list.map(w => `<section class="box"><div class="box-head"><h2>${esc(w.cohort)} Academy Week</h2>${w.locked ? '<span class="tag">Locked</span>' : ''}</div>
    <p class="small muted av-lock">${w.locked ? 'This week is locked. Unavailable for a day? Reach out to Nick or Bella.' : `Please submit your availability by <b>${longDay(w.lockOn)}</b>.<span class="av-tip">Tap to choose; it saves as you go.</span>`}</p>
    <ul class="av-days">${w.days.map(d => `<li class="av-day ${d.s ? 'is-' + d.s : ''}">
      <div class="av-top"><b>${longDay(d.date)}</b>${d.exam ? '<span class="tag exam">Psychomotor Exam</span>' : ''}${avState(w.cohort, d.date)}${d.by ? `<span class="av-by">added by ${esc(d.by)}</span>` : ''}</div>
      <div class="seg3" role="group" aria-label="${longDay(d.date)}">${AV.map(([v, l]) => `<button class="${d.s === v ? 'on ' + v : ''}" data-act="av" data-cohort="${esc(w.cohort)}" data-date="${d.date}" data-s="${v}" ${w.locked ? 'disabled' : ''} aria-pressed="${d.s === v}">${l}</button>`).join('')}</div>
      ${w.locked ? (d.note ? `<p class="small av-note-text">${esc(d.note)}</p>` : '')
        : d.s || d.note ? `<input class="av-note" data-avnote data-cohort="${esc(w.cohort)}" data-date="${d.date}" maxlength="200" placeholder="Add a note (optional)" value="${esc(d.note || '')}">` : ''}
    </li>`).join('')}</ul></section>`).join('');
}
// Saved as soon as they tap (one at a time, in order); what's shown changes right away, then "Saved ✓" for a moment
// (or "Not saved" if it didn't go through).
let avQueue = Promise.resolve(), avWaiting = 0;
const avStatus = {}; // "cohort|date" → { st: 'saving' | 'saved' | 'err', n }
const avState = (cohort, date) => { const x = avStatus[cohort + '|' + date];
  return !x ? '' : x.st === 'saved' ? '<span class="av-saved">Saved ✓</span>' : x.st === 'err' ? '<span class="av-err">Not saved. Check your connection and tap again.</span>' : '<span class="av-saving">Saving…</span>'; };
function saveAvail(cohort, date, patch) {
  const w = (S.me.avail || []).find(x => x.cohort === cohort), d = w && w.days.find(x => x.date === date);
  if (!d) return;
  Object.assign(d, patch, { by: '' });
  keepMe(S.me);
  const k = cohort + '|' + date, mark = { st: 'saving' };
  if (avStatus[k] && avStatus[k].t) clearTimeout(avStatus[k].t);
  avStatus[k] = mark; render();
  // Quick taps on the same day: only the last one is sent (a moment after it).
  mark.t = setTimeout(() => {
    const body = { cohort, date, s: d.s || '', note: d.note || '' };
    avWaiting++;
    avQueue = avQueue.then(async () => {
      try {
        await call('saveAvail', body); // (just saves that day and says ok)
        if (avStatus[k] === mark) { mark.st = 'saved'; setTimeout(() => { if (avStatus[k] === mark) { delete avStatus[k]; render(); } }, 2200); }
      } catch (err) {
        if (avStatus[k] === mark) mark.st = 'err';
        if (!/connection|internet/i.test(err.message)) toast(err.message);
      }
      avWaiting--; render();
    });
  }, 350);
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
  const i = S.me.info, em = i.emergency || {}, w9 = S.me.w9 || {};
  return `<section class="box"><div class="box-head"><h2>W-9</h2>${w9.on ? '<span class="tag sage">On file ✓</span>' : '<span class="tag honey">Needed</span>'}</div>
    ${w9.on ? `<p class="small">Your W-9 is on file (sent ${longDay(w9.date)}). <button class="link" data-act="tab" data-t="w9">My info changed? Update my W-9</button></p>`
      : `<p class="small">Bella and Nick need a W-9 from everyone they pay. It takes about two minutes.</p><button class="btn primary small" data-act="tab" data-t="w9">Fill out W-9</button>`}
  </section>
  <section class="box"><div class="box-head"><h2>My info</h2></div>
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

/* ---------- W-9 (filled in here, on their phone; only the finished PDF is sent, to Bella's Drive) ---------- */
const W9_CLASSES = [['ind', 'Individual / sole proprietor'], ['ccorp', 'C corporation'], ['scorp', 'S corporation'], ['part', 'Partnership'], ['trust', 'Trust / estate'], ['llc', 'LLC'], ['other', 'Other']];
// The W-9 itself on screen (like the orientation roster): tap a field to fill it in, tap Sign Here to sign, then Send.
// Spots are in the PDF's own points (612 × 792, from the bottom), drawn over the page with an SVG of the same size.
const W9_SPOTS = {
  name: { x: 59, y: 660, w: 517, h: 14, label: '1. Your name (as shown on your tax return)', req: true },
  biz: { x: 59, y: 636, w: 517, h: 14, label: '2. Business name, if different (optional)' },
  cls: { x: 70, y: 551, w: 380, h: 64, label: '3. Tax classification', req: true },
  addr: { x: 59, y: 492, w: 329, h: 14, label: '5. Address (number, street, apt.)', req: true },
  city: { x: 59, y: 468, w: 329, h: 14, label: '6. City, state, and ZIP code', req: true },
  tin: { x: 414, y: 344, w: 166, h: 80, label: 'Taxpayer ID number (SSN or EIN)', req: true },
};
const W9_CHECK = [[73, 604], [180, 604], [252, 604], [324, 604], [389, 604], [73, 590], [73, 554]]; // (the 3a boxes)
const W9_SIGN = { x: 135, y: 190, w: 245, h: 26 };
const w9Data = () => S.w9 || (S.w9 = { name: S.me.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim(), biz: '', cls: '', llc: '', other: '', addr: '', city: '', tin: 'ssn', num: '', png: '' });
const w9Missing = d => ['name', 'cls', 'addr', 'city', 'tin', 'sig'].filter(k => k === 'sig' ? !d.png : k === 'tin' ? d.num.length !== 9 : k === 'cls' ? !d.cls || (d.cls === 'llc' && !d.llc) || (d.cls === 'other' && !d.other) : !d[k]);
function w9View() {
  const d = w9Data(), miss = w9Missing(d), Y = (y, h) => 792 - y - h;
  if (!S.w9img) setTimeout(renderW9Page, 0);
  const box = (k, val, extra = '') => { const s = W9_SPOTS[k], empty = s.req && miss.includes(k);
    return `<g class="w9-spot ${empty ? 'need' : ''}" data-act="w9field" data-k="${k}"><rect x="${s.x - 3}" y="${Y(s.y, s.h) - 3}" width="${s.w + 6}" height="${s.h + 6}" rx="2"/>${val}${extra}</g>`; };
  const t = (x, y, str, size = 10) => `<text x="${x}" y="${792 - y}" font-size="${size}">${esc(str)}</text>`;
  const ci = W9_CLASSES.findIndex(([k]) => k === d.cls);
  // The TIN one character per box (like the paper form), all but the last 4 hidden.
  const cells = (x, w, n) => Array.from({ length: n }, (_, i) => x + w / n * (i + .5));
  const tinX = d.tin === 'ssn' ? [...cells(418, 43, 3), ...cells(475, 29, 2), ...cells(518, 58, 4)] : [...cells(418, 29, 2), ...cells(461, 101, 7)];
  const tinShown = d.num.length === 9 ? d.num.split('').map((ch, i) => `<text x="${tinX[i]}" y="${792 - (d.tin === 'ssn' ? 403 : 355)}" font-size="12" text-anchor="middle">${i < 5 ? '•' : ch}</text>`).join('') : '';
  const req = (S.me.requester || '').split('\n').map((l, i) => t(393, 495 - i * 11, l, 9)).join('');
  const svg = `<svg class="w9-svg" viewBox="0 0 612 792" preserveAspectRatio="none">
    ${box('name', t(62, 663, d.name))}
    ${box('biz', t(62, 639, d.biz))}
    ${box('cls', ci >= 0 ? t(W9_CHECK[ci][0] + 0.5, W9_CHECK[ci][1] + 0.5, '✓', 10) + (d.cls === 'llc' && d.llc ? t(425, 591, d.llc) : '') + (d.cls === 'other' && d.other ? t(165, 555, d.other) : '') : '')}
    ${box('addr', t(62, 495, d.addr))}
    ${box('city', t(62, 471, d.city))}
    ${req}
    ${box('tin', tinShown)}
    <g class="w9-spot sign ${d.png ? 'done' : 'need'}" data-act="w9sign"><rect x="${W9_SIGN.x}" y="${Y(W9_SIGN.y, W9_SIGN.h)}" width="${W9_SIGN.w}" height="${W9_SIGN.h}" rx="3"/>
      ${d.png ? `<image href="${d.png}" x="${W9_SIGN.x + 4}" y="${Y(W9_SIGN.y, W9_SIGN.h) + 1}" width="${W9_SIGN.w - 8}" height="${W9_SIGN.h - 2}" preserveAspectRatio="xMinYMid meet"/>` : `<text class="sign-here" x="${W9_SIGN.x + W9_SIGN.w / 2}" y="${Y(W9_SIGN.y, W9_SIGN.h) + 17}" text-anchor="middle" font-size="12">Sign Here</text>`}</g>
    ${d.png ? t(410, 197, new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })) : ''}
  </svg>`;
  const next = miss[0];
  return `<section class="box w9-box"><div class="box-head"><h2>Form W-9</h2><button class="link" data-act="tab" data-t="info">Cancel</button></div>
    <div class="privacy"><span class="lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg></span>
      <p><b>Your W-9 is private.</b> Nothing you type here is saved in this app or on this website. The finished form goes straight to Elevate EMS's private payroll files, which only Bella and Nick can open.</p></div>
    <p class="small muted">Tap each yellow box to fill it in, then Sign Here.</p>
    <div class="w9-doc">${S.w9img ? `<img src="${S.w9img}" alt="Form W-9">` : '<div class="w9-loading">Opening the W-9…</div>'}${S.w9img ? svg : ''}</div>
    <div class="w9-foot">${next ? `<button class="btn" data-act="${next === 'sig' ? 'w9sign' : 'w9field'}" data-k="${next}">${miss.length === 6 ? 'Start' : 'Next'}: ${next === 'sig' ? 'Sign Here' : W9_SPOTS[next].label.replace(/^\d+\.\s*/, '').replace(/\s*\(.*\)$/, '')}</button>` : '<span class="small muted">All filled in.</span>'}
      <button class="btn primary" data-act="w9send" ${miss.length || S.busy ? 'disabled' : ''}>${S.busy ? 'Sending…' : 'Send W-9'}</button></div>
  </section>`;
}
// The blank page as a picture (once), sharp enough to read on a phone.
async function renderW9Page() {
  if (S.w9imgLoading) return;
  S.w9imgLoading = true;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', () => window.pdfjsLib);
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument('fw9.pdf').promise, page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 2.2 }), c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    S.w9img = c.toDataURL('image/jpeg', .85);
  } catch (e) { toast('Couldn’t open the W-9. Check your connection and try again.'); }
  S.w9imgLoading = false; render();
}
const loadScript = (src, ready) => ready() ? Promise.resolve() : new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => fail(new Error('load')); document.head.appendChild(sc); });
// Tapping a box: a pop-up with a big box to type in (or the choices).
function w9Field(k) {
  const d = w9Data(), s = W9_SPOTS[k];
  return new Promise(done => {
    const wrap = document.createElement('div');
    wrap.className = 'sig-overlay';
    let body;
    if (k === 'cls') body = W9_CLASSES.map(([v, l]) => `<label class="radio"><input type="radio" name="cls" value="${v}" ${d.cls === v || (!d.cls && v === 'ind') ? 'checked' : ''}> ${l}</label>`).join('')
      + `<label class="field llc-only">LLC tax classification<select name="llc"><option value="">Pick one</option>${[['C', 'C (C corporation)'], ['S', 'S (S corporation)'], ['P', 'P (Partnership)']].map(([x, l]) => `<option value="${x}" ${d.llc === x ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
      + `<label class="field other-only">Describe<input name="other" value="${esc(d.other)}"></label><p class="small muted">Most of our staff pick Individual / sole proprietor.</p>`;
    else if (k === 'tin') body = `<div class="seg">${[['ssn', 'Social Security #'], ['ein', 'EIN']].map(([v, l]) => `<label class="radio"><input type="radio" name="tin" value="${v}" ${d.tin === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <label class="field"><span class="tin-label">${d.tin === 'ein' ? 'EIN' : 'SSN'} (9 digits)</span><input name="num" class="secret" inputmode="numeric" autocomplete="off" maxlength="11" value="${esc(fmtTin(d.num, d.tin))}"></label>`;
    else body = `<label class="field"><input name="val" value="${esc(d[k])}" autocomplete="${k === 'name' ? 'name' : k === 'addr' ? 'address-line1' : 'off'}"></label>`;
    wrap.innerHTML = `<div class="sig-modal w9-pop"><div class="sig-head"><h2>${esc(s.label)}</h2><button class="sig-x" data-x aria-label="Cancel">×</button></div>
      <form>${body}<div class="sig-foot"><span></span><button class="btn primary">Done</button></div></form></div>`;
    document.body.appendChild(wrap);
    const f = wrap.querySelector('form'), show = () => {
      const c = (f.querySelector('[name=cls]:checked') || {}).value;
      f.querySelectorAll('.llc-only').forEach(x => { x.hidden = c !== 'llc'; });
      f.querySelectorAll('.other-only').forEach(x => { x.hidden = c !== 'other'; });
      const tl = f.querySelector('.tin-label'), tv = (f.querySelector('[name=tin]:checked') || {}).value;
      if (tl) tl.textContent = (tv === 'ein' ? 'EIN' : 'SSN') + ' (9 digits)';
    };
    show();
    f.addEventListener('change', show);
    f.addEventListener('input', e => { if (e.target.name === 'num') { const tv = (f.querySelector('[name=tin]:checked') || {}).value || 'ssn'; const v = fmtTin(e.target.value.replace(/\D/g, '').slice(0, 9), tv); if (e.target.value !== v) e.target.value = v; } });
    const first = f.querySelector('input:not([type=radio]), select'); if (first && k !== 'cls') first.focus(); // right away, on the same tap, so the iPhone keyboard opens
    const close = ok => { wrap.remove(); done(ok); };
    wrap.querySelector('[data-x]').onclick = () => close(false); // only × or Done close it (a tap that misses when the keyboard shifts the page shouldn't)
    f.onsubmit = e => {
      e.preventDefault();
      const g = n => (f.querySelector(`[name=${n}]`) || {}).value || '';
      if (k === 'cls') { d.cls = (f.querySelector('[name=cls]:checked') || {}).value || 'ind'; d.llc = g('llc'); d.other = g('other').trim(); }
      else if (k === 'tin') { d.tin = (f.querySelector('[name=tin]:checked') || {}).value || 'ssn'; d.num = g('num').replace(/\D/g, ''); if (d.num && d.num.length !== 9) { toast('That needs 9 digits.'); return; } }
      else d[k] = g('val').trim();
      close(true);
    };
  });
}
const fmtTin = (d, tin) => tin === 'ein' ? d.replace(/^(\d{2})(\d{1,7})?$/, (m, a, b) => [a, b].filter(Boolean).join('-')) : d.replace(/^(\d{3})(\d{1,2})?(\d{1,4})?$/, (m, a, b, c) => [a, b, c].filter(Boolean).join('-'));
let pdfLibLoading = null;
const loadPdfLib = () => window.PDFLib ? Promise.resolve() : (pdfLibLoading = pdfLibLoading || new Promise((ok, fail) => {
  const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  sc.onload = ok; sc.onerror = () => { pdfLibLoading = null; fail(new Error('Couldn’t load the W-9. Check your connection and try again.')); }; document.head.appendChild(sc);
}));
// The official form (fw9.pdf, Rev. March 2024), filled in, signed and dated, page 1 only, flattened.
async function buildW9(f, png) {
  await loadPdfLib();
  const doc = await PDFLib.PDFDocument.load(await fetch('fw9.pdf').then(r => r.arrayBuffer()));
  const form = doc.getForm(), P = 'topmostSubform[0].Page1[0].', B = P + 'Boxes3a-b_ReadOrder[0].';
  const text = (name, val) => { const t = form.getTextField(name); const max = t.getMaxLength(); t.setText(max ? String(val).slice(0, max) : String(val)); };
  text(P + 'f1_01[0]', f.name);
  if (f.biz) text(P + 'f1_02[0]', f.biz);
  form.getCheckBox(B + 'c1_1[' + W9_CLASSES.findIndex(([k]) => k === f.cls) + ']').check();
  if (f.cls === 'llc') text(B + 'f1_03[0]', f.llc);
  if (f.cls === 'other') text(B + 'f1_04[0]', f.other);
  text(P + 'Address_ReadOrder[0].f1_07[0]', f.addr);
  text(P + 'Address_ReadOrder[0].f1_08[0]', f.city);
  if (S.me.requester) text(P + 'f1_09[0]', S.me.requester);
  const d = f.num;
  if (f.tin === 'ssn') { text(P + 'f1_11[0]', d.slice(0, 3)); text(P + 'f1_12[0]', d.slice(3, 5)); text(P + 'f1_13[0]', d.slice(5)); }
  else { text(P + 'f1_14[0]', d.slice(0, 2)); text(P + 'f1_15[0]', d.slice(2)); }
  form.flatten();
  const page = doc.getPage(0), img = await doc.embedPng(png);
  const scale = Math.min(230 / img.width, 26 / img.height);
  page.drawImage(img, { x: 140, y: 192, width: img.width * scale, height: img.height * scale });
  page.drawText(new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }), { x: 410, y: 197, size: 10 });
  for (let i = doc.getPageCount() - 1; i > 0; i--) doc.removePage(i); // (the instructions pages aren't needed)
  return doc.saveAsBase64();
}

/* ---------- Doing things ---------- */
// Their last copy (kept on this phone until they sign out) shows right away; the fresh one replaces it.
const keepMe = me => keep('staff-me', me ? JSON.stringify(me) : null);
let lastLoad = 0;
async function loadMe() {
  S.loadingMe = true; lastLoad = Date.now(); if (S.me) render();
  try { S.me = await call('me'); keepMe(S.me); } catch (e) { if (!S.session) S.err = e.message; else toast(e.message); }
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
      S.me = await call('saveInfo', { phone: v('phone'), email: v('email'), emergency: { name: v('emName'), phone: v('emPhone'), relation: v('emRel') } }); keepMe(S.me);
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
  if (S.menu && (!el || el.dataset.act !== 'menu')) { S.menu = false; if (!el) { render(); return; } }
  if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'menu': S.menu = !S.menu; render(); break;
    case 'av': { const day = ((S.me.avail || []).find(x => x.cohort === d.cohort) || { days: [] }).days.find(x => x.date === d.date); if (day && (day.s !== d.s || (avStatus[d.cohort + '|' + d.date] || {}).st === 'err')) saveAvail(d.cohort, d.date, { s: d.s }); else render(); break; }
    case 'mode': S.mode = d.m; S.err = ''; S.note = ''; render(); window.scrollTo(0, 0); break;
    case 'tab': S.vals = {}; if (d.t !== 'w9') S.w9 = null; S.tab = d.t; keep('staff-tab', d.t); render(); window.scrollTo(0, 0); break;
    case 'signout': S.session = null; S.me = null; keep('staff-session', null); keep('staff-me', null); render(); window.scrollTo(0, 0); break;
    case 'refresh': if (!S.loadingMe) loadMe(); else render(); break;
    case 'w9field': if (await w9Field(d.k)) render(); break;
    case 'w9sign': { const png = await signPad('Sign your W-9', w9Data().name); if (png) { w9Data().png = png; render(); } break; }
    case 'w9send': sendW9(); break;
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
        if (tooEarly(d.date) && !(await shiftDone())) return;
      } else { start = day.start; end = day.end; }
      const hrs = hoursOf(start, end);
      const png = await signPad(`Sign for ${longDay(d.date)}`, `${mil(start)}–${mil(end)} · ${hrs} hrs · ${money(hrs * day.rate)}`);
      if (!png) return;
      S.busy = true; render();
      try { S.me = await call('signDay', { cohort: d.cohort, date: d.date, start, end, png }); keepMe(S.me); delete S.edit[k]; toast('Signed.'); }
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
  const li = t.closest('.day'), h = hoursOf(hm(ed.start), hm(ed.end));
  li.querySelector('.day-amt').innerHTML = h ? amtOf(h * day.rate) : li.dataset.empty;
  if (t.dataset.f === 'start' && digits.length === 4) { const nx = t.closest('.times').querySelector('[data-f="end"]'); if (nx && !nx.value) nx.focus(); } // on to End
});
// An availability note: saved when they leave the box.
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.avnote !== undefined) saveAvail(t.dataset.cohort, t.dataset.date, { note: t.value.trim() });
});
// "745" → "0745" when they leave the box.
document.addEventListener('focusout', e => {
  const t = e.target;
  if (!t.dataset || !t.dataset.k || !t.dataset.f) return;
  const v = hm(t.value);
  if (v && mil(v) !== t.value) { t.value = mil(v); (S.edit[t.dataset.k] || {})[t.dataset.f] = t.value; }
});

async function sendW9() {
  const d = w9Data();
  if (w9Missing(d).length) return;
  S.busy = true; render();
  try {
    const pdf = await buildW9(d, d.png);
    S.me = await call('submitW9', { pdf }); keepMe(S.me);
    S.w9 = null; // (nothing from it stays on the phone)
    S.tab = 'info'; keep('staff-tab', 'info'); toast('W-9 sent. Thank you!'); window.scrollTo(0, 0);
  } catch (err) { toast(err.message); }
  S.busy = false; render();
}

/* ---------- Signature pop-up ---------- */
// Signing today's day before 1600 (by the phone's clock): make sure the shift is really over first.
const tooEarly = date => { const n = new Date(), today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; return date === today && n.getHours() < 16; };
function shiftDone() {
  return new Promise(done => {
    const wrap = document.createElement('div');
    wrap.className = 'sig-overlay';
    wrap.innerHTML = `<div class="sig-modal ask"><h2>Is your shift finished?</h2><p>Only sign your timesheet once your work for the day is done.</p>
      <div class="sig-foot"><button class="btn" data-no>Not yet</button><button class="btn primary" data-yes>Yes, sign</button></div></div>`;
    document.body.appendChild(wrap);
    const close = v => { wrap.remove(); done(v); };
    wrap.querySelector('[data-no]').onclick = () => close(false);
    wrap.querySelector('[data-yes]').onclick = () => close(true);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(false); });
  });
}
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
    name: 'Jason Kearney', today: iso(t), w9: { on: !!window.sampleW9, date: iso(t) }, requester: 'Elevate EMS, LLC\n8401 Mayland Dr #6015\nRichmond, VA 23294', rates: { 'EC & Equivalent': 35, 'Non-Certified Instructor': 30, Assistant: 25, Patient: 17.5 },
    info: { phone: '609-850-1006', email: 'jason@example.com', emergency: { name: 'Jane Kearney', phone: '609-555-0100', relation: 'Mom' } },
    cohorts: [{ cohort: 'Spring 2027', total: 255, unpaid: 255, paid: false, flats: [],
      days: [
        { n: 1, date: back(3), sched: '0800–1700', role: 'Non-Certified Instructor', rate: 30, start: '08:00', end: '16:30', hours: 8.5, total: 255, row: 5, canEdit: true, editable: true, signed: true },
        { n: 2, date: back(2), sched: '0800–1700', role: 'Non-Certified Instructor', rate: 30, start: '08:00', end: '17:00', hours: 9, total: 270, row: 6, canEdit: true, editable: true, needsSig: true, fix: { by: 'Bella', from: '0800–1630' } },
        { n: 3, date: back(1), sched: '0730–1700', role: 'Non-Certified Instructor', rate: 30, start: '', end: '', hours: 0, total: 0, row: 0, canEdit: true, editable: true },
        { n: 5, date: back(-3), sched: '0800–1700', exam: true, role: 'Non-Certified Instructor', rate: 30, future: true },
      ] }],
    history: [{ cohort: 'Summer 2026', check: '', amount: 450, last: '2026-08-09', what: 'Summer 2026 academy week', pdf: false }],
    avail: window.sampleAvail || (window.sampleAvail = [
      { cohort: 'Spring 2027', start: back(-40), lockOn: back(-26), locked: false, days: [0, 1, 2, 3, 4].map(i => ({ date: back(-40 - i), label: '', exam: i === 4, s: i === 0 ? 'yes' : i === 2 ? 'maybe' : '', note: i === 2 ? 'Can stay until 1500' : '', by: i === 0 ? 'Bella' : '' })) },
      { cohort: 'Fall 2026', start: back(-10), lockOn: back(4), locked: true, days: [0, 1, 2, 3, 4].map(i => ({ date: back(-10 - i), label: '', exam: i === 4, s: i < 3 ? 'yes' : 'no', note: '', by: '' })) }]),
  });
  if (action === 'login' || action === 'setupAccount' || action === 'reset') return Promise.resolve({ session: 'sample', name: 'Jason Kearney' });
  if (action === 'forgot') return Promise.resolve({ message: 'If that email has an account, a reset link is on its way. It works for an hour.' });
  if (action === 'submitW9') { window.sampleW9 = p.pdf; return Promise.resolve(me()); }
  if (action === 'saveAvail') { const d = me().avail.find(w => w.cohort === p.cohort).days.find(x => x.date === p.date); Object.assign(d, { s: p.s, note: p.note, by: '' }); return new Promise(r => setTimeout(() => r({ day: d }), 400)); }
  if (action === 'changePassword') return Promise.resolve({ session: 'sample', message: 'Password changed.' });
  return Promise.resolve(me());
}

// Coming back to the app (opened from the Home Screen, switched back to, phone unlocked): check for changes on its own.
// (Not in the middle of signing or the W-9, and not more than every 20 seconds.)
function autoCheck() {
  if (!S.session || S.loadingMe || Date.now() - lastLoad < 20000 || S.tab === 'w9' || document.querySelector('.sig-overlay')) return;
  loadMe();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoCheck(); });
window.addEventListener('pageshow', e => { if (e.persisted) autoCheck(); });

if (S.session) { try { S.me = JSON.parse(keep('staff-me') || 'null'); } catch { S.me = null; } }
render();
if (S.session) loadMe();
