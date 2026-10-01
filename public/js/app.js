/*
 * app.js — the teacher-facing app.
 *
 * Screens: All courses (landing + screening), Course (assignments list and
 * student × assignment overview), Review dashboard (one assignment),
 * Submission review (rubric marking), Rules & Test Lab, Export, Admin.
 *
 * All flag logic lives in engine.js. This file displays results and records
 * the teacher's own judgements (rubric marks and Approve / Flag / Comment).
 * Flags are prompts to look closer; the teacher always decides.
 */
(function () {
  'use strict';

  const E = window.Engine;
  const CASES = window.TestCases;
  const STORE_KEY = 'lane2-merged-state';

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pct = (x) => Math.round((x || 0) * 100) + '%';
  const uid = (p) => (p || 'id') + Math.random().toString(36).slice(2, 9);
  const fullName = (p) => p ? (p.firstName + ' ' + p.lastName).trim() : 'Unknown student';
  const initials = (p) => p ? ((p.firstName || ' ')[0] + (p.lastName || ' ')[0]).toUpperCase() : '?';
  const plural = (n, w, pl) => n + ' ' + (n === 1 ? w : (pl || w + 's'));
  const tip = (text) => text ? ' data-tip="' + esc(text) + '"' : '';
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }); };
  const fmtDay = (ymd) => { if (!ymd) return 'No date'; const d = new Date(ymd + 'T12:00:00'); return isNaN(d) ? ymd : d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const fmtTime = (sec) => { sec = Math.round(sec || 0); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const DAY = 86400000;
  function gap(fromIso, toIso) {
    const h = (new Date(toIso) - new Date(fromIso)) / 3600000;
    if (!(h >= 0)) return '';
    if (h < 1) return 'under an hour';
    if (h < 36) return plural(Math.round(h), 'hour');
    return plural(Math.round(h / 24), 'day');
  }

  const ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 17h.01"/><path d="M10 3.5 2.8 17a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L14 3.5a2.2 2.2 0 0 0-4 0Z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4 4 0 0 0-4 4v1H6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3h-2V7a4 4 0 0 0-4-4ZM8 13h.01M16 13h.01M9 17h6"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 21.5A2.5 2.5 0 0 1 7.5 19H20"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 4a3 3 0 0 1 0 6M21 20v-2a4 4 0 0 0-3-3.9"/></svg>',
    flask: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 3h5M8.5 3v4L4 14.5A2 2 0 0 0 5.7 17.5h8.6a2 2 0 0 0 1.7-3L11.5 7V3"/></svg>',
    plus: '<span class="button-plus" aria-hidden="true">+</span>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6zM9 12l2 2 4-4"/></svg>'
  };

  const DECISIONS = {
    changed: { label: 'Changed', cls: 'd-changed', tip: 'The student changed the AI output before using it.' },
    not_used: { label: 'Not used', cls: 'd-notused', tip: 'The student decided not to use the AI output.' },
    unchanged: { label: 'Used unchanged', cls: 'd-unchanged', tip: 'The student used the AI output as it was.' },
    unrecorded: { label: 'Not recorded', cls: 'd-unrecorded', tip: 'The student did not say what they did with the output.' }
  };
  const REVIEW = { not_reviewed: 'Not reviewed', in_progress: 'In progress', reviewed: 'Reviewed' };
  const STAGES = {
    not_started: { label: 'Not started', cls: 'stage-none', tip: 'No AI log attached and nothing handed in yet.' },
    logs_attached: { label: 'Log attached', cls: 'stage-logs', tip: 'The student has attached their AI conversation but has not handed in the final work yet.' },
    handed_in: { label: 'Handed in', cls: 'stage-in', tip: 'AI log attached first, then the final work was handed in.' }
  };
  const MARK = {
    approve: { label: 'Approve', icon: ICON.check, tip: 'No concern for this criterion.' },
    flag: { label: 'Flag', icon: ICON.flag, tip: 'Concern: follow this up.' },
    comment: { label: 'Comment', icon: ICON.comment, tip: 'Add a note for this criterion.' }
  };
  const VOCAB_LABELS = {
    genericPhrases: ['Stock phrases', 'Reflections matching these count as generic.'],
    checkWords: ['Words that show a check', 'e.g. "searched", "library", "Stats NZ". Used for levels and the unchanged rule.'],
    evaluativeWords: ['Words that show a judgement', 'e.g. "because", "wrong", "overstates".'],
    correctionWords: ['Words that show a correction', 'e.g. "fixed", "rewrote", "removed".'],
    aiStylePhrases: ['Phrases common in AI-written text', 'Used by the simulated AI-style check only.'],
    pushbackWords: ['Pushback in a chat', 'When the student\'s next chat message contains these, it is kept as evidence.']
  };
  const RULE_ICONS = { noCritique: 'rose', shortCritique: 'amber', genericCritique: 'amber', unchangedNoCheck: 'teal', repeatsOutput: 'rose', belowLevel: 'blue', aiStyle: 'blue', mostlyUnchanged: 'teal', highShared: 'rose', noEvidence: 'amber' };

  /* ------------------------------------------------------------------ */
  /* State and storage                                                   */
  /* ------------------------------------------------------------------ */
  let state = null;
  let mode = 'server';
  let saving = false;
  let saveTimer = null;
  let lastSync = null;
  const statsCache = new Map();

  const ui = {
    view: 'home', courseId: null, assignmentId: null, subId: null, adminTab: 'courses',
    homeFilter: 'all',
    search: '', group: 'all', stage: 'active', onlyFlagged: false, ruleFilter: null, levelFilter: null, decisionFilter: null, sort: 'flags',
    sandbox: { output: CASES[1].output, critique: 'The list is useful but adaptability is vague, so I replaced it with an example from my retail job.', decision: 'changed' },
    caseChanged: {}, lastImpact: null,
    open: {}, critOpen: {}, railComment: false, timer: null, exportSub: '', peopleCourse: 'all', courseMenu: false
  };

  function validState(d) { return d && Array.isArray(d.courses) && Array.isArray(d.assignments) && Array.isArray(d.submissions) && Array.isArray(d.students); }

  function normalise() {
    state.teacher = state.teacher || { name: 'Teacher', first: 'there', initials: 'T', role: 'Teaching staff' };
    state.staff = state.staff || [];
    state.courses.forEach((c) => { c.roster = c.roster || []; });
    state.assignments.forEach((a) => {
      a.settings = E.normaliseSettings(a.settings);
      a.rubric = a.rubric || [];
    });
    state.submissions.forEach((s) => {
      s.interactions = s.interactions || [];
      s.sources = s.sources || [];
      s.review = Object.assign({ status: 'not_reviewed', decision: null, comment: '', marks: {}, seconds: 0 }, s.review);
      s.review.marks = s.review.marks || {};
    });
  }

  async function load() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error('no server');
      state = await r.json();
      mode = 'server';
    } catch (e) {
      mode = 'local';
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (err) { /* storage blocked */ }
      state = validState(saved) ? saved : clone(window.SEED_DATA);
    }
    if (!validState(state)) state = clone(window.SEED_DATA);
    normalise();
    if (/[?&]embed=1/.test(location.search)) document.body.classList.add('embed');
    lastSync = new Date();
    route();
    setSync();
    if (mode === 'server') setInterval(poll, 15000);
  }

  function save() {
    statsCache.clear();
    clearTimeout(saveTimer);
    saving = true;
    setSync('Saving…');
    saveTimer = setTimeout(persist, 350);
  }

  async function persist() {
    try {
      if (mode === 'server') {
        const r = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'server error');
        state.updatedAt = j.updatedAt;
      } else {
        state.updatedAt = new Date().toISOString();
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      }
      lastSync = new Date();
      saving = false;
      setSync();
    } catch (e) {
      saving = false;
      setSync('Not saved: ' + e.message, true);
    }
  }

  // Live view: pick up changes saved by another marker or browser tab.
  async function poll() {
    if (saving || ui.timer || $('#modalRoot').children.length) return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const fresh = await r.json();
      lastSync = new Date();
      if (validState(fresh) && fresh.updatedAt && fresh.updatedAt !== state.updatedAt) {
        state = fresh;
        normalise();
        statsCache.clear();
        render();
      }
      setSync();
    } catch (e) { setSync('Server not reachable. Changes will not be saved.', true); }
  }

  function setSync(msg, bad) {
    const el = $('#sync');
    if (!el) return;
    const where = mode === 'server' ? 'Saved to data/db.json' : 'Saved in this browser only';
    el.textContent = msg || (where + (lastSync ? ' · ' + lastSync.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }) : ''));
    $('#syncDot').classList.toggle('bad', !!bad);
  }

  /* ------------------------------------------------------------------ */
  /* Lookups and derived numbers                                         */
  /* ------------------------------------------------------------------ */
  const course = (id) => state.courses.find((c) => c.id === id);
  const asg = (id) => state.assignments.find((a) => a.id === id);
  const person = (id) => state.students.find((p) => p.id === id);
  const sub = (id) => state.submissions.find((s) => s.id === id);
  const byDue = (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '');
  const courseAssignments = (cid) => state.assignments.filter((a) => a.courseId === cid).sort(byDue);
  const asgSubs = (aid) => state.submissions.filter((s) => s.assignmentId === aid);
  const subName = (s) => fullName(person(s.studentId));
  const groupOf = (s) => { const a = asg(s.assignmentId); const c = a && course(a.courseId); const r = c && c.roster.find((x) => x.studentId === s.studentId); return r ? r.group : ''; };
  const isOpen = (a) => new Date((a.dueDate || '2999-01-01') + 'T23:59:59') >= new Date();
  function dueText(a) {
    if (!a.dueDate) return 'No due date';
    const due = new Date(a.dueDate + 'T23:59:59');
    const days = Math.ceil((due - new Date()) / DAY);
    if (days < 0) return 'Closed ' + plural(-days, 'day') + ' ago';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return 'Due in ' + plural(days, 'day');
  }

  /** Numbers for one assignment, cached until the next save or render. */
  function stats(a) {
    if (statsCache.has(a.id)) return statsCache.get(a.id);
    const subs = asgSubs(a.id);
    const active = subs.filter((s) => s.stage !== 'not_started');
    const handed = subs.filter((s) => s.stage === 'handed_in');
    const c = E.evaluateClass(active, a.settings);
    const evalById = {};
    c.rows.forEach((r) => { evalById[r.student.id] = r.eval; });
    const flagged = (s) => evalById[s.id] && evalById[s.id].flagCount > 0;
    const out = {
      subs, active, handed, c, evalById,
      enrolled: subs.length,
      logsOnly: subs.filter((s) => s.stage === 'logs_attached').length,
      notStarted: subs.length - active.length,
      reviewed: handed.filter((s) => s.review.status === 'reviewed').length,
      toReview: handed.filter((s) => s.review.status !== 'reviewed').length,
      needs: handed.filter((s) => flagged(s) && s.review.status !== 'reviewed').length,
      flaggedStudents: active.filter(flagged).length,
      approved: subs.filter((s) => s.review.decision === 'approve').length,
      teacherFlagged: subs.filter((s) => s.review.decision === 'flag').length
    };
    statsCache.set(a.id, out);
    return out;
  }
  function evalOf(s) { const a = asg(s.assignmentId); return stats(a).evalById[s.id] || E.evaluateStudent(s, a.settings); }

  function courseStats(cid) {
    const list = courseAssignments(cid).map(stats);
    const sum = (k) => list.reduce((n, x) => n + x[k], 0);
    return { needs: sum('needs'), toReview: sum('toReview'), reviewed: sum('reviewed'), handed: list.reduce((n, x) => n + x.handed.length, 0), flagged: sum('flaggedStudents') };
  }

  function criterionInfo(a, c) {
    if (c.type === 'rule') {
      const r = E.RULE_BY_KEY[c.ruleKey];
      return { name: r ? r.name : c.ruleKey, description: r ? r.describe(a.settings.rules[c.ruleKey]) : '' };
    }
    return { name: c.name, description: c.description || '' };
  }

  function rubricProgress(s, a) {
    const steps = s.interactions.length;
    const total = steps * a.rubric.length;
    let marked = 0; let approve = 0; let flag = 0; let comments = 0;
    s.interactions.forEach((i) => {
      const m = s.review.marks[i.id] || {};
      a.rubric.forEach((c) => {
        const x = m[c.id];
        if (!x) return;
        if (x.mark) marked++;
        if (x.mark === 'approve') approve++;
        if (x.mark === 'flag') flag++;
        if (x.comment) comments++;
      });
    });
    return { total, marked, approve, flag, comments };
  }

  /** Review status follows the teacher's actions. */
  function touchReview(s) {
    const r = s.review;
    const anyMark = Object.values(r.marks || {}).some((m) => Object.values(m).some((x) => x && (x.mark || x.comment)));
    r.status = r.decision ? 'reviewed' : (anyMark || r.comment || r.seconds > 0) ? 'in_progress' : 'not_reviewed';
  }

  /** Order used for "previous / next student" inside an assignment. */
  function reviewQueue(a) {
    const st = stats(a);
    return st.active.slice().sort((x, y) => (st.evalById[y.id].flagCount - st.evalById[x.id].flagCount) || subName(x).localeCompare(subName(y)));
  }

  function nextToReview(list) {
    for (const a of list) {
      const st = stats(a);
      const q = reviewQueue(a).filter((s) => s.stage === 'handed_in' && s.review.status !== 'reviewed');
      const flagged = q.find((s) => st.evalById[s.id].flagCount > 0);
      if (flagged || q[0]) return flagged || q[0];
    }
    return null;
  }

  function defaultAssignment(cid) {
    const list = courseAssignments(cid);
    return (list.find((a) => stats(a).needs > 0) || list.filter((a) => !isOpen(a)).pop() || list[0] || {}).id || null;
  }

  /* ------------------------------------------------------------------ */
  /* Routing                                                             */
  /* ------------------------------------------------------------------ */
  const VIEWS = { home: viewHome, course: viewCourse, assignment: viewAssignment, review: viewReview, rules: viewRules, export: viewExport, admin: viewAdmin };

  function setContext(view, id) {
    ui.view = view;
    if (view === 'course' && course(id)) {
      ui.courseId = id;
      if (!ui.assignmentId || asg(ui.assignmentId).courseId !== id) ui.assignmentId = defaultAssignment(id);
    } else if (['assignment', 'rules', 'export'].includes(view) && asg(id)) {
      if (ui.assignmentId !== id) resetFilters();
      ui.assignmentId = id; ui.courseId = asg(id).courseId;
    } else if (view === 'review' && sub(id)) {
      ui.subId = id; ui.assignmentId = sub(id).assignmentId; ui.courseId = asg(ui.assignmentId).courseId;
    } else if (view === 'admin') {
      ui.adminTab = ['courses', 'assignments', 'people', 'canvas'].includes(id) ? id : ui.adminTab;
    } else if (view !== 'home') {
      ui.view = 'home';
    }
  }
  function resetFilters() { Object.assign(ui, { search: '', group: 'all', stage: 'active', onlyFlagged: false, ruleFilter: null, levelFilter: null, decisionFilter: null, caseChanged: {}, lastImpact: null }); }

  function hashFor() {
    const id = { course: ui.courseId, assignment: ui.assignmentId, rules: ui.assignmentId, export: ui.assignmentId, review: ui.subId, admin: ui.adminTab }[ui.view];
    return '#' + ui.view + (id ? '/' + id : '');
  }

  function go(view, id) {
    if (ui.timer && view !== 'review') stopTimer(true);
    setContext(view, id);
    const h = hashFor();
    if (location.hash !== h) history.pushState(null, '', h + '');
    ui.courseMenu = false;
    closeSidebar();
    render();
    window.scrollTo(0, 0);
    const m = $('#main'); if (m) m.focus({ preventScroll: true });
  }

  function route() {
    const [view, id] = location.hash.replace('#', '').split('/');
    setContext(VIEWS[view] ? view : 'home', id);
    render();
  }
  window.addEventListener('popstate', route);

  function render() {
    statsCache.clear();
    renderSidebar();
    renderCrumbs();
    $('#main').innerHTML = '<div class="page active view-' + ui.view + '">' + VIEWS[ui.view]() + '</div>';
    if (ui.view === 'assignment') renderRows();
    updateTimer();
    hideTip();
  }

  /* ------------------------------------------------------------------ */
  /* Sidebar, course menu and breadcrumbs                                */
  /* ------------------------------------------------------------------ */
  function renderSidebar() {
    const c = course(ui.courseId);
    $('#courseBadge').textContent = c ? c.badge : '··';
    $('#courseCode').textContent = c ? c.code : 'All courses';
    $('#courseSemester').textContent = c ? c.name : 'Choose a course';
    $('#courseButton').setAttribute('aria-expanded', String(ui.courseMenu));
    const menu = $('#courseMenu');
    menu.hidden = !ui.courseMenu;
    menu.innerHTML = '<button type="button" role="option" class="course-option' + (!c && ui.view === 'home' ? ' on' : '') + '" data-action="pick-course" data-id=""><span class="course-code small">★</span><span><strong>All courses</strong><small>Overview and screening</small></span></button>' +
      state.courses.map((x) => {
        const cs = courseStats(x.id);
        return '<button type="button" role="option" class="course-option' + (c && c.id === x.id ? ' on' : '') + '" data-action="pick-course" data-id="' + x.id + '"><span class="course-code small">' + esc(x.badge) + '</span><span><strong>' + esc(x.code) + '</strong><small>' + esc(x.name) + '</small></span>' + (cs.needs ? '<span class="nav-count"' + tip(cs.needs + ' flagged submissions waiting for your review') + '>' + cs.needs + '</span>' : '') + '</button>';
      }).join('');
    const active = { review: 'assignment' }[ui.view] || ui.view;
    $$('.nav-item').forEach((n) => {
      const on = n.dataset.nav === active;
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    const a = asg(ui.assignmentId);
    const count = a ? stats(a).needs : 0;
    const badge = $('#navReviewCount');
    badge.hidden = !count;
    badge.textContent = count;
    badge.title = count + ' flagged submissions not yet reviewed in ' + (a ? a.short : '');
    $('#profileInitials').textContent = state.teacher.initials;
    $('#profileName').textContent = state.teacher.name;
    $('#profileRole').textContent = state.teacher.role;
  }

  function renderCrumbs() {
    const parts = [['home', '', 'All courses']];
    const c = course(ui.courseId);
    const a = asg(ui.assignmentId);
    if (ui.view === 'admin') parts.push(['admin', ui.adminTab, 'Admin']);
    else if (ui.view !== 'home' && c) {
      parts.push(['course', c.id, c.code]);
      if (ui.view !== 'course' && a) parts.push(['assignment', a.id, a.short]);
      if (ui.view === 'rules') parts.push(['rules', a.id, 'Rules & Test Lab']);
      if (ui.view === 'export') parts.push(['export', a.id, 'Export']);
      if (ui.view === 'review' && sub(ui.subId)) parts.push(['review', ui.subId, subName(sub(ui.subId))]);
    }
    $('#crumbs').innerHTML = parts.map((p, i) => i === parts.length - 1
      ? '<span aria-current="page">' + esc(p[2]) + '</span>'
      : '<button type="button" class="crumb" data-action="go" data-view="' + p[0] + '" data-id="' + esc(p[1]) + '">' + esc(p[2]) + '</button><span class="crumb-sep" aria-hidden="true">›</span>').join('');
  }

  /* ------------------------------------------------------------------ */
  /* Small display pieces                                                */
  /* ------------------------------------------------------------------ */
  function heading(eyebrow, title, sub, actions) {
    return '<div class="page-heading"><div><span class="eyebrow accent">' + eyebrow + '</span><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="heading-actions">' + actions + '</div>' : '') + '</div>';
  }
  function metric(o) {
    const tag = o.action ? 'button type="button" data-action="' + o.action + '"' + (o.data || '') : 'article';
    return '<' + tag + ' class="metric-card' + (o.cls ? ' ' + o.cls : '') + (o.action ? ' clickable' : '') + (o.on ? ' on' : '') + '"' + tip(o.tip) + '>' +
      '<div class="metric-top"><span class="metric-icon ' + (o.tone || 'ink') + '">' + (o.icon || ICON.doc) + '</span>' + (o.trend ? '<span class="trend' + (o.good ? ' positive' : '') + '">' + o.trend + '</span>' : '') + '</div>' +
      '<strong>' + o.value + (o.unit ? '<span class="unit">' + o.unit + '</span>' : '') + '</strong><span>' + o.label + '</span>' +
      (o.meter != null ? '<div class="meter ' + (o.meterTone || '') + '"><i style="width:' + Math.max(0, Math.min(100, o.meter)) + '%"></i></div>' : '') +
      (o.small ? '<small>' + o.small + '</small>' : '') + '</' + (o.action ? 'button' : 'article') + '>';
  }
  function avatar(p, size) { return '<span class="avatar ' + esc((p && p.avatar) || 'avatar-blue') + (size ? ' ' + size : '') + '">' + esc(initials(p)) + '</span>'; }
  function decisionBadge(d) { const x = DECISIONS[d] || DECISIONS.unrecorded; return '<span class="badge ' + x.cls + '"' + tip(x.tip) + '>' + x.label + '</span>'; }
  function levelBadge(l) { return '<span class="level l' + l.level + '"' + tip(l.why) + '>Level ' + l.level + ': ' + esc(l.name) + '</span>'; }
  function stagePill(s) {
    const x = STAGES[s.stage];
    let t = x.tip;
    if (s.stage === 'handed_in' && s.logsAttachedAt) t = 'AI log attached ' + fmtDate(s.logsAttachedAt) + ', handed in ' + fmtDate(s.handedInAt) + ' (' + gap(s.logsAttachedAt, s.handedInAt) + ' later).';
    if (s.stage === 'logs_attached') t = 'AI log attached ' + fmtDate(s.logsAttachedAt) + '. Final work not handed in yet.';
    if (s.declaration === 'no_ai') t = 'Declared no AI use' + (s.handedInAt ? ', handed in ' + fmtDate(s.handedInAt) : '') + '.';
    return '<span class="stage-pill ' + x.cls + '"' + tip(t) + '>' + (s.declaration === 'no_ai' ? 'No AI declared' : x.label) + '</span>';
  }
  function decisionPill(s) {
    const r = s.review;
    if (r.decision === 'approve') return '<span class="decision-pill approve"' + tip('You approved this submission.' + (r.comment ? ' Comment: ' + r.comment : '')) + '>' + ICON.check + 'Approved</span>';
    if (r.decision === 'flag') return '<span class="decision-pill flag"' + tip('You flagged this submission.' + (r.comment ? ' Comment: ' + r.comment : '')) + '>' + ICON.flag + 'Flagged</span>';
    if (s.stage !== 'handed_in' && r.status === 'not_reviewed') return '<span class="muted">Not handed in</span>';
    return '<span class="status-pill ' + (r.status === 'in_progress' ? 'ready' : 'todo') + '">' + REVIEW[r.status] + '</span>';
  }
  function strip(e) {
    if (!e.interactions.length) return '<span class="muted">No AI steps</span>';
    return '<span class="strip" aria-label="' + plural(e.interactions.length, 'interaction') + '">' + e.interactions.map((i) => {
      const d = DECISIONS[i.decision] || DECISIONS.unrecorded;
      return '<span class="cell ' + d.cls + (i.result.flags.length ? ' flagged' : '') + '"' + tip('Step ' + i.step + ': ' + i.task + ' (' + d.label + (i.result.flags.length ? ', ' + plural(i.result.flags.length, 'flag') + ': ' + i.result.flags.map((f) => f.name).join(', ') : '') + ')') + '></span>';
    }).join('') + '</span>';
  }
  function flagSummary(e) {
    const names = {};
    e.interactions.forEach((i) => i.result.flags.forEach((f) => { names[f.name] = (names[f.name] || 0) + 1; }));
    e.patternFlags.forEach((f) => { names[f.name] = (names[f.name] || 0) + 1; });
    return Object.keys(names).map((n) => n + (names[n] > 1 ? ' ×' + names[n] : '')).join(', ');
  }
  function stackBar(parts, label) {
    const total = parts.reduce((n, p) => n + p.n, 0) || 1;
    return '<span class="stack" role="img" aria-label="' + esc(label) + '">' + parts.filter((p) => p.n > 0).map((p) => '<i class="' + p.cls + '" style="width:' + (p.n / total * 100) + '%"' + tip(p.label + ': ' + p.n) + '></i>').join('') + '</span>';
  }
  function pipeline(st) {
    return stackBar([
      { n: st.handed.length, cls: 'stage-in', label: 'Handed in' },
      { n: st.logsOnly, cls: 'stage-logs', label: 'AI log attached, not handed in' },
      { n: st.notStarted, cls: 'stage-none', label: 'Not started' }
    ], 'Submission progress');
  }
  function assignmentOptions(selected) {
    return state.courses.map((c) => '<optgroup label="' + esc(c.code) + '">' + courseAssignments(c.id).map((a) =>
      '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.short + ': ' + trunc(a.title.replace(/^[^:]*:\s*/, ''), 48)) + '</option>').join('') + '</optgroup>').join('');
  }
  function emptyState(text, action) { return '<div class="empty-state">' + ICON.info + '<p>' + text + '</p>' + (action || '') + '</div>'; }

  /* ---- charts (plain SVG, no libraries) ---- */
  function decisionChart(dec) {
    const total = Object.values(dec).reduce((a, b) => a + b, 0) || 1;
    const keys = ['changed', 'not_used', 'unchanged', 'unrecorded'];
    const segs = keys.filter((k) => dec[k] > 0).map((k) =>
      '<button type="button" class="hseg ' + DECISIONS[k].cls + (ui.decisionFilter === k ? ' on' : '') + '" style="flex:' + dec[k] + '" data-action="filter-decision" data-key="' + k + '"' + tip(DECISIONS[k].label + ': ' + dec[k] + ' steps (' + Math.round(dec[k] / total * 100) + '%). Click to show students with at least one.') + '><span class="sr">' + DECISIONS[k].label + '</span></button>').join('');
    const legend = keys.filter((k) => dec[k] > 0 || k !== 'unrecorded').map((k) =>
      '<li><span class="key ' + DECISIONS[k].cls + '"></span>' + DECISIONS[k].label + ' <b>' + dec[k] + '</b> <span class="muted">' + Math.round(dec[k] / total * 100) + '%</span></li>').join('');
    return '<div class="hbar">' + segs + '</div><ul class="legend">' + legend + '</ul>';
  }
  function levelChart(levels) {
    const max = Math.max.apply(null, levels.concat([1]));
    const W = 320, H = 150, bw = 44, g = (W - bw * 5) / 6;
    const bars = levels.map((n, i) => {
      const h = Math.max(2, Math.round((n / max) * (H - 44)));
      const x = g + i * (bw + g);
      return '<g class="lvbar' + (ui.levelFilter === i ? ' on' : '') + '" data-action="filter-level" data-level="' + i + '" role="button" tabindex="0"' + tip('Level ' + i + ' ' + E.LEVELS[i].name + ': ' + n + ' steps. ' + E.LEVELS[i].text + ' Click to filter.') + '>' +
        '<rect x="' + (x - g / 2) + '" y="0" width="' + (bw + g) + '" height="' + H + '" class="hit"></rect>' +
        '<rect x="' + x + '" y="' + (H - 22 - h) + '" width="' + bw + '" height="' + h + '" rx="3" class="lv l' + i + '"></rect>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 27 - h) + '" text-anchor="middle" class="num">' + n + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="axis">' + i + '</text></g>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="cols" role="img" aria-label="Critique levels across the class">' + bars + '</svg>' +
      '<p class="caption">0 None · 1 Acknowledged · 2 Described · 3 Evaluated · 4 Verified and acted</p>';
  }
  function ruleChart(a, byRule) {
    const items = E.RULES.filter((r) => a.settings.rules[r.key].enabled).map((r) => ({ r, n: byRule[r.key] || 0 })).sort((x, y) => y.n - x.n);
    const max = Math.max.apply(null, items.map((i) => i.n).concat([1]));
    return '<ul class="rulebars">' + items.map(({ r, n }) =>
      '<li><button type="button" class="rb' + (ui.ruleFilter === r.key ? ' on' : '') + '" data-action="filter-rule" data-rule="' + r.key + '" ' + (n ? '' : 'disabled') + ' aria-pressed="' + (ui.ruleFilter === r.key) + '"' + tip(r.describe(a.settings.rules[r.key]) + (n ? ' Click to show only these students.' : '')) + '>' +
      '<span class="rb-name">' + esc(r.name) + (r.simulated ? ' <em>(simulated)</em>' : '') + '</span>' +
      '<span class="rb-bar"><span style="width:' + (n / max * 100) + '%"></span></span><span class="rb-n">' + n + '</span></button></li>').join('') + '</ul>';
  }

  /* ------------------------------------------------------------------ */
  /* View: All courses (landing + screening)                             */
  /* ------------------------------------------------------------------ */
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

  function viewHome() {
    const all = state.assignments.map((a) => ({ a, st: stats(a) }));
    const sum = (k) => all.reduce((n, x) => n + x.st[k], 0);
    const openN = all.filter((x) => isOpen(x.a)).length;
    const next = nextToReview(state.assignments.slice().sort(byDue));
    const cards = state.courses.map((c) => {
      const cs = courseStats(c.id);
      const list = courseAssignments(c.id);
      const upcoming = list.filter(isOpen)[0];
      return '<button type="button" class="course-card" data-action="go" data-view="course" data-id="' + c.id + '"' + tip('Open ' + c.code + ': ' + list.length + ' assignments, ' + c.roster.length + ' students') + '>' +
        '<span class="cc-top"><span class="course-code big">' + esc(c.badge) + '</span>' + (cs.needs ? '<span class="pill count-pill">' + cs.needs + ' to review</span>' : '<span class="pill ok-pill">Up to date</span>') + '</span>' +
        '<strong>' + esc(c.code) + '</strong><span class="cc-name">' + esc(c.name) + '</span>' +
        '<span class="cc-stats"><span><b>' + c.roster.length + '</b> students</span><span><b>' + list.length + '</b> assignments</span><span><b>' + cs.flagged + '</b> flagged</span></span>' +
        '<span class="meter teal"><i style="width:' + (cs.handed ? cs.reviewed / cs.handed * 100 : 0) + '%"></i></span>' +
        '<small>' + cs.reviewed + ' of ' + cs.handed + ' handed-in submissions reviewed</small>' +
        '<small class="cc-next">' + (upcoming ? 'Next due: ' + esc(upcoming.short) + ' · ' + fmtDay(upcoming.dueDate) : 'No open assignments') + '</small></button>';
    }).join('');

    const filters = [['all', 'All'], ['needs', 'Needs review'], ['open', 'Open'], ['closed', 'Closed']];
    let rows = all.slice().sort((x, y) => (y.st.needs - x.st.needs) || byDue(x.a, y.a));
    if (ui.homeFilter === 'needs') rows = rows.filter((x) => x.st.needs > 0);
    if (ui.homeFilter === 'open') rows = rows.filter((x) => isOpen(x.a));
    if (ui.homeFilter === 'closed') rows = rows.filter((x) => !isOpen(x.a));
    const table = rows.map(({ a, st }) => {
      const c = course(a.courseId);
      return '<button type="button" class="screen-row" data-action="go" data-view="assignment" data-id="' + a.id + '">' +
        '<span class="course-chip"' + tip(c.code + ': ' + c.name) + '>' + esc(c.code) + '</span>' +
        '<span class="sr-title"><strong>' + esc(a.title) + '</strong><small>' + fmtDay(a.dueDate) + ' · ' + dueText(a) + '</small></span>' +
        '<span class="sr-progress">' + pipeline(st) + '<small>' + st.handed.length + ' handed in · ' + st.logsOnly + ' log only · ' + st.notStarted + ' not started</small></span>' +
        '<span class="sr-num"' + tip(st.flaggedStudents + ' students have at least one flag from this assignment\'s rules.') + '><strong class="' + (st.flaggedStudents ? 'warn-text' : '') + '">' + st.flaggedStudents + '</strong><small>flagged</small></span>' +
        '<span class="sr-num"' + tip(st.reviewed + ' of ' + st.handed.length + ' handed-in submissions have your decision.') + '><strong>' + st.reviewed + '/' + st.handed.length + '</strong><small>reviewed</small></span>' +
        '<span class="status-pill ' + (isOpen(a) ? 'ready' : st.needs ? 'flagged' : 'reviewed') + '">' + (isOpen(a) ? 'Open' : st.needs ? st.needs + ' to review' : 'Closed') + '</span>' +
        '<span class="chevron" aria-hidden="true">›</span></button>';
    }).join('') || emptyState('No assignments match this filter.');

    return heading('TEACHING OVERVIEW', greeting() + ', ' + esc(state.teacher.first || state.teacher.name) + '.',
      'You teach ' + plural(state.courses.length, 'course') + ' this semester. Pick a course to open, or start with the work that needs you.',
      '<button type="button" class="secondary-button" data-action="new-assignment">' + ICON.plus + 'New assignment</button>' +
      (next ? '<button type="button" class="primary-button" data-action="go" data-view="review" data-id="' + next.id + '">Start next review <span>→</span></button>' : '')) +
      '<div class="metric-grid">' +
        metric({ icon: ICON.book, value: state.courses.length, label: 'Courses you teach', small: plural(state.students.length, 'student') + ' across all courses', tip: 'Courses where you are teaching staff. Choose one below or from the sidebar.' }) +
        metric({ icon: ICON.doc, tone: 'blue', value: openN, label: 'Open assignments', small: plural(state.assignments.length - openN, 'closed assignment'), meter: state.assignments.length ? openN / state.assignments.length * 100 : 0, meterTone: 'blue', tip: 'Assignments whose due date has not passed. Students can still attach AI logs and hand in.', action: 'home-filter', data: ' data-filter="open"' }) +
        metric({ icon: ICON.alert, tone: 'amber', cls: 'attention', value: sum('needs'), label: 'Flagged, waiting for you', trend: sum('needs') ? 'Start here' : '', small: 'Handed in, flagged by the rules, no decision yet', meter: sum('toReview') ? sum('needs') / sum('toReview') * 100 : 0, meterTone: 'amber', tip: 'Flags are prompts to look closer, not misconduct findings. Click to list the assignments.', action: 'home-filter', data: ' data-filter="needs"' }) +
        metric({ icon: ICON.check, tone: 'teal', value: all.reduce((n, x) => n + x.st.reviewed, 0), unit: '/' + all.reduce((n, x) => n + x.st.handed.length, 0), label: 'Submissions reviewed', small: sum('toReview') + ' handed-in submissions still to review', meter: all.reduce((n, x) => n + x.st.handed.length, 0) ? all.reduce((n, x) => n + x.st.reviewed, 0) / all.reduce((n, x) => n + x.st.handed.length, 0) * 100 : 0, meterTone: 'teal', good: true, tip: 'A submission counts as reviewed once you Approve or Flag it.' }) +
      '</div>' +
      '<section class="section-block"><div class="section-title"><h2>Your courses</h2><p>Hover a card for details, click to open its assignments.</p></div><div class="course-grid">' + cards + '</div></section>' +
      '<section class="panel">' +
        '<div class="panel-header"><div><div class="title-row"><h2>Screening: every assignment</h2><span class="pill count-pill">' + rows.length + '</span></div><p>All classes and their assignments in one list, most urgent first.</p></div>' +
        '<div class="filter-group">' + filters.map(([k, l]) => '<button type="button" class="filter-button' + (ui.homeFilter === k ? ' active' : '') + '" data-action="home-filter" data-filter="' + k + '">' + l + '</button>').join('') + '</div></div>' +
        '<div class="screen-list">' + table + '</div>' +
        '<div class="panel-footer"><span class="legend-inline"><span class="key stage-in"></span>Handed in <span class="key stage-logs"></span>AI log attached <span class="key stage-none"></span>Not started</span><span>Students attach their AI log before they hand in.</span></div>' +
      '</section>' +
      '<p class="disclaimer">Synthetic data only. Flags ask a marker to look closer. They are not evidence of misconduct, and the final judgement is always yours.</p>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Course (assignments list + student overview)                  */
  /* ------------------------------------------------------------------ */
  function viewCourse() {
    const c = course(ui.courseId);
    if (!c) return emptyState('Choose a course from the sidebar.');
    const list = courseAssignments(c.id);
    const groups = Array.from(new Set(c.roster.map((r) => r.group))).sort();
    const rows = list.map((a) => {
      const st = stats(a);
      return '<article class="asg-row">' +
        '<button type="button" class="asg-main" data-action="go" data-view="assignment" data-id="' + a.id + '">' +
          '<span class="asg-icon ' + (isOpen(a) ? 'open' : 'closed') + '">' + ICON.doc + '</span>' +
          '<span class="asg-text"><strong>' + esc(a.title) + '</strong><small>' + esc(trunc(a.description, 120)) + '</small>' +
          '<span class="asg-meta"><span>' + fmtDay(a.dueDate) + '</span><span>' + dueText(a) + '</span>' + (a.wordLimit ? '<span>' + a.wordLimit + ' words</span>' : '') + '<span' + tip(a.rubric.map((x) => criterionInfo(a, x).name).join(' · ') || 'No rubric yet') + '>' + plural(a.rubric.length, 'rubric criterion', 'rubric criteria') + '</span></span></span>' +
        '</button>' +
        '<div class="asg-progress">' + pipeline(st) + '<small>' + st.handed.length + ' of ' + st.enrolled + ' handed in' + (st.logsOnly ? ' · ' + st.logsOnly + ' log only' : '') + '</small></div>' +
        '<div class="asg-nums"><span' + tip('Students flagged by the rules') + '><strong class="' + (st.flaggedStudents ? 'warn-text' : '') + '">' + st.flaggedStudents + '</strong><small>flagged</small></span><span' + tip('Submissions with your Approve or Flag decision') + '><strong>' + st.reviewed + '/' + st.handed.length + '</strong><small>reviewed</small></span></div>' +
        '<div class="asg-actions"><span class="status-pill ' + (isOpen(a) ? 'ready' : st.needs ? 'flagged' : 'reviewed') + '">' + (isOpen(a) ? 'Open' : st.needs ? st.needs + ' to review' : 'Closed') + '</span>' +
          '<button type="button" class="ghost-button small" data-action="go" data-view="rules" data-id="' + a.id + '"' + tip('Edit and test the flag rules for this assignment') + '>' + ICON.flask + 'Rules</button>' +
          '<button type="button" class="primary-button small" data-action="go" data-view="assignment" data-id="' + a.id + '">Open <span>→</span></button></div>' +
      '</article>';
    }).join('') || emptyState('This course has no assignments yet.', '<button type="button" class="primary-button" data-action="new-assignment" data-course="' + c.id + '">' + ICON.plus + 'New assignment</button>');

    const matrix = c.roster.length && list.length ? '<div class="table-scroll"><table class="matrix"><thead><tr><th>Student</th><th>Group</th>' +
      list.map((a) => '<th' + tip(a.title + ' · ' + dueText(a)) + '><button type="button" class="linkish" data-action="go" data-view="assignment" data-id="' + a.id + '">' + esc(a.short) + '</button></th>').join('') + '</tr></thead><tbody>' +
      c.roster.map((r) => {
        const p = person(r.studentId);
        return '<tr><td><span class="who">' + avatar(p, 'sm') + '<span><strong>' + esc(fullName(p)) + '</strong><small>' + esc(p && p.upi) + '</small></span></span></td><td>' + esc(r.group) + '</td>' +
          list.map((a) => matrixCell(state.submissions.find((s) => s.assignmentId === a.id && s.studentId === r.studentId))).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' : emptyState('Add students and assignments to see the overview.');

    const cs = courseStats(c.id);
    return heading(esc(c.code) + ' · ' + esc(c.semester), esc(c.name),
      plural(c.roster.length, 'student') + ' · ' + plural(list.length, 'assignment') + (groups.length ? ' · ' + groups.join(', ') : ''),
      '<button type="button" class="secondary-button" data-action="go" data-view="admin" data-id="people" data-course="' + c.id + '">' + ICON.users + 'Manage students</button>' +
      '<button type="button" class="primary-button" data-action="new-assignment" data-course="' + c.id + '">' + ICON.plus + 'New assignment</button>') +
      '<section class="panel">' +
        '<div class="panel-header"><div><div class="title-row"><h2>Assignments</h2><span class="pill count-pill">' + list.length + '</span></div><p>' + (cs.needs ? cs.needs + ' flagged submissions are waiting for your review.' : 'Nothing flagged is waiting for you in this course.') + ' Click an assignment to open its review dashboard.</p></div></div>' +
        '<div class="asg-list">' + rows + '</div>' +
      '</section>' +
      '<section class="panel">' +
        '<div class="panel-header"><div><h2>Students across assignments</h2><p>Each student\'s work in every assignment. Hover a cell for details, click it to open the submission.</p></div></div>' +
        matrix +
        '<div class="panel-footer"><span class="legend-inline"><span class="mx mx-none">–</span>Not started <span class="mx mx-logs">Log</span>AI log only <span class="mx mx-ok">0</span>No flags <span class="mx mx-warn">2</span>Rule flags <span class="mx mx-approve">' + ICON.check + '</span>You approved <span class="mx mx-flag">' + ICON.flag + '</span>You flagged</span></div>' +
      '</section>';
  }

  function matrixCell(s) {
    if (!s) return '<td><span class="mx mx-none"' + tip('Not enrolled when this assignment was created.') + '>·</span></td>';
    if (s.stage === 'not_started') return '<td><span class="mx mx-none"' + tip('Not started: no AI log attached yet.') + '>–</span></td>';
    const e = evalOf(s);
    const r = s.review;
    let cls = 'mx-ok'; let label = '0';
    if (s.stage === 'logs_attached') { cls = 'mx-logs'; label = 'Log'; }
    else if (r.decision === 'approve') { cls = 'mx-approve'; label = ICON.check; }
    else if (r.decision === 'flag') { cls = 'mx-flag'; label = ICON.flag; }
    else if (e.flagCount) { cls = 'mx-warn'; label = String(e.flagCount); }
    const t = subName(s) + ' · ' + asg(s.assignmentId).short + '. ' + (s.stage === 'logs_attached' ? 'AI log attached ' + fmtDate(s.logsAttachedAt) + ', not handed in yet. ' : 'Handed in ' + fmtDate(s.handedInAt) + '. ') +
      (e.flagCount ? plural(e.flagCount, 'flag') + ': ' + flagSummary(e) + '. ' : 'No flags. ') + 'Review: ' + REVIEW[r.status] + (r.decision ? ' (' + (r.decision === 'approve' ? 'approved' : 'flagged') + ')' : '') + '.';
    return '<td><button type="button" class="mx ' + cls + (r.status === 'in_progress' ? ' mx-progress' : '') + '" data-action="go" data-view="review" data-id="' + s.id + '"' + tip(t) + '>' + label + '</button></td>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Review dashboard (one assignment)                             */
  /* ------------------------------------------------------------------ */
  function viewAssignment() {
    const a = asg(ui.assignmentId);
    if (!a) return emptyState('This course has no assignments yet.', '<button type="button" class="primary-button" data-action="new-assignment">' + ICON.plus + 'New assignment</button>');
    const c = course(a.courseId);
    const st = stats(a);
    const t = st.c.totals;
    const groups = Array.from(new Set(c.roster.map((r) => r.group))).sort();
    const next = nextToReview([a]);
    const lead = st.handed.filter((s) => s.logsAttachedAt && s.handedInAt).map((s) => (new Date(s.handedInAt) - new Date(s.logsAttachedAt)) / 3600000);
    const avgLead = lead.length ? lead.reduce((x, y) => x + y, 0) / lead.length : null;

    return heading('REVIEW DASHBOARD · ' + esc(c.code), esc(a.title),
      'Lane 2 assessment · due ' + fmtDay(a.dueDate) + ' (' + dueText(a).toLowerCase() + ')' + (a.wordLimit ? ' · ' + a.wordLimit + ' words' : '') + ' · ' + (E.PRESETS[a.settings.preset] ? E.PRESETS[a.settings.preset].label : 'Custom') + ' rules',
      '<button type="button" class="secondary-button" data-action="go" data-view="rules" data-id="' + a.id + '">' + ICON.flask + 'Rules &amp; Test Lab</button>' +
      (next ? '<button type="button" class="primary-button" data-action="go" data-view="review" data-id="' + next.id + '">Start next review <span>→</span></button>' : '')) +
      '<section class="pipeline-panel"' + tip('Students paste or link their AI conversation first. Hand-in only opens once a log (or a no-AI declaration) is attached.') + '>' +
        '<div class="pp-text"><strong>AI logs come in before hand-in</strong><span>' + st.handed.length + ' handed in · ' + st.logsOnly + ' log attached, not handed in · ' + st.notStarted + ' not started' + (avgLead != null ? ' · logs attached on average ' + gap(0, avgLead * 3600000) + ' before hand-in' : '') + '</span></div>' +
        '<div class="pp-bar">' + pipeline(st) + '</div>' +
      '</section>' +
      '<div class="metric-grid">' +
        metric({ icon: ICON.doc, value: (t.students - t.noEvidence) + '<span class="unit"> of ' + st.enrolled + '</span>', label: 'Students submitted AI evidence', small: t.noEvidence ? t.noEvidence + ' declared no AI use or attached no log' : 'Everyone who started attached a log', meter: st.enrolled ? (t.students - t.noEvidence) / st.enrolled * 100 : 0, tip: 'Students with at least one logged AI interaction.' }) +
        metric({ icon: ICON.chat, tone: 'blue', value: t.interactions, label: 'AI interactions logged', small: t.students ? (t.interactions / t.students).toFixed(1) + ' per student on average' : '', meterTone: 'blue', tip: 'Every prompt and AI response pair in the attached logs.' }) +
        metric({ icon: ICON.alert, tone: 'amber', cls: 'attention', value: t.flaggedStudents, label: 'Students flagged for review', trend: st.needs ? st.needs + ' waiting' : '', small: 'Click to show only flagged students', meter: t.students ? t.flaggedStudents / t.students * 100 : 0, meterTone: 'amber', action: 'toggle-flagged', on: ui.onlyFlagged, tip: 'Students with at least one flag from this assignment\'s rules. Click to filter the table.' }) +
        metric({ icon: ICON.check, tone: 'teal', value: st.reviewed, unit: ' of ' + st.handed.length, label: 'Records reviewed', small: st.approved + ' approved · ' + st.teacherFlagged + ' flagged by you', meter: st.handed.length ? st.reviewed / st.handed.length * 100 : 0, meterTone: 'teal', good: true, action: 'sort-review', tip: 'Handed-in submissions with your Approve or Flag decision. Click to list unreviewed students first.' }) +
      '</div>' +
      '<section class="chart-grid">' +
        '<div class="panel chart-panel wide"><div class="panel-header compact"><div><h2>What students did with AI output</h2><p>Click a colour to show students with at least one step like it.</p></div></div><div class="chart-body">' + decisionChart(st.c.decisions) + '</div></div>' +
        '<div class="panel chart-panel"><div class="panel-header compact"><div><h2>Critique levels</h2><p>Click a bar to filter. Hover for what each level means.</p></div></div><div class="chart-body">' + levelChart(st.c.levels) + '</div></div>' +
        '<div class="panel chart-panel"><div class="panel-header compact"><div><h2>Which rules flagged work</h2><p>Click a rule to show only the students it flagged.</p></div></div><div class="chart-body">' + ruleChart(a, st.c.byRule) + '</div></div>' +
      '</section>' +
      '<section class="panel table-panel" id="students-panel">' +
        '<div class="table-toolbar">' +
          '<label class="search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><span class="sr">Search students</span><input type="search" placeholder="Search name or UPI…" value="' + esc(ui.search) + '" data-input="search"></label>' +
          '<div class="toolbar-controls">' +
            '<label><span class="sr">Stage</span><select class="select-control" data-change="stage">' + [['active', 'Log attached or handed in'], ['handed_in', 'Handed in'], ['logs_attached', 'Log only, not handed in'], ['not_started', 'Not started'], ['all', 'Everyone']].map(([v, l]) => '<option value="' + v + '"' + (ui.stage === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
            '<label><span class="sr">Tutorial group</span><select class="select-control" data-change="group"><option value="all">All groups</option>' + groups.map((g) => '<option' + (ui.group === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></label>' +
            '<label><span class="sr">Sort</span><select class="select-control" data-change="sort">' + [['flags', 'Most flags first'], ['review', 'Not reviewed first'], ['level', 'Lowest critique level first'], ['shared', 'Most shared wording first'], ['name', 'Name A to Z']].map(([v, l]) => '<option value="' + v + '"' + (ui.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
            '<label class="check"><input type="checkbox" data-change="onlyFlagged"' + (ui.onlyFlagged ? ' checked' : '') + '> Flagged only</label>' +
          '</div>' +
        '</div>' +
        '<div class="chips" id="filter-chips">' + filterChips() + '</div>' +
        '<div class="table-scroll"><table class="grid-table students"><thead><tr><th>Student</th><th>Group</th><th>AI log</th><th>AI steps <span class="muted">(colour = what they did)</span></th><th class="num">Avg critique level</th><th class="num">Shared wording</th><th class="num">Flags</th><th>Your decision</th><th><span class="sr">Open</span></th></tr></thead>' +
        '<tbody id="student-rows"></tbody></table></div>' +
        '<div class="panel-footer"><span class="legend-inline"><span class="key d-changed"></span>Changed <span class="key d-notused"></span>Not used <span class="key d-unchanged"></span>Used unchanged <span class="key d-unrecorded"></span>Not recorded <span class="key flagged-key"></span>Step has flags</span><span id="row-count"></span></div>' +
      '</section>' +
      '<p class="disclaimer">Flags ask a marker to look closer. They are not evidence of misconduct, and the final judgement is always yours.</p>';
  }

  function filterChips() {
    const chips = [];
    if (ui.ruleFilter) chips.push(['ruleFilter', 'Rule: ' + E.RULE_BY_KEY[ui.ruleFilter].name]);
    if (ui.levelFilter != null) chips.push(['levelFilter', 'Has a level ' + ui.levelFilter + ' step']);
    if (ui.decisionFilter) chips.push(['decisionFilter', 'Has a "' + DECISIONS[ui.decisionFilter].label + '" step']);
    if (ui.onlyFlagged) chips.push(['onlyFlagged', 'Flagged only']);
    return chips.map(([k, l]) => '<button type="button" class="chip" data-action="clear-filter" data-key="' + k + '">' + esc(l) + ' <span aria-hidden="true">×</span><span class="sr">clear filter</span></button>').join('');
  }

  function renderRows() {
    const body = $('#student-rows');
    const a = asg(ui.assignmentId);
    if (!body || !a) return;
    const st = stats(a);
    const q = ui.search.trim().toLowerCase();
    const empty = { interactions: [], patternFlags: [], flagCount: 0, avgLevel: null, shared: { coverage: 0 } };
    let rows = st.subs.map((s) => ({ s, p: person(s.studentId), e: st.evalById[s.id] || empty })).filter(({ s, p, e }) => {
      if (ui.stage === 'active' && s.stage === 'not_started') return false;
      if (!['active', 'all'].includes(ui.stage) && s.stage !== ui.stage) return false;
      if (q && !(fullName(p).toLowerCase().includes(q) || (p.upi || '').toLowerCase().includes(q))) return false;
      if (ui.group !== 'all' && groupOf(s) !== ui.group) return false;
      if (ui.onlyFlagged && e.flagCount === 0) return false;
      if (ui.ruleFilter && !e.patternFlags.some((f) => f.key === ui.ruleFilter) && !e.interactions.some((i) => i.result.flags.some((f) => f.key === ui.ruleFilter))) return false;
      if (ui.levelFilter != null && !e.interactions.some((i) => i.result.level.level === ui.levelFilter)) return false;
      if (ui.decisionFilter && !e.interactions.some((i) => (i.decision || 'unrecorded') === ui.decisionFilter)) return false;
      return true;
    });
    const order = ['not_reviewed', 'in_progress', 'reviewed'];
    const by = {
      flags: (x, y) => y.e.flagCount - x.e.flagCount,
      level: (x, y) => (x.e.avgLevel == null ? 9 : x.e.avgLevel) - (y.e.avgLevel == null ? 9 : y.e.avgLevel),
      shared: (x, y) => y.e.shared.coverage - x.e.shared.coverage,
      name: (x, y) => fullName(x.p).localeCompare(fullName(y.p)),
      review: (x, y) => order.indexOf(x.s.review.status) - order.indexOf(y.s.review.status) || y.e.flagCount - x.e.flagCount
    };
    rows = rows.sort((x, y) => by[ui.sort](x, y) || fullName(x.p).localeCompare(fullName(y.p)));
    $('#row-count').textContent = 'Showing ' + plural(rows.length, 'student') + ' of ' + st.enrolled;
    $('#filter-chips').innerHTML = filterChips();
    if (!rows.length) { body.innerHTML = '<tr><td colspan="9" class="empty">No students match these filters. Clear the search or filters to see everyone.</td></tr>'; return; }
    body.innerHTML = rows.map(({ s, p, e }) => {
      const started = s.stage !== 'not_started';
      const lvl = e.avgLevel == null ? '<span class="muted">n/a</span>' : '<span' + tip(E.LEVELS[Math.round(e.avgLevel)].text) + '>' + e.avgLevel.toFixed(1) + ' <span class="muted">' + E.LEVELS[Math.round(e.avgLevel)].name + '</span></span>';
      const logCell = stagePill(s) + (s.logsAttachedAt ? '<small class="sub-line">' + fmtDate(s.logsAttachedAt) + '</small>' : '');
      return '<tr class="' + (started ? 'clickable' : 'dim') + '"' + (started ? ' data-action="go" data-view="review" data-id="' + s.id + '"' : '') + '>' +
        '<td><span class="who">' + avatar(p, 'sm') + '<span><strong>' + esc(fullName(p)) + '</strong><small>' + esc(p.upi) + '</small></span></span></td>' +
        '<td>' + esc(groupOf(s)) + '</td>' +
        '<td>' + logCell + '</td>' +
        '<td>' + (started ? strip(e) : '<span class="muted">–</span>') + '</td>' +
        '<td class="num">' + (started ? lvl : '') + '</td>' +
        '<td class="num">' + (s.stage === 'handed_in' && e.interactions.length ? '<span' + tip('Share of the final submission that matches logged AI output word-for-word (5+ words in a row).') + '>' + pct(e.shared.coverage) + '</span>' : '<span class="muted">n/a</span>') + '</td>' +
        '<td class="num">' + (e.flagCount ? '<span class="flagcount"' + tip(flagSummary(e)) + '>' + e.flagCount + '</span>' : '<span class="muted">0</span>') + '</td>' +
        '<td>' + decisionPill(s) + '</td>' +
        '<td>' + (started ? '<button type="button" class="secondary-button small" data-action="go" data-view="review" data-id="' + s.id + '">Review</button>' : '') + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* View: Submission review (rubric marking)                            */
  /* ------------------------------------------------------------------ */
  function viewReview() {
    const s = sub(ui.subId);
    if (!s) return emptyState('That submission no longer exists.', '<button type="button" class="secondary-button" data-action="go" data-view="home">Back to all courses</button>');
    const a = asg(s.assignmentId);
    const c = course(a.courseId);
    const p = person(s.studentId);
    const e = evalOf(s);
    const r = s.review;
    const queue = reviewQueue(a);
    const pos = queue.findIndex((x) => x.id === s.id);
    const prev = queue[pos - 1];
    const nextS = queue[pos + 1];
    const nextOpen = queue.slice(pos + 1).concat(queue.slice(0, pos)).find((x) => x.stage === 'handed_in' && x.review.status !== 'reviewed');
    const used = e.decisions.changed + e.decisions.not_used;
    const prog = rubricProgress(s, a);
    const timing = ui.timer && ui.timer.subId === s.id;

    const banner = s.stage === 'logs_attached'
      ? '<div class="info-banner warn">' + ICON.info + '<p><strong>Not handed in yet.</strong> The AI log was attached ' + fmtDate(s.logsAttachedAt) + '. You can read and mark the log now; the final work appears once the student hands in.</p></div>'
      : s.declaration === 'no_ai'
        ? '<div class="info-banner">' + ICON.info + '<p><strong>The student declared no AI use</strong> when handing in on ' + fmtDate(s.handedInAt) + '. There is no log to mark; check the final work if anything looks AI-written.</p></div>' : '';

    // Flags raised by the rules: one row per rule, with the steps it fired on.
    const byRule = {};
    e.interactions.forEach((i) => i.result.flags.forEach((f) => { (byRule[f.key] = byRule[f.key] || { f, steps: [] }).steps.push(i); }));
    const flagRows = e.patternFlags.map((f) => '<li class="flag-item"><span class="flag-pill high"' + tip(f.rule) + '>' + esc(f.name) + '</span><span class="flag-detail">' + esc(f.detail) + '</span><span class="muted">Whole log</span></li>').concat(
      Object.keys(byRule).map((k) => { const x = byRule[k]; return '<li class="flag-item"><span class="flag-pill ' + (x.steps.length > 1 ? 'medium' : 'low') + '"' + tip(x.f.rule + (x.f.simulated ? ' Simulated check.' : '')) + '>' + esc(x.f.name) + '</span><span class="flag-detail">' + esc(x.steps.length === 1 ? x.steps[0].result.flags.find((f) => f.key === k).detail : 'On ' + x.steps.length + ' steps.') + '</span><span class="step-links">' + x.steps.map((i) => '<a href="#step-' + esc(i.id) + '" class="step-link" data-action="jump" data-id="' + esc(i.id) + '"' + tip('Step ' + i.step + ': ' + i.task) + '>Step ' + i.step + '</a>').join('') + '</span></li>'; })).join('');

    const timeline = e.interactions.length ? '<ol class="timeline-strip">' + e.interactions.map((i) => {
      const d = DECISIONS[i.decision] || DECISIONS.unrecorded;
      const pr = rubricStepProgress(s, a, i);
      return '<li><a href="#step-' + esc(i.id) + '" class="tl ' + d.cls + '" data-action="jump" data-id="' + esc(i.id) + '"' + tip(i.prompt) + '><span class="tl-step">Step ' + i.step + ' · ' + esc(i.tool) + '</span><span class="tl-task">' + esc(trunc(i.task, 34)) + '</span><span class="tl-meta">' + d.label + ' · ' + (a.rubric.length ? pr.marked + '/' + a.rubric.length + ' marked' : fmtDate(i.timestamp)) + '</span></a></li>';
    }).join('') + '</ol>' : '';

    const steps = e.interactions.map((i) => {
      const open = ui.open[i.id];
      return '<article class="step-card" id="step-' + esc(i.id) + '">' +
        '<div class="step-body">' +
          '<header class="step-head"><span class="timeline-num">' + i.step + '</span><div><h3>' + esc(i.task) + '</h3><span class="muted">' + esc(i.tool) + (i.timestamp ? ' · ' + fmtDate(i.timestamp) : '') + '</span></div>' + decisionBadge(i.decision) + '</header>' +
          '<div class="dialogue-block prompt"><strong>Student prompt</strong>' + esc(i.prompt) + '</div>' +
          '<details class="dialogue-block response"' + (open !== false ? ' open' : '') + ' data-toggle="' + esc(i.id) + '"><summary><strong>AI response</strong> <span class="muted">' + E.wordCount(i.output) + ' words</span></summary>' + esc(i.output) + '</details>' +
          (i.pushbackText ? '<div class="dialogue-block followup"><strong>Student\'s next message in the chat</strong>' + esc(i.pushbackText) + '</div>' : '') +
        '</div>' +
        rubricCard(s, a, i) +
      '</article>';
    }).join('');

    const submission = s.stage !== 'handed_in' ? '<p class="muted">Not handed in yet.</p>'
      : s.submission ? '<p class="submission">' + e.shared.segments.map((g) => g.shared ? '<mark>' + esc(g.text) + '</mark>' : esc(g.text)).join('') + '</p>' : '<p class="muted">No final submission text stored.</p>';

    const decisionText = r.decision === 'approve' ? 'You approved this submission.' : r.decision === 'flag' ? 'You flagged this submission for follow-up.' : 'No decision yet.';
    const rail = '<aside class="review-rail" aria-label="Mark this submission">' +
      '<div class="panel rail-card">' +
        '<h2>Mark this submission</h2><p class="rail-sub">' + decisionText + '</p>' +
        '<div class="rail-actions" role="group" aria-label="Your decision">' +
          ['approve', 'flag', 'comment'].map((k) => {
            const on = k === 'comment' ? (ui.railComment || !!r.comment) : r.decision === k;
            return '<button type="button" class="rail-action ' + k + (on ? ' on' : '') + '" data-action="sub-' + k + '" aria-pressed="' + on + '"' + tip(k === 'approve' ? 'Approve: no concerns with how AI was used.' : k === 'flag' ? 'Flag: follow this up (e.g. talk to the student, moderation).' : 'Comment: leave a note on the whole submission.') + '>' + MARK[k].icon + '<span>' + MARK[k].label + '</span></button>';
          }).join('') +
        '</div>' +
        (ui.railComment || r.comment ? '<label class="rail-comment"><span class="sr">Comment on this submission</span><textarea rows="3" placeholder="Comment for markers…" data-change="sub-comment">' + esc(r.comment) + '</textarea></label>' : '') +
        '<div class="rail-progress"' + tip('Rubric criteria you have approved or flagged across all steps.') + '><div class="row-between"><span>Rubric marked</span><b>' + prog.marked + ' / ' + prog.total + '</b></div><div class="meter teal"><i style="width:' + (prog.total ? prog.marked / prog.total * 100 : 0) + '%"></i></div>' +
          '<div class="rail-counts"><span class="ok-text">' + ICON.check + prog.approve + ' approved</span><span class="warn-text">' + ICON.flag + prog.flag + ' flagged</span><span>' + ICON.comment + prog.comments + '</span></div></div>' +
        '<div class="rail-meta"><span class="status-pill ' + (r.status === 'reviewed' ? 'reviewed' : r.status === 'in_progress' ? 'ready' : 'todo') + '">' + REVIEW[r.status] + '</span><span' + tip('Time recorded by the review timer') + '>' + ICON.clock + fmtTime(r.seconds) + '</span></div>' +
        '<button type="button" class="secondary-button full-width' + (timing ? ' on' : '') + '" data-action="timer" data-id="' + s.id + '">' + ICON.clock + (timing ? 'Stop timer <span id="timer-display"></span>' : 'Start review timer') + '</button>' +
        (r.decision || r.comment ? '<button type="button" class="text-button" data-action="sub-clear">Clear decision</button>' : '') +
      '</div>' +
      '<div class="panel rail-card rail-nav">' +
        '<span class="muted">Student ' + (pos + 1) + ' of ' + queue.length + ' in ' + esc(a.short) + '</span>' +
        '<div class="rail-nav-buttons"><button type="button" class="secondary-button" data-action="go" data-view="review" data-id="' + (prev ? prev.id : '') + '"' + (prev ? '' : ' disabled') + '>← Previous</button><button type="button" class="secondary-button" data-action="go" data-view="review" data-id="' + (nextS ? nextS.id : '') + '"' + (nextS ? '' : ' disabled') + '>Next →</button></div>' +
        (nextOpen ? '<button type="button" class="primary-button full-width" data-action="go" data-view="review" data-id="' + nextOpen.id + '"' + tip('Next handed-in student without your decision: ' + subName(nextOpen)) + '>Next to review <span>→</span></button>' : '<p class="ok-text small">Every handed-in submission here has your decision.</p>') +
        '<button type="button" class="ghost-button full-width" data-action="print-student" data-id="' + s.id + '">' + ICON.print + 'Print or save PDF</button>' +
      '</div></aside>';

    return '<div class="page-heading review-heading"><div class="who big">' + avatar(p, 'lg') + '<div><span class="eyebrow accent">' + esc(c.code) + ' · ' + esc(a.short) + '</span><h1>' + esc(fullName(p)) + '</h1>' +
        '<p>' + esc(p.upi) + ' · ' + esc(groupOf(s)) + ' · ' + stagePill(s) + (s.logsAttachedAt ? ' · AI log attached ' + fmtDate(s.logsAttachedAt) : '') + (s.handedInAt ? ' · handed in ' + fmtDate(s.handedInAt) + (s.logsAttachedAt ? ' (' + gap(s.logsAttachedAt, s.handedInAt) + ' later)' : '') : '') +
        (s.sources.length ? ' · ' + s.sources.map((x) => esc(x.tool) + ' ' + (x.type === 'link' ? 'share link' : 'pasted text')).join(', ') : '') + '</p></div></div></div>' +
      banner +
      '<div class="review-layout"><div class="review-main">' +
        '<section class="mini-figures">' +
          fig(e.interactions.length, 'AI interactions') +
          fig(used + ' of ' + e.interactions.length, 'changed or not used', '', 'Steps where the student changed the AI output or chose not to use it.') +
          fig(e.avgLevel == null ? 'n/a' : e.avgLevel.toFixed(1), 'average critique level', '', 'From the student\'s reflections: 0 none to 4 verified and acted.') +
          fig(s.stage === 'handed_in' && e.interactions.length ? pct(e.shared.coverage) : 'n/a', 'shared wording with AI', '', 'Share of the final work matching AI output word-for-word.') +
          fig(e.flagCount, 'rule flags', e.flagCount ? 'warn' : '', 'Flags raised by this assignment\'s rules. They are prompts, not decisions.') +
          fig(e.pushbacks, 'times challenged the AI', '', 'The student pushed back on the AI in their next chat message.') +
        '</section>' +
        '<section class="panel"><div class="panel-header compact"><div><h2>Flags raised by the rules</h2><p>Prompts to look closer, not decisions. Hover a flag to see the rule; click a step to jump to it.</p></div><span class="pill ' + (e.flagCount ? 'count-pill' : 'ok-pill') + '">' + e.flagCount + '</span></div>' +
          (flagRows ? '<ul class="flag-list">' + flagRows + '</ul>' : '<p class="panel-pad muted">No flags with this assignment\'s rules.</p>') + '</section>' +
        (timeline ? '<section class="panel"><div class="panel-header compact"><div><h2>Process timeline</h2><p>Colour shows what the student did with each output. Click a step to jump to it.</p></div></div><div class="panel-pad">' + timeline + '</div></section>' : '') +
        (steps ? '<section class="steps-section"><div class="row-between section-title"><div><h2>AI interactions and rubric</h2><p>Read each step, then Approve, Flag or Comment on each rubric criterion beside it.</p></div><span><button type="button" class="ghost-button small" data-action="toggle-all" data-open="1">Expand all</button> <button type="button" class="ghost-button small" data-action="toggle-all" data-open="0">Collapse all</button></span></div>' + steps + '</section>'
          : s.stage !== 'not_started' && s.declaration !== 'no_ai' ? emptyState('No AI interactions in this log.') : '') +
        '<section class="panel"><div class="panel-header compact"><div><h2>Final submission: shared wording</h2><p><mark>Highlighted</mark> text matches a logged AI output word-for-word (5 or more words in a row). Paraphrased or unlogged AI text is not detected.</p></div><span class="badge outline">Indicator only</span></div><div class="panel-pad">' + submission + '</div></section>' +
      '</div>' + rail + '</div>';
  }
  function fig(n, label, cls, t) { return '<div class="figure ' + (cls || '') + '"' + tip(t) + '><b>' + n + '</b><span>' + label + '</span></div>'; }

  function rubricStepProgress(s, a, i) {
    const m = s.review.marks[i.id] || {};
    return { marked: a.rubric.filter((c) => m[c.id] && m[c.id].mark).length };
  }

  function rubricCard(s, a, i) {
    const m = s.review.marks[i.id] || {};
    const pr = rubricStepProgress(s, a, i);
    if (!a.rubric.length) return '<aside class="rubric-card"><header><strong>Rubric</strong></header><p class="muted small">This assignment has no rubric criteria yet. Add them in Rules &amp; Test Lab or Admin.</p><button type="button" class="secondary-button small" data-action="go" data-view="rules" data-id="' + a.id + '">Add criteria</button></aside>';
    return '<aside class="rubric-card" aria-label="Rubric for step ' + i.step + '">' +
      '<header><strong>Rubric</strong><span class="muted">' + pr.marked + ' of ' + a.rubric.length + ' marked</span>' +
      (pr.marked < a.rubric.length ? '<button type="button" class="text-button" data-action="approve-rest" data-iid="' + esc(i.id) + '"' + tip('Approve every criterion on this step that is not marked yet.') + '>Approve rest</button>' : '') + '</header>' +
      a.rubric.map((c) => {
        const info = criterionInfo(a, c);
        const x = m[c.id] || {};
        const key = i.id + '|' + c.id;
        const showComment = ui.critOpen[key] || x.comment;
        return '<div class="crit' + (x.mark ? ' m-' + x.mark : '') + '">' +
          '<div class="crit-row"><span class="crit-name"' + tip(info.description) + '>' + esc(info.name) + (c.type === 'custom' ? '' : '') + '</span>' +
          '<span class="crit-actions" role="group" aria-label="' + esc(info.name) + '">' +
            ['approve', 'flag', 'comment'].map((k) => {
              const on = k === 'comment' ? !!showComment : x.mark === k;
              return '<button type="button" class="mark-btn ' + k + (on ? ' on' : '') + '" data-action="mark" data-iid="' + esc(i.id) + '" data-cid="' + esc(c.id) + '" data-mark="' + k + '" aria-pressed="' + on + '" aria-label="' + MARK[k].label + ': ' + esc(info.name) + '"' + tip(MARK[k].label + ' · ' + MARK[k].tip) + '>' + MARK[k].icon + '</button>';
            }).join('') +
          '</span></div>' +
          (showComment ? '<textarea rows="2" class="crit-comment" placeholder="Comment on ' + esc(info.name.toLowerCase()) + '…" data-change="crit-comment" data-iid="' + esc(i.id) + '" data-cid="' + esc(c.id) + '">' + esc(x.comment || '') + '</textarea>' : '') +
        '</div>';
      }).join('') +
    '</aside>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Rules & Test Lab (one page, per assignment)                   */
  /* ------------------------------------------------------------------ */
  function runCases(s) {
    return CASES.map((t) => {
      const r = E.evaluateInteraction(t, s);
      const flags = r.flags.map((f) => f.key).sort();
      const pass = r.level.level === t.expectedLevel && flags.join() === t.expectedFlags.slice().sort().join();
      return { t, r, flags, pass };
    });
  }
  const flagNames = (keys) => keys.length ? keys.map((k) => E.RULE_BY_KEY[k].name).join(', ') : 'No flags';

  function ruleControl(a, r) {
    const cfg = a.settings.rules[r.key];
    const range = (field, label, min, max, suffix) => '<div class="rule-control"><label for="rc-' + r.key + '">' + label + '</label><div><input id="rc-' + r.key + '" type="range" min="' + min + '" max="' + max + '" value="' + cfg[field] + '" data-input="rule-preview" data-suffix="' + esc(suffix) + '" data-change="rule-num" data-rule="' + r.key + '" data-field="' + field + '"' + (cfg.enabled ? '' : ' disabled') + '><output>' + cfg[field] + esc(suffix) + '</output></div></div>';
    switch (r.key) {
      case 'shortCritique': return range('minWords', 'Flag reflections shorter than', 1, 60, ' words') +
        '<label class="check rule-check"><input type="checkbox" data-change="rule-bool" data-rule="shortCritique" data-field="exemptSpecific"' + (cfg.exemptSpecific ? ' checked' : '') + (cfg.enabled ? '' : ' disabled') + '> Don\'t flag short reflections that mention a check or a correction</label>';
      case 'repeatsOutput': return range('pct', 'Flag at', 5, 100, '% or more');
      case 'mostlyUnchanged': return range('pct', 'Flag at', 10, 100, '% or more');
      case 'highShared': return range('pct', 'Flag at', 5, 100, '% or more');
      case 'aiStyle': return range('minHits', 'At least', 1, 6, ' phrases');
      case 'belowLevel': return '<div class="rule-control"><label for="rc-belowLevel">Minimum expected level</label><div><select id="rc-belowLevel" class="select-control" data-change="rule-num" data-rule="belowLevel" data-field="minLevel"' + (cfg.enabled ? '' : ' disabled') + '>' + E.LEVELS.slice(1).map((l) => '<option value="' + l.level + '"' + (cfg.minLevel === l.level ? ' selected' : '') + '>' + l.level + ': ' + l.name + '</option>').join('') + '</select></div></div>';
      default: return '';
    }
  }

  function viewRules() {
    const a = asg(ui.assignmentId);
    if (!a) return emptyState('Create an assignment first.', '<button type="button" class="primary-button" data-action="new-assignment">' + ICON.plus + 'New assignment</button>');
    const c = course(a.courseId);
    const s = a.settings;
    const st = stats(a);
    const results = runCases(s);
    const passed = results.filter((x) => x.pass).length;
    const changedN = Object.keys(ui.caseChanged).length;
    const inRubric = (k) => a.rubric.some((x) => x.type === 'rule' && x.ruleKey === k);

    const ruleCards = (scope) => E.RULES.filter((r) => r.scope === scope).map((r) => {
      const cfg = s.rules[r.key];
      const n = st.c.byRule[r.key] || 0;
      return '<article class="rule-card' + (cfg.enabled ? '' : ' off') + '">' +
        '<div class="rule-heading"><div class="rule-icon ' + RULE_ICONS[r.key] + '">' + (scope === 'interaction' ? ICON.chat : ICON.chart) + '</div>' +
          '<div><h3>' + esc(r.name) + (r.simulated ? ' <span class="sim"' + tip('Word-list checks like this misfire easily. Treat with care.') + '>Simulated</span>' : '') + '</h3><p>' + esc(r.describe(cfg)) + '</p>' +
          '<p class="rule-foot"><span' + tip('How many times this rule fires on the logs attached so far for ' + a.short + '.') + '>' + (cfg.enabled ? 'Fires ' + plural(n, 'time') + ' in ' + esc(a.short) : 'Turned off') + '</span>' + (inRubric(r.key) ? '<span class="pill ok-pill"' + tip('Teachers mark this criterion on every step in the student review.') + '>In rubric</span>' : '') + '</p></div>' +
          '<label class="switch"' + tip(cfg.enabled ? 'Turn this rule off' : 'Turn this rule on') + '><input type="checkbox" class="rule-toggle" data-change="rule-bool" data-rule="' + r.key + '" data-field="enabled"' + (cfg.enabled ? ' checked' : '') + '><span></span><span class="sr">' + esc(r.name) + '</span></label></div>' +
        ruleControl(a, r) + '</article>';
    }).join('');

    const vocab = Object.keys(VOCAB_LABELS).map((k) =>
      '<label class="field vocab"><b>' + VOCAB_LABELS[k][0] + '</b> <span class="muted">' + VOCAB_LABELS[k][1] + ' One per line.</span><textarea rows="5" data-change="vocab" data-key="' + k + '">' + esc(s.vocab[k].join('\n')) + '</textarea></label>').join('');

    const cases = results.map(({ t, r, flags, pass }, k) => '<div class="case-row' + (ui.caseChanged[t.id] ? ' changed-row' : '') + '"' + tip('"' + (t.critique || '(empty)') + '" · ' + DECISIONS[t.decision].label + '. Expected level ' + t.expectedLevel + ' (' + flagNames(t.expectedFlags) + '). Got level ' + r.level.level + ' (' + flagNames(flags) + ').' + (t.note ? ' ' + t.note : '')) + '>' +
      '<span class="case-num">' + String(k + 1).padStart(2, '0') + '</span><span><strong>' + esc(t.title) + '</strong><small>Level ' + r.level.level + ' · ' + esc(flagNames(flags)) + '</small></span>' +
      '<span class="case-result ' + (pass ? 'clear' : 'flagged') + (ui.caseChanged[t.id] ? ' changed' : '') + '">' + (pass ? 'Pass' : 'Fail') + '</span></div>').join('');

    const compare = ['lenient', 'standard', 'strict'].map((k) => {
      const ps = E.applyPreset(s, k);
      const cc = E.evaluateClass(st.active, ps);
      return '<tr' + (s.preset === k ? ' class="current"' : '') + '><td>' + E.PRESETS[k].label + (s.preset === k ? ' <span class="muted">(current)</span>' : '') + '</td><td class="num">' + cc.totals.flaggedStudents + ' of ' + cc.totals.students + '</td><td class="num">' + runCases(ps).filter((x) => x.pass).length + '/' + CASES.length + '</td></tr>';
    }).join('');

    const impact = ui.lastImpact && ui.lastImpact.aid === a.id && ui.lastImpact.from !== st.flaggedStudents ? ' <span class="delta">was ' + ui.lastImpact.from + '</span>' : '';

    return heading('RULES &amp; TEST LAB · ' + esc(c.code), 'Rules for ' + esc(a.short),
      'Change a rule and see straight away what it does to the fixed test cases and to this assignment\'s students. Rules are saved per assignment.',
      '<label class="heading-select"><span class="sr">Assignment</span><select class="select-control" data-change="rules-assignment">' + assignmentOptions(a.id) + '</select></label>' +
      '<label class="heading-select"><span class="sr">Copy rules from another assignment</span><select class="select-control" data-change="copy-rules"><option value="">Copy rules from…</option>' + state.assignments.filter((x) => x.id !== a.id).map((x) => '<option value="' + x.id + '">' + esc(course(x.courseId).code + ' · ' + x.short) + '</option>').join('') + '</select></label>') +
      '<div class="info-banner">' + ICON.shield + '<p><strong>Transparent by design.</strong> Rules create prompts for human review; they never decide misconduct. Every flag shows the rule and threshold that produced it.</p></div>' +
      '<div class="lab-layout">' +
        '<div class="lab-main">' +
          '<section class="panel rule-panel">' +
            '<div class="panel-header"><div><h2>Flag rules</h2><p>' + E.RULES.filter((r) => s.rules[r.key].enabled).length + ' of ' + E.RULES.length + ' rules on · ' + (E.PRESETS[s.preset] ? E.PRESETS[s.preset].label + ' preset' : 'Custom settings') + '</p></div>' +
              '<div class="filter-group" role="group" aria-label="Strictness preset">' + Object.keys(E.PRESETS).map((k) => '<button type="button" class="filter-button' + (s.preset === k ? ' active' : '') + '" data-action="preset" data-preset="' + k + '" aria-pressed="' + (s.preset === k) + '"' + tip(E.PRESETS[k].label + ': short reflection under ' + E.PRESETS[k].minWords + ' words, expected level ' + E.PRESETS[k].minLevel + ', shared wording ' + E.PRESETS[k].sharedPct + '%') + '>' + E.PRESETS[k].label + '</button>').join('') + '</div></div>' +
            '<p class="impact">With these rules, <b>' + st.flaggedStudents + ' of ' + st.active.length + '</b> students in ' + esc(a.short) + ' are flagged' + impact + '.</p>' +
            '<h3 class="rule-group">Checks on each AI step</h3><div class="rule-list">' + ruleCards('interaction') + '</div>' +
            '<h3 class="rule-group">Checks across a student\'s whole log</h3><div class="rule-list">' + ruleCards('student') + '</div>' +
            '<details class="vocab-details"><summary>Word lists the rules use</summary><div class="vocab-grid">' + vocab + '</div><button type="button" class="ghost-button" data-action="reset-vocab">Restore default word lists</button></details>' +
          '</section>' +
          '<section class="panel" id="rubric-editor"><div class="panel-header"><div><h2>Rubric for ' + esc(a.short) + '</h2><p>Teachers mark each criterion on every AI step with Approve, Flag or Comment. Pick rules above as criteria, or create your own.</p></div></div>' + rubricEditor(a) + '</section>' +
        '</div>' +
        '<aside class="lab-side">' +
          '<section class="panel test-results">' +
            '<div class="panel-header"><div><h2>Fixed test cases</h2><p>' + CASES.length + ' example reflections · expected results use the Standard preset</p></div><span class="test-status"><i class="' + (passed === CASES.length ? 'ok' : 'bad') + '"></i>' + passed + '/' + CASES.length + ' pass</span></div>' +
            '<div class="result-summary"><div' + tip('Cases whose level and flags match what we expect') + '><strong>' + passed + '</strong><span>pass</span></div><div' + tip('Cases treated differently from what we expect. Failing is useful: it shows what a rule change does.') + '><strong>' + (CASES.length - passed) + '</strong><span>fail</span></div><div' + tip('Cases whose result changed with your last edit') + '><strong>' + (changedN || '–') + '</strong><span>changed</span></div></div>' +
            '<div class="case-list">' + cases + '</div>' +
          '</section>' +
          '<section class="panel sandbox-panel"><div class="panel-header compact"><div><h2>Try a reflection</h2><p>Type one and see its level and flags live.</p></div></div><div class="panel-pad sandbox">' +
            '<label class="field">AI output<textarea rows="3" data-input="sb-output">' + esc(ui.sandbox.output) + '</textarea></label>' +
            '<label class="field">Student reflection<textarea rows="3" data-input="sb-critique">' + esc(ui.sandbox.critique) + '</textarea></label>' +
            '<label class="field">What the student did<select class="select-control" data-input="sb-decision">' + Object.keys(DECISIONS).map((k) => '<option value="' + k + '"' + (ui.sandbox.decision === k ? ' selected' : '') + '>' + DECISIONS[k].label + '</option>').join('') + '</select></label>' +
            '<div id="sandbox-result" class="sandbox-result" aria-live="polite">' + sandboxResult(s) + '</div></div></section>' +
          '<section class="panel"><div class="panel-header compact"><div><h2>Compare presets</h2><p>On ' + esc(a.short) + '\'s students</p></div></div><div class="table-scroll"><table class="grid-table compact"><thead><tr><th>Preset</th><th class="num">Students flagged</th><th class="num">Tests</th></tr></thead><tbody>' + compare + '</tbody></table></div></section>' +
        '</aside>' +
      '</div>';
  }

  function sandboxResult(s) {
    const r = E.evaluateInteraction({ output: ui.sandbox.output, critique: ui.sandbox.critique, decision: ui.sandbox.decision }, s);
    return levelBadge(r.level) + '<p class="why">' + esc(r.level.why) + '</p>' +
      (r.flags.length ? '<ul class="flaglist">' + r.flags.map((f) => '<li><b>' + esc(f.name) + '</b>: ' + esc(f.detail) + '</li>').join('') + '</ul>' : '<p class="ok-text">No flags with these rules.</p>');
  }

  /** Pick rubric criteria for an assignment (used in Rules & Test Lab). */
  function rubricEditor(a) {
    const ruleRows = E.RULES.filter((r) => r.scope === 'interaction').map((r) => {
      const on = a.rubric.some((x) => x.type === 'rule' && x.ruleKey === r.key);
      return '<label class="crit-pick' + (on ? ' on' : '') + '"' + tip(r.describe(a.settings.rules[r.key])) + '><input type="checkbox" data-change="rubric-rule" data-rule="' + r.key + '"' + (on ? ' checked' : '') + '><span><b>' + esc(r.name) + '</b><small>' + esc(r.describe(a.settings.rules[r.key])) + '</small></span></label>';
    }).join('');
    const customs = a.rubric.filter((x) => x.type === 'custom').map((x) =>
      '<div class="crit-pick on custom"><span><b>' + esc(x.name) + '</b><small>' + esc(x.description || 'Marked by hand only.') + '</small></span><button type="button" class="text-button danger" data-action="remove-criterion" data-cid="' + esc(x.id) + '">Remove</button></div>').join('');
    return '<div class="panel-pad"><h3 class="rule-group">From the flag rules</h3><div class="crit-grid">' + ruleRows + '</div>' +
      '<h3 class="rule-group">Your own criteria <span class="muted">(marked by hand, no automatic check)</span></h3><div class="crit-grid">' + (customs || '<p class="muted small">None yet.</p>') + '</div>' +
      '<form class="add-crit" data-form="add-criterion"><label><span class="sr">Criterion name</span><input name="name" required maxlength="60" placeholder="New criterion, e.g. Sources checked"></label><label><span class="sr">Description</span><input name="description" maxlength="200" placeholder="What the teacher looks for (optional)"></label><button type="submit" class="secondary-button">' + ICON.plus + 'Add criterion</button></form></div>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Export                                                        */
  /* ------------------------------------------------------------------ */
  function viewExport() {
    const a = asg(ui.assignmentId);
    if (!a) return emptyState('Create an assignment first.');
    const subs = stats(a).active;
    const opts = subs.map((s) => '<option value="' + s.id + '"' + (ui.exportSub === s.id ? ' selected' : '') + '>' + esc(subName(s)) + '</option>').join('');
    const row = (title, text, controls) => '<div class="export-row"><div><h3>' + title + '</h3><p>' + text + '</p></div><div class="heading-actions">' + controls + '</div></div>';
    return heading('EXPORT · ' + esc(course(a.courseId).code), 'Export ' + esc(a.short),
      'Take results into a gradebook or spreadsheet, keep a PDF record, or back up everything.',
      '<label class="heading-select"><span class="sr">Assignment</span><select class="select-control" data-change="export-assignment">' + assignmentOptions(a.id) + '</select></label>') +
      '<section class="panel"><div class="panel-header compact"><div><h2>This assignment</h2><p>' + esc(a.title) + '</p></div></div>' +
        row('Class summary (CSV)', 'One row per student: stage, log and hand-in times, steps, decisions, flags, rubric marks and your decision.', '<button type="button" class="secondary-button" data-action="export-class-csv">Download CSV</button>') +
        row('Rubric marks (CSV)', 'One row per student, step and criterion with your Approve / Flag mark and comment.', '<button type="button" class="secondary-button" data-action="export-rubric-csv">Download CSV</button>') +
        row('Every interaction (CSV)', 'One row per AI step with the prompt, output, reflection, level and flags. Useful for moderation.', '<button type="button" class="secondary-button" data-action="export-interactions-csv">Download CSV</button>') +
        row('Class report', 'A printable overview with flags and decisions per student. Choose "Save as PDF" in the print window.', '<button type="button" class="secondary-button" data-action="print-class">' + ICON.print + 'Print or save PDF</button>') +
        row('One student\'s record', 'Timeline, flags, your rubric marks and comments.', '<label><span class="sr">Student</span><select class="select-control" data-change="exportSub"><option value="">Choose a student</option>' + opts + '</select></label><button type="button" class="secondary-button" data-action="print-student" data-id="' + esc(ui.exportSub) + '"' + (ui.exportSub ? '' : ' disabled') + '>Print or save PDF</button>') +
        row('Rule settings', 'Share this assignment\'s rule thresholds and word lists with another marker.', '<button type="button" class="secondary-button" data-action="export-rules">Download rules</button><label class="ghost-button file">Load rules<input type="file" accept=".json,application/json" data-change="import-rules" hidden></label>') +
      '</section>' +
      '<section class="panel"><div class="panel-header compact"><div><h2>Everything</h2><p>All courses, assignments, students, logs and reviews.</p></div></div>' +
        row('Full backup (JSON)', 'Restore it on any computer from this page.', '<button type="button" class="secondary-button" data-action="export-json">Download backup</button><label class="ghost-button file">Restore backup<input type="file" accept=".json,application/json" data-change="import-json" hidden></label>') +
      '</section>';
  }

  function csv(rows) {
    return rows.map((r) => r.map((v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  const fileBase = (a) => (course(a.courseId).code + '-' + a.short).replace(/[^A-Za-z0-9]+/g, '-');

  function exportClassCsv(a) {
    const rows = [['Name', 'UPI', 'Email', 'Group', 'Stage', 'AI log attached', 'Handed in', 'Interactions', 'Changed', 'Not used', 'Used unchanged', 'Avg critique level', 'Shared wording %', 'Rule flags', 'Flag names', 'Rubric approved', 'Rubric flagged', 'Your decision', 'Review status', 'Review minutes', 'Comment']];
    stats(a).subs.forEach((s) => {
      const p = person(s.studentId); const e = evalOf(s); const pr = rubricProgress(s, a);
      rows.push([fullName(p), p.upi, p.email, groupOf(s), STAGES[s.stage].label, s.logsAttachedAt || '', s.handedInAt || '', e.interactions.length, e.decisions.changed, e.decisions.not_used, e.decisions.unchanged,
        e.avgLevel == null ? '' : e.avgLevel.toFixed(2), s.stage === 'handed_in' && e.interactions.length ? Math.round(e.shared.coverage * 100) : '', e.flagCount, flagSummary(e), pr.approve, pr.flag,
        s.review.decision || '', REVIEW[s.review.status], (s.review.seconds / 60).toFixed(1), s.review.comment]);
    });
    download(fileBase(a) + '-summary-' + stamp() + '.csv', '﻿' + csv(rows), 'text/csv');
  }
  function exportRubricCsv(a) {
    const rows = [['Name', 'UPI', 'Step', 'Task', 'Criterion', 'Criterion type', 'Mark', 'Comment']];
    stats(a).active.forEach((s) => {
      const p = person(s.studentId);
      s.interactions.forEach((i) => a.rubric.forEach((c) => {
        const x = (s.review.marks[i.id] || {})[c.id] || {};
        rows.push([fullName(p), p.upi, i.step, i.task, criterionInfo(a, c).name, c.type === 'rule' ? 'From rule' : 'Custom', x.mark || '', x.comment || '']);
      }));
    });
    download(fileBase(a) + '-rubric-' + stamp() + '.csv', '﻿' + csv(rows), 'text/csv');
  }
  function exportInteractionsCsv(a) {
    const rows = [['Name', 'UPI', 'Step', 'Task', 'Tool', 'Time', 'Prompt', 'AI output', 'Reflection', 'Next chat message', 'Decision', 'Critique level', 'Flags']];
    stats(a).active.forEach((s) => evalOf(s).interactions.forEach((i) =>
      rows.push([subName(s), person(s.studentId).upi, i.step, i.task, i.tool, i.timestamp, i.prompt, i.output, i.critique, i.pushbackText, (DECISIONS[i.decision] || DECISIONS.unrecorded).label, i.result.level.level, i.result.flags.map((f) => f.name).join('; ')])));
    download(fileBase(a) + '-interactions-' + stamp() + '.csv', '﻿' + csv(rows), 'text/csv');
  }

  function printHtml(html) { $('#print-area').innerHTML = html; window.print(); }

  function printStudent(id) {
    const s = sub(id);
    if (!s) return;
    const a = asg(s.assignmentId); const e = evalOf(s); const r = s.review; const p = person(s.studentId);
    const markText = (x) => x ? (x.mark === 'approve' ? 'Approved' : x.mark === 'flag' ? 'Flagged' : 'Comment') + (x.comment ? ': ' + x.comment : '') : 'Not marked';
    printHtml('<h1>' + esc(fullName(p)) + ' (' + esc(p.upi) + ')</h1><p>' + esc(course(a.courseId).code) + ' · ' + esc(a.title) + '<br>' + STAGES[s.stage].label + (s.logsAttachedAt ? '. AI log attached ' + fmtDate(s.logsAttachedAt) : '') + (s.handedInAt ? ', handed in ' + fmtDate(s.handedInAt) : '') + '.<br>Printed ' + new Date().toLocaleString('en-NZ') + '. Review: ' + REVIEW[r.status] + (r.decision ? ' (' + (r.decision === 'approve' ? 'approved' : 'flagged') + ')' : '') + '. Time reviewing: ' + fmtTime(r.seconds) + '.</p>' +
      (r.comment ? '<p><b>Comment:</b> ' + esc(r.comment) + '</p>' : '') +
      '<p>' + e.interactions.length + ' interactions, ' + e.flagCount + ' rule flags' + (e.flagCount ? ' (' + esc(flagSummary(e)) + ')' : '') + '.</p>' +
      '<h2>Interactions and rubric</h2>' + e.interactions.map((i) => '<div class="p-step"><h3>Step ' + i.step + ': ' + esc(i.task) + ' (' + (DECISIONS[i.decision] || DECISIONS.unrecorded).label + ', ' + esc(i.tool) + ')</h3>' +
        '<p><b>Prompt:</b> ' + esc(i.prompt) + '</p><p><b>AI response:</b> ' + esc(i.output) + '</p>' + (i.pushbackText ? '<p><b>Next chat message:</b> ' + esc(i.pushbackText) + '</p>' : '') +
        (a.rubric.length ? '<ul>' + a.rubric.map((c) => '<li>' + esc(criterionInfo(a, c).name) + ': ' + esc(markText((r.marks[i.id] || {})[c.id])) + '</li>').join('') + '</ul>' : '') + '</div>').join('') +
      (s.stage === 'handed_in' ? '<h2>Final submission (highlighted text matches AI output word-for-word)</h2><p>' + e.shared.segments.map((g) => g.shared ? '<mark>' + esc(g.text) + '</mark>' : esc(g.text)).join('') + '</p>' : '') +
      '<p class="p-foot">Flags are prompts for review, not evidence of misconduct. Generated by a prototype using synthetic data.</p>');
  }

  function printClass(a) {
    const st = stats(a);
    printHtml('<h1>' + esc(a.title) + '</h1><p>' + esc(course(a.courseId).code) + '. Printed ' + new Date().toLocaleString('en-NZ') + '. Rules: ' + esc(E.PRESETS[a.settings.preset] ? E.PRESETS[a.settings.preset].label : 'Custom') + '.</p>' +
      '<p>' + st.enrolled + ' students: ' + st.handed.length + ' handed in, ' + st.logsOnly + ' log only, ' + st.notStarted + ' not started. ' + st.flaggedStudents + ' flagged by rules, ' + st.reviewed + ' reviewed.</p>' +
      '<table><thead><tr><th>Student</th><th>Stage</th><th>Steps</th><th>Avg level</th><th>Flags</th><th>Rubric ✓/⚑</th><th>Decision</th></tr></thead><tbody>' +
      st.subs.slice().sort((x, y) => evalOf(y).flagCount - evalOf(x).flagCount).map((s) => { const e = evalOf(s); const pr = rubricProgress(s, a); return '<tr><td>' + esc(subName(s)) + '</td><td>' + STAGES[s.stage].label + '</td><td>' + e.interactions.length + '</td><td>' + (e.avgLevel == null ? '' : e.avgLevel.toFixed(1)) + '</td><td>' + e.flagCount + '</td><td>' + pr.approve + '/' + pr.flag + '</td><td>' + (s.review.decision || REVIEW[s.review.status]) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="p-foot">Flags are prompts for review, not evidence of misconduct.</p>');
  }

  function readJsonFile(input, cb) {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { cb(JSON.parse(reader.result)); } catch (e) { toast('That file is not valid JSON.', true); } input.value = ''; };
    reader.readAsText(f);
  }

  /* ------------------------------------------------------------------ */
  /* View: Admin (courses, assignments, people, Canvas & data)           */
  /* ------------------------------------------------------------------ */
  function embedUrl(a) { return location.origin + location.pathname + '?embed=1#assignment/' + a.id; }

  function viewAdmin() {
    const tabs = [['courses', 'Courses', state.courses.length], ['assignments', 'Assignments', state.assignments.length], ['people', 'People', state.students.length], ['canvas', 'Canvas & data', '']];
    const body = { courses: adminCourses, assignments: adminAssignments, people: adminPeople, canvas: adminCanvas }[ui.adminTab]();
    const action = { courses: '<button type="button" class="primary-button" data-action="new-course">' + ICON.plus + 'Add course</button>', assignments: '<button type="button" class="primary-button" data-action="new-assignment">' + ICON.plus + 'New assignment</button>', people: '<button type="button" class="primary-button" data-action="new-student">' + ICON.plus + 'Add student</button>', canvas: '' }[ui.adminTab];
    return heading('COURSE SETTINGS', 'Admin', 'Set up the classes you teach, their assignments and rubrics, and who is enrolled.', action) +
      '<section class="panel members-panel"><div class="tab-bar" role="tablist">' + tabs.map(([k, l, n]) => '<button type="button" role="tab" aria-selected="' + (ui.adminTab === k) + '" class="' + (ui.adminTab === k ? 'active' : '') + '" data-action="go" data-view="admin" data-id="' + k + '">' + l + (n !== '' ? ' <span>' + n + '</span>' : '') + '</button>').join('') + '</div>' + body + '</section>';
  }

  function adminCourses() {
    return '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>Badge</th><th>Course code</th><th>Name</th><th>Semester</th><th class="num">Students</th><th class="num">Assignments</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' +
      state.courses.map((c) => '<tr><td><input class="mini-input" maxlength="3" value="' + esc(c.badge) + '" data-change="course-field" data-cid="' + c.id + '" data-field="badge" aria-label="Badge for ' + esc(c.code) + '"></td>' +
        ['code', 'name', 'semester'].map((f) => '<td><input value="' + esc(c[f]) + '" data-change="course-field" data-cid="' + c.id + '" data-field="' + f + '" aria-label="' + f + ' for ' + esc(c.code) + '"></td>').join('') +
        '<td class="num">' + c.roster.length + '</td><td class="num">' + courseAssignments(c.id).length + '</td>' +
        '<td class="row-actions"><button type="button" class="secondary-button small" data-action="go" data-view="course" data-id="' + c.id + '">Open</button><button type="button" class="ghost-button small" data-action="new-assignment" data-course="' + c.id + '">' + ICON.plus + 'Assignment</button><button type="button" class="text-button danger" data-action="delete-course" data-cid="' + c.id + '">Remove</button></td></tr>').join('') +
      '</tbody></table></div><p class="panel-pad hint">You teach every course listed here. Removing a course also removes its assignments and their submissions; students stay in the People list.</p>';
  }

  function adminAssignments() {
    return state.courses.map((c) => {
      const list = courseAssignments(c.id);
      return '<div class="admin-group"><div class="admin-group-head"><span class="course-chip">' + esc(c.code) + '</span><strong>' + esc(c.name) + '</strong><button type="button" class="ghost-button small" data-action="new-assignment" data-course="' + c.id + '">' + ICON.plus + 'New assignment</button></div>' +
        (list.length ? '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>Assignment</th><th>Due</th><th>Status</th><th>Rubric</th><th>Rules</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' +
          list.map((a) => '<tr><td><strong>' + esc(a.short) + '</strong><small class="sub-line">' + esc(trunc(a.title, 70)) + '</small></td><td>' + fmtDay(a.dueDate) + '</td><td><span class="status-pill ' + (isOpen(a) ? 'ready' : 'reviewed') + '">' + (isOpen(a) ? 'Open' : 'Closed') + '</span></td>' +
            '<td' + tip(a.rubric.map((x) => criterionInfo(a, x).name).join(' · ') || 'No criteria') + '>' + plural(a.rubric.length, 'criterion', 'criteria') + '</td><td>' + (E.PRESETS[a.settings.preset] ? E.PRESETS[a.settings.preset].label : 'Custom') + '</td>' +
            '<td class="row-actions"><button type="button" class="secondary-button small" data-action="edit-assignment" data-aid="' + a.id + '">Edit</button><button type="button" class="ghost-button small" data-action="go" data-view="rules" data-id="' + a.id + '">' + ICON.flask + 'Rules</button><button type="button" class="ghost-button small" data-action="copy-embed" data-aid="' + a.id + '"' + tip('Copy a link that shows this assignment\'s dashboard without the sidebar, for a Canvas page or module.') + '>' + ICON.link + 'Canvas link</button><button type="button" class="text-button danger" data-action="delete-assignment" data-aid="' + a.id + '">Remove</button></td></tr>').join('') +
          '</tbody></table></div>' : '<p class="panel-pad muted">No assignments yet.</p>') + '</div>';
    }).join('');
  }

  function adminPeople() {
    const cid = ui.peopleCourse;
    const c = course(cid);
    const tabs = [['all', 'All students']].concat(state.courses.map((x) => [x.id, x.code]), [['staff', 'Teaching staff']]);
    const filter = '<div class="sub-tabs">' + tabs.map(([k, l]) => '<button type="button" class="filter-button' + (cid === k ? ' active' : '') + '" data-action="people-course" data-id="' + k + '">' + esc(l) + '</button>').join('') + '</div>';
    if (cid === 'staff') {
      return filter + '<div class="member-list">' + state.staff.map((m) => '<div class="member-row"><div class="member-info"><span class="avatar avatar-navy">' + esc(m.initials) + '</span><span><strong>' + esc(m.name) + '</strong><small>' + esc(m.role) + '</small></span></div><span>' + m.courses.map((x) => course(x) ? '<span class="course-chip">' + esc(course(x).code) + '</span>' : '').join(' ') + '</span><span class="role-badge teacher">' + esc(m.role) + '</span><span class="active-badge">Active</span></div>').join('') + '</div>';
    }
    const list = c ? c.roster.map((r) => ({ p: person(r.studentId), group: r.group })).filter((x) => x.p) : state.students.map((p) => ({ p }));
    return filter + '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>First name</th><th>Last name</th><th>UPI</th><th>Email</th>' + (c ? '<th>Group</th>' : '<th>Courses</th>') + '<th><span class="sr">Actions</span></th></tr></thead><tbody>' +
      list.map(({ p, group }) => '<tr>' + ['firstName', 'lastName', 'upi', 'email'].map((f) => '<td><input value="' + esc(p[f]) + '" data-change="student-field" data-pid="' + p.id + '" data-field="' + f + '"' + (f === 'email' ? ' type="email"' : '') + ' aria-label="' + f + ' for ' + esc(fullName(p)) + '"></td>').join('') +
        (c ? '<td><input class="mini-input wide" value="' + esc(group) + '" data-change="roster-group" data-cid="' + c.id + '" data-pid="' + p.id + '" aria-label="Group for ' + esc(fullName(p)) + '"></td><td class="row-actions"><button type="button" class="text-button danger" data-action="unenrol" data-cid="' + c.id + '" data-pid="' + p.id + '">Remove from course</button></td>'
          : '<td>' + state.courses.filter((x) => x.roster.some((r) => r.studentId === p.id)).map((x) => '<span class="course-chip">' + esc(x.code) + '</span>').join(' ') + '</td><td class="row-actions"><button type="button" class="text-button danger" data-action="delete-student" data-pid="' + p.id + '">Delete</button></td>') + '</tr>').join('') +
      '</tbody></table></div>' + (list.length ? '' : '<p class="panel-pad muted">No students yet.</p>');
  }

  function adminCanvas() {
    return '<div class="panel-pad canvas-pad">' +
      '<div class="info-banner">' + ICON.link + '<p><strong>Use it inside Canvas.</strong> Each assignment has an embed link that opens its review dashboard without the Lane2 sidebar. Paste it into a Canvas page, module item or Redirect tool. A full integration would use LTI 1.3 so Canvas handles login and the class list (see docs/canvas-lti.md).</p></div>' +
      '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>Assignment</th><th>Embed link</th><th><span class="sr">Copy</span></th></tr></thead><tbody>' +
      state.assignments.slice().sort(byDue).map((a) => '<tr><td><span class="course-chip">' + esc(course(a.courseId).code) + '</span> ' + esc(a.short) + '</td><td><input readonly value="' + esc(embedUrl(a)) + '" aria-label="Embed link for ' + esc(a.short) + '"></td><td><button type="button" class="secondary-button small" data-action="copy-embed" data-aid="' + a.id + '">Copy</button></td></tr>').join('') +
      '</tbody></table></div>' +
      '<h3 class="rule-group">Data</h3><p>' + (mode === 'server' ? 'Changes are saved to <code>data/db.json</code> by the local server.' : 'The server is not running, so changes are saved in this browser only. Run <code>node server.js</code> to save to a file.') + ' All students and conversations are synthetic.</p>' +
      '<div class="heading-actions"><button type="button" class="secondary-button" data-action="export-json">Download backup</button><button type="button" class="ghost-button" data-action="reset-demo">Reset to demo data</button></div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Modals                                                              */
  /* ------------------------------------------------------------------ */
  function openModal(eyebrow, title, intro, body, small) {
    $('#modalRoot').innerHTML = '<div class="modal-backdrop open" data-action="modal-backdrop"><div class="modal' + (small ? ' small-modal' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
      '<div class="modal-header"><div><span class="eyebrow accent">' + eyebrow + '</span><h2 id="modalTitle">' + title + '</h2>' + (intro ? '<p>' + intro + '</p>' : '') + '</div><button type="button" class="icon-button" data-action="close-modal" aria-label="Close">×</button></div>' + body + '</div></div>';
    setTimeout(() => { const f = $('#modalRoot input:not([type=hidden]), #modalRoot select, #modalRoot textarea'); if (f) f.focus(); }, 60);
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }

  function assignmentForm(a, courseId) {
    const isNew = !a;
    a = a || { courseId: courseId || ui.courseId || (state.courses[0] || {}).id, title: '', short: '', dueDate: '', wordLimit: '', description: 'AI use is permitted (Lane 2). Attach your AI conversation before you hand in.', settings: E.defaultSettings(), rubric: [{ type: 'rule', ruleKey: 'unchangedNoCheck' }, { type: 'rule', ruleKey: 'belowLevel' }] };
    const picked = (k) => a.rubric.some((x) => x.type === 'rule' && x.ruleKey === k);
    const customs = a.rubric.filter((x) => x.type === 'custom').map((x) => x.name + (x.description ? ': ' + x.description : '')).join('\n');
    const body = '<form data-form="' + (isNew ? 'new-assignment' : 'edit-assignment') + '"' + (isNew ? '' : ' data-aid="' + a.id + '"') + '>' +
      '<div class="form-grid"><label>Course<select name="courseId" required>' + state.courses.map((c) => '<option value="' + c.id + '"' + (c.id === a.courseId ? ' selected' : '') + '>' + esc(c.code + ' · ' + c.name) + '</option>').join('') + '</select></label>' +
      '<label>Short name<input name="short" required maxlength="24" value="' + esc(a.short) + '" placeholder="e.g. Report 3"></label></div>' +
      '<label>Title<input name="title" required value="' + esc(a.title) + '" placeholder="e.g. Report 3: Implementation plan"></label>' +
      '<div class="form-grid"><label>Due date<input name="dueDate" type="date" required value="' + esc(a.dueDate) + '"></label><label>Word limit <span class="optional">(optional)</span><input name="wordLimit" type="number" min="0" value="' + esc(a.wordLimit || '') + '"></label></div>' +
      '<label>Instructions for students<textarea name="description" rows="2">' + esc(a.description) + '</textarea></label>' +
      (isNew ? '<label>Flag rule strictness<select name="preset">' + Object.keys(E.PRESETS).map((k) => '<option value="' + k + '"' + (k === 'standard' ? ' selected' : '') + '>' + E.PRESETS[k].label + '</option>').join('') + '</select></label>' : '') +
      '<fieldset class="crit-fieldset"><legend>Rubric criteria <span class="optional">(teachers mark these on every AI step)</span></legend><div class="crit-grid">' +
        E.RULES.filter((r) => r.scope === 'interaction').map((r) => '<label class="crit-pick' + (picked(r.key) ? ' on' : '') + '"><input type="checkbox" name="rule" value="' + r.key + '"' + (picked(r.key) ? ' checked' : '') + '><span><b>' + esc(r.name) + '</b><small>' + esc(r.describe(a.settings.rules[r.key])) + '</small></span></label>').join('') +
      '</div><label>Your own criteria <span class="optional">(one per line, "Name: what to look for")</span><textarea name="custom" rows="3" placeholder="Sources checked: claims from the AI were checked against a reliable source">' + esc(customs) + '</textarea></label></fieldset>' +
      '<div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">' + (isNew ? 'Create assignment' : 'Save changes') + '</button></div></form>';
    openModal(isNew ? 'NEW ASSIGNMENT' : 'EDIT ASSIGNMENT', isNew ? 'Set a new assignment' : 'Edit ' + esc(a.short), isNew ? 'Every enrolled student gets an empty submission. They attach their AI log before handing in.' : '', body);
  }

  function rubricFromForm(fd, old) {
    const keep = (match) => (old || []).find(match);
    const rules = fd.getAll('rule').map((k) => keep((x) => x.type === 'rule' && x.ruleKey === k) || { id: 'cr-' + k, type: 'rule', ruleKey: k });
    const customs = String(fd.get('custom') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, ...rest] = l.split(':');
      const n = name.trim().slice(0, 60);
      return keep((x) => x.type === 'custom' && x.name === n) || { id: uid('cr-'), type: 'custom', name: n, description: rest.join(':').trim() };
    });
    return rules.concat(customs);
  }

  function emptySubmission(a, studentId) {
    return { id: uid('s-'), assignmentId: a.id, studentId, stage: 'not_started', declaration: null, logsAttachedAt: null, handedInAt: null, sources: [], interactions: [], submission: '', review: { status: 'not_reviewed', decision: null, comment: '', marks: {}, seconds: 0 } };
  }
  function enrol(c, studentId, group) {
    if (c.roster.some((r) => r.studentId === studentId)) return false;
    c.roster.push({ studentId, group: group || 'Tutorial A' });
    courseAssignments(c.id).forEach((a) => { if (!state.submissions.some((s) => s.assignmentId === a.id && s.studentId === studentId)) state.submissions.push(emptySubmission(a, studentId)); });
    return true;
  }

  const FORMS = {
    'new-assignment': (f, fd) => {
      const c = course(fd.get('courseId'));
      const a = { id: uid('a-'), courseId: c.id, title: fd.get('title').trim(), short: fd.get('short').trim(), description: fd.get('description').trim(), dueDate: fd.get('dueDate'), wordLimit: Number(fd.get('wordLimit')) || 0, lane: 2,
        settings: E.applyPreset(E.defaultSettings(), fd.get('preset') || 'standard'), rubric: [] };
      a.rubric = rubricFromForm(fd, []);
      state.assignments.push(a);
      c.roster.forEach((r) => state.submissions.push(emptySubmission(a, r.studentId)));
      closeModal(); save(); go('assignment', a.id); toast(a.short + ' created for ' + c.code + '. ' + plural(c.roster.length, 'student') + ' can now attach their AI logs.');
    },
    'edit-assignment': (f, fd) => {
      const a = asg(f.dataset.aid);
      const newCourse = fd.get('courseId');
      if (newCourse !== a.courseId && asgSubs(a.id).some((s) => s.stage !== 'not_started')) { toast('Students have already started this assignment, so it cannot move to another course.', true); return; }
      if (newCourse !== a.courseId) { state.submissions = state.submissions.filter((s) => s.assignmentId !== a.id); a.courseId = newCourse; course(newCourse).roster.forEach((r) => state.submissions.push(emptySubmission(a, r.studentId))); }
      Object.assign(a, { title: fd.get('title').trim(), short: fd.get('short').trim(), description: fd.get('description').trim(), dueDate: fd.get('dueDate'), wordLimit: Number(fd.get('wordLimit')) || 0 });
      a.rubric = rubricFromForm(fd, a.rubric);
      closeModal(); save(); render(); toast(a.short + ' saved.');
    },
    'new-course': (f, fd) => {
      const code = fd.get('code').trim();
      const c = { id: uid('c-'), code, name: fd.get('name').trim(), semester: fd.get('semester').trim(), badge: (code.replace(/[^A-Za-z]/g, '').slice(0, 2) || 'C').toUpperCase(), roster: [] };
      state.courses.push(c);
      const me = state.staff.find((m) => m.name === state.teacher.name); if (me) me.courses.push(c.id);
      closeModal(); save(); go('course', c.id); toast(code + ' added. Add students and assignments next.');
    },
    'new-student': (f, fd) => {
      const c = course(fd.get('courseId'));
      let p = person(fd.get('existing'));
      if (!p) {
        const first = fd.get('firstName').trim(); const last = fd.get('lastName').trim();
        if (!first) { toast('Choose an existing student or enter a first name.', true); return; }
        p = { id: uid('p'), firstName: first, lastName: last, upi: fd.get('upi').trim(), email: fd.get('email').trim(), avatar: ['avatar-rose', 'avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-gold'][state.students.length % 5] };
        state.students.push(p);
      }
      const added = c ? enrol(c, p.id, fd.get('group').trim()) : false;
      closeModal(); save(); render();
      toast(c ? (added ? fullName(p) + ' enrolled in ' + c.code + '.' : fullName(p) + ' is already in ' + c.code + '.') : fullName(p) + ' added.');
    },
    'add-criterion': (f, fd) => {
      const a = asg(ui.assignmentId);
      a.rubric.push({ id: uid('cr-'), type: 'custom', name: fd.get('name').trim().slice(0, 60), description: fd.get('description').trim() });
      save(); render(); toast('Criterion added to the ' + a.short + ' rubric.');
      const ed = $('#rubric-editor'); if (ed) ed.scrollIntoView({ block: 'nearest' });
    }
  };

  function guide() {
    openModal('MARKER GUIDE', 'How Lane2 works', '', '<div class="guide">' +
      '<ol><li><b>Choose a course.</b> Start on All courses, or use the course drop-down in the sidebar.</li>' +
      '<li><b>Open an assignment.</b> Its review dashboard shows who has attached an AI log, who has handed in, and which rules raised flags.</li>' +
      '<li><b>Review a student.</b> Read each AI step and mark the rubric criteria beside it: Approve, Flag or Comment. Then Approve or Flag the whole submission in the panel on the right.</li>' +
      '<li><b>Tune the rules.</b> Rules &amp; Test Lab is one page: change a threshold and the fixed test cases and the class numbers update immediately.</li>' +
      '<li><b>Set up.</b> Admin is where you add courses, set new assignments (with their rubric) and enrol students. Each assignment has a Canvas embed link.</li></ol>' +
      '<p class="hint">Students attach their AI conversation before they hand in. Flags are prompts to look closer; the decision is always yours. All data here is synthetic.</p>' +
      '<div class="modal-actions"><button type="button" class="primary-button" data-action="close-modal">Got it</button></div></div>', true);
  }

  /* ------------------------------------------------------------------ */
  /* Tooltip and toast                                                   */
  /* ------------------------------------------------------------------ */
  let tipEl = null;
  function showTip(target) {
    const t = $('#tip');
    t.textContent = target.dataset.tip;
    t.hidden = false;
    const r = target.getBoundingClientRect();
    const w = t.offsetWidth; const h = t.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = r.top - h - 8;
    t.style.left = left + 'px';
    t.style.top = Math.max(8, top) + 'px';
    tipEl = target;
  }
  function hideTip() { const t = $('#tip'); if (t) t.hidden = true; tipEl = null; }
  document.addEventListener('mouseover', (ev) => { const t = ev.target.closest && ev.target.closest('[data-tip]'); if (t && t !== tipEl) showTip(t); else if (!t && tipEl) hideTip(); });
  document.addEventListener('focusin', (ev) => { const t = ev.target.closest && ev.target.closest('[data-tip]'); if (t) showTip(t); else hideTip(); });
  window.addEventListener('scroll', hideTip, true);

  function toast(msg, bad) {
    const item = document.createElement('div');
    item.className = 'toast' + (bad ? ' bad' : '');
    item.textContent = msg;
    $('#toastRegion').append(item);
    setTimeout(() => item.classList.add('out'), 3200);
    setTimeout(() => item.remove(), 3600);
  }

  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); toast(label + ' copied.'); }
    catch (e) { toast(label + ': ' + text); }
  }

  /* ------------------------------------------------------------------ */
  /* Review timer                                                        */
  /* ------------------------------------------------------------------ */
  function updateTimer() {
    const el = $('#timer-display');
    if (el && ui.timer) el.textContent = '(' + fmtTime((Date.now() - ui.timer.start) / 1000) + ')';
  }
  setInterval(updateTimer, 1000);
  function stopTimer(quiet) {
    const s = ui.timer && sub(ui.timer.subId);
    if (s) { s.review.seconds += Math.round((Date.now() - ui.timer.start) / 1000); touchReview(s); }
    ui.timer = null;
    save();
    if (!quiet && s) toast('Review time saved: ' + fmtTime(s.review.seconds) + ' in total.');
  }

  /* ------------------------------------------------------------------ */
  /* Rule changes (with "what changed" tracking for the Test Lab)        */
  /* ------------------------------------------------------------------ */
  function changeSettings(mutate, msg) {
    const a = asg(ui.assignmentId);
    const before = runCases(a.settings);
    const beforeFlagged = stats(a).flaggedStudents;
    mutate(a);
    const after = runCases(a.settings);
    ui.caseChanged = {};
    after.forEach((x, k) => { if (x.pass !== before[k].pass || x.flags.join() !== before[k].flags.join() || x.r.level.level !== before[k].r.level.level) ui.caseChanged[x.t.id] = true; });
    ui.lastImpact = { aid: a.id, from: beforeFlagged };
    save(); render();
    if (msg) toast(msg);
  }
  function setRule(key, field, value) {
    changeSettings((a) => {
      const s = a.settings;
      s.rules[key][field] = value;
      s.preset = 'custom';
      // Snap back to a preset name if the numbers match one exactly.
      Object.keys(E.PRESETS).forEach((p) => {
        const x = E.applyPreset(s, p);
        if (['shortCritique', 'belowLevel', 'repeatsOutput', 'mostlyUnchanged', 'highShared'].every((k) => JSON.stringify(x.rules[k]) === JSON.stringify(s.rules[k]))) s.preset = p;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  function closeSidebar() { $('.sidebar').classList.remove('open'); $('.drawer-backdrop').classList.remove('open'); }
  const curSub = () => sub(ui.subId);

  const ACTIONS = {
    go: (el) => {
      if (!el.dataset.view || (el.dataset.view === 'review' && !el.dataset.id)) return;
      if (el.dataset.course) ui.peopleCourse = el.dataset.course;
      go(el.dataset.view, el.dataset.id || undefined);
    },
    'toggle-course-menu': () => { ui.courseMenu = !ui.courseMenu; renderSidebar(); },
    'pick-course': (el) => { ui.courseMenu = false; el.dataset.id ? go('course', el.dataset.id) : (ui.courseId = null, go('home')); },
    'toggle-sidebar': () => { $('.sidebar').classList.toggle('open'); $('.drawer-backdrop').classList.toggle('open'); },
    'close-sidebar': closeSidebar,
    'open-guide': guide,
    'home-filter': (el) => { ui.homeFilter = ui.homeFilter === el.dataset.filter && el.classList.contains('metric-card') ? 'all' : el.dataset.filter; render(); },
    'toggle-flagged': () => { ui.onlyFlagged = !ui.onlyFlagged; render(); },
    'sort-review': () => { ui.sort = 'review'; render(); $('#students-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'filter-rule': (el) => { ui.ruleFilter = ui.ruleFilter === el.dataset.rule ? null : el.dataset.rule; render(); },
    'filter-level': (el) => { const l = Number(el.dataset.level); ui.levelFilter = ui.levelFilter === l ? null : l; render(); },
    'filter-decision': (el) => { ui.decisionFilter = ui.decisionFilter === el.dataset.key ? null : el.dataset.key; render(); },
    'clear-filter': (el) => { ui[el.dataset.key] = el.dataset.key === 'onlyFlagged' ? false : null; render(); },
    jump: (el, ev) => { ev.preventDefault(); const t = document.getElementById('step-' + el.dataset.id); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.classList.add('pulse'); setTimeout(() => t.classList.remove('pulse'), 1200); } },
    'toggle-all': (el) => { const open = el.dataset.open === '1'; curSub().interactions.forEach((i) => { ui.open[i.id] = open; }); render(); },
    mark: (el) => {
      const s = curSub();
      const { iid, cid, mark } = el.dataset;
      const key = iid + '|' + cid;
      if (mark === 'comment') { ui.critOpen[key] = !ui.critOpen[key]; render(); if (ui.critOpen[key]) { const ta = $('textarea[data-iid="' + iid + '"][data-cid="' + cid + '"]'); if (ta) ta.focus(); } return; }
      const m = s.review.marks[iid] = s.review.marks[iid] || {};
      const x = m[cid] = m[cid] || { mark: null, comment: '' };
      x.mark = x.mark === mark ? null : mark;
      touchReview(s); save(); render();
    },
    'approve-rest': (el) => {
      const s = curSub(); const a = asg(s.assignmentId);
      const m = s.review.marks[el.dataset.iid] = s.review.marks[el.dataset.iid] || {};
      a.rubric.forEach((c) => { m[c.id] = m[c.id] || { mark: null, comment: '' }; if (!m[c.id].mark) m[c.id].mark = 'approve'; });
      touchReview(s); save(); render();
    },
    'sub-approve': () => { const s = curSub(); s.review.decision = s.review.decision === 'approve' ? null : 'approve'; touchReview(s); save(); render(); if (s.review.decision) toast(subName(s) + ' approved.'); },
    'sub-flag': () => { const s = curSub(); s.review.decision = s.review.decision === 'flag' ? null : 'flag'; if (s.review.decision) ui.railComment = true; touchReview(s); save(); render(); if (s.review.decision) { toast(subName(s) + ' flagged for follow-up. Add a comment to say why.'); const ta = $('.rail-comment textarea'); if (ta) ta.focus(); } },
    'sub-comment': () => { ui.railComment = !ui.railComment || !!curSub().review.comment; render(); const ta = $('.rail-comment textarea'); if (ta) ta.focus(); },
    'sub-clear': () => { const s = curSub(); s.review.decision = null; touchReview(s); save(); render(); toast('Decision cleared.'); },
    timer: (el) => {
      const s = sub(el.dataset.id);
      if (ui.timer && ui.timer.subId === s.id) { stopTimer(); }
      else { if (ui.timer) stopTimer(true); ui.timer = { subId: s.id, start: Date.now() }; s.review.status = s.review.status === 'not_reviewed' ? 'in_progress' : s.review.status; save(); }
      render();
    },
    preset: (el) => changeSettings((a) => { a.settings = E.applyPreset(a.settings, el.dataset.preset); }, E.PRESETS[el.dataset.preset].label + ' preset applied to ' + asg(ui.assignmentId).short + '.'),
    'reset-vocab': () => changeSettings((a) => { a.settings.vocab = clone(E.DEFAULT_VOCAB); }, 'Default word lists restored.'),
    'remove-criterion': (el) => { const a = asg(ui.assignmentId); a.rubric = a.rubric.filter((x) => x.id !== el.dataset.cid); save(); render(); toast('Criterion removed. Marks already given are kept in the backup but no longer shown.'); },
    'print-student': (el) => printStudent(el.dataset.id),
    'print-class': () => printClass(asg(ui.assignmentId)),
    'export-class-csv': () => exportClassCsv(asg(ui.assignmentId)),
    'export-rubric-csv': () => exportRubricCsv(asg(ui.assignmentId)),
    'export-interactions-csv': () => exportInteractionsCsv(asg(ui.assignmentId)),
    'export-json': () => download('lane2-backup-' + stamp() + '.json', JSON.stringify(state, null, 2), 'application/json'),
    'export-rules': () => { const a = asg(ui.assignmentId); download(fileBase(a) + '-rules-' + stamp() + '.json', JSON.stringify(a.settings, null, 2), 'application/json'); },
    'new-assignment': (el) => assignmentForm(null, el.dataset.course),
    'edit-assignment': (el) => assignmentForm(asg(el.dataset.aid)),
    'new-course': () => openModal('NEW COURSE', 'Add a course', 'Courses you teach appear on the All courses page and in the sidebar drop-down.',
      '<form data-form="new-course"><div class="form-grid"><label>Course code<input name="code" required maxlength="20" placeholder="e.g. INFOSYS 340"></label><label>Semester<input name="semester" required value="Semester 2 · 2026"></label></div><label>Course name<input name="name" required placeholder="e.g. Business Process Management"></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Add course</button></div></form>', true),
    'new-student': () => {
      const cid = course(ui.peopleCourse) ? ui.peopleCourse : (ui.courseId || '');
      openModal('ENROLMENT', 'Add a student', 'Enrol an existing student in a course, or create a new one. They get an empty submission for every assignment in that course.',
        '<form data-form="new-student"><label>Course<select name="courseId">' + state.courses.map((c) => '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.code) + '</option>').join('') + '</select></label>' +
        '<label>Existing student <span class="optional">(leave blank to create a new one)</span><select name="existing"><option value="">New student…</option>' + state.students.slice().sort((x, y) => fullName(x).localeCompare(fullName(y))).map((p) => '<option value="' + p.id + '">' + esc(fullName(p) + ' (' + p.upi + ')') + '</option>').join('') + '</select></label>' +
        '<div class="form-grid"><label>First name<input name="firstName"></label><label>Last name<input name="lastName"></label><label>UPI<input name="upi"></label><label>Email<input name="email" type="email"></label></div>' +
        '<label>Group<input name="group" value="Tutorial A"></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Add student</button></div></form>', true);
    },
    'people-course': (el) => { ui.peopleCourse = el.dataset.id; render(); },
    'close-modal': closeModal,
    'modal-backdrop': (el, ev) => { if (ev.target === el) closeModal(); },
    'copy-embed': (el) => copyText(embedUrl(asg(el.dataset.aid)), 'Canvas embed link'),
    'delete-course': (el) => {
      const c = course(el.dataset.cid);
      const aids = courseAssignments(c.id).map((a) => a.id);
      if (!confirm('Remove ' + c.code + ' with its ' + plural(aids.length, 'assignment') + ' and all their submissions? Students stay in the People list.')) return;
      state.courses = state.courses.filter((x) => x !== c);
      state.assignments = state.assignments.filter((a) => !aids.includes(a.id));
      state.submissions = state.submissions.filter((s) => !aids.includes(s.assignmentId));
      if (ui.courseId === c.id) { ui.courseId = null; ui.assignmentId = null; }
      save(); render(); toast(c.code + ' removed.');
    },
    'delete-assignment': (el) => {
      const a = asg(el.dataset.aid);
      if (!confirm('Remove ' + a.short + ' (' + a.title + ') and all its submissions and reviews?')) return;
      state.assignments = state.assignments.filter((x) => x !== a);
      state.submissions = state.submissions.filter((s) => s.assignmentId !== a.id);
      if (ui.assignmentId === a.id) ui.assignmentId = defaultAssignment(a.courseId);
      save(); render(); toast(a.short + ' removed.');
    },
    unenrol: (el) => {
      const c = course(el.dataset.cid); const p = person(el.dataset.pid);
      const aids = courseAssignments(c.id).map((a) => a.id);
      if (!confirm('Remove ' + fullName(p) + ' from ' + c.code + '? Their submissions for this course are deleted.')) return;
      c.roster = c.roster.filter((r) => r.studentId !== p.id);
      state.submissions = state.submissions.filter((s) => !(s.studentId === p.id && aids.includes(s.assignmentId)));
      save(); render();
    },
    'delete-student': (el) => {
      const p = person(el.dataset.pid);
      if (!confirm('Delete ' + fullName(p) + ' from every course, with all their submissions?')) return;
      state.courses.forEach((c) => { c.roster = c.roster.filter((r) => r.studentId !== p.id); });
      state.submissions = state.submissions.filter((s) => s.studentId !== p.id);
      state.students = state.students.filter((x) => x !== p);
      save(); render();
    },
    'reset-demo': async () => {
      if (!confirm('Replace all current data with the demo courses? Download a backup first if you want to keep your changes.')) return;
      if (mode === 'server') { const r = await fetch('/api/reset', { method: 'POST' }); state = await r.json(); }
      else { state = clone(window.SEED_DATA); try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
      normalise(); ui.timer = null; ui.courseId = null; ui.assignmentId = null;
      go('home'); setSync(); toast('Demo data restored.');
    }
  };

  const CHANGES = {
    group: (el) => { ui.group = el.value; renderRows(); },
    sort: (el) => { ui.sort = el.value; renderRows(); },
    stage: (el) => { ui.stage = el.value; renderRows(); },
    onlyFlagged: (el) => { ui.onlyFlagged = el.checked; render(); },
    'sub-comment': (el) => { const s = curSub(); s.review.comment = el.value.trim(); touchReview(s); save(); toast('Comment saved.'); },
    'crit-comment': (el) => {
      const s = curSub();
      const m = s.review.marks[el.dataset.iid] = s.review.marks[el.dataset.iid] || {};
      const x = m[el.dataset.cid] = m[el.dataset.cid] || { mark: null, comment: '' };
      x.comment = el.value.trim();
      touchReview(s); save(); toast('Comment saved.');
    },
    'rules-assignment': (el) => go('rules', el.value),
    'export-assignment': (el) => go('export', el.value),
    'copy-rules': (el) => { const from = asg(el.value); if (!from) return; changeSettings((a) => { a.settings = clone(from.settings); }, 'Rules copied from ' + course(from.courseId).code + ' ' + from.short + '.'); },
    'rule-num': (el) => setRule(el.dataset.rule, el.dataset.field, Math.max(+el.min || 0, Math.min(+el.max || 1000, Number(el.value) || 0))),
    'rule-bool': (el) => setRule(el.dataset.rule, el.dataset.field, el.checked),
    vocab: (el) => changeSettings((a) => { a.settings.vocab[el.dataset.key] = el.value.split('\n').map((x) => x.trim()).filter(Boolean); }, 'Word list saved.'),
    'rubric-rule': (el) => {
      const a = asg(ui.assignmentId);
      if (el.checked) { if (!a.rubric.some((x) => x.type === 'rule' && x.ruleKey === el.dataset.rule)) a.rubric.push({ id: 'cr-' + el.dataset.rule, type: 'rule', ruleKey: el.dataset.rule }); }
      else a.rubric = a.rubric.filter((x) => !(x.type === 'rule' && x.ruleKey === el.dataset.rule));
      save(); render(); toast((el.checked ? 'Added to' : 'Removed from') + ' the ' + a.short + ' rubric.');
    },
    exportSub: (el) => { ui.exportSub = el.value; render(); },
    'import-json': (el) => readJsonFile(el, (data) => {
      if (!validState(data)) return toast('This file is not a backup from this version of Lane2.', true);
      if (!confirm('Replace all current data with this backup (' + plural(data.courses.length, 'course') + ', ' + plural(data.assignments.length, 'assignment') + ')?')) return;
      state = data; normalise(); save(); go('home'); toast('Backup restored.');
    }),
    'import-rules': (el) => readJsonFile(el, (data) => {
      if (!data || !data.rules) return toast('This file does not contain rule settings.', true);
      changeSettings((a) => { a.settings = E.normaliseSettings(data); }, 'Rule settings loaded into ' + asg(ui.assignmentId).short + '.');
    }),
    'course-field': (el) => { const c = course(el.dataset.cid); c[el.dataset.field] = el.value.trim(); save(); renderSidebar(); renderCrumbs(); },
    'student-field': (el) => { person(el.dataset.pid)[el.dataset.field] = el.value.trim(); save(); },
    'roster-group': (el) => { const r = course(el.dataset.cid).roster.find((x) => x.studentId === el.dataset.pid); if (r) { r.group = el.value.trim(); save(); } }
  };

  const INPUTS = {
    search: (el) => { ui.search = el.value; renderRows(); },
    'rule-preview': (el) => { const o = el.parentElement.querySelector('output'); if (o) o.textContent = el.value + (el.dataset.suffix || ''); },
    'sb-output': (el) => { ui.sandbox.output = el.value; $('#sandbox-result').innerHTML = sandboxResult(asg(ui.assignmentId).settings); },
    'sb-critique': (el) => { ui.sandbox.critique = el.value; $('#sandbox-result').innerHTML = sandboxResult(asg(ui.assignmentId).settings); },
    'sb-decision': (el) => { ui.sandbox.decision = el.value; $('#sandbox-result').innerHTML = sandboxResult(asg(ui.assignmentId).settings); }
  };

  document.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-nav]');
    if (nav) {
      ev.preventDefault();
      const v = nav.dataset.nav;
      if (v === 'home') { ui.courseId = null; return go('home'); }
      if (v === 'admin') return go('admin', ui.adminTab);
      if (!ui.courseId) ui.courseId = (state.courses[0] || {}).id;
      if (v === 'course') return ui.courseId ? go('course', ui.courseId) : go('home');
      if (!ui.assignmentId) ui.assignmentId = defaultAssignment(ui.courseId);
      return ui.assignmentId ? go(v, ui.assignmentId) : (toast('This course has no assignments yet.'), go('course', ui.courseId));
    }
    const a = ev.target.closest('[data-action]');
    if (a && ACTIONS[a.dataset.action] && !a.disabled) {
      if (a.tagName === 'TR' && ev.target.closest('button, a, input, select, textarea') && ev.target.closest('button, a, input, select, textarea') !== a) return;
      ACTIONS[a.dataset.action](a, ev);
      return;
    }
    if (ui.courseMenu && !ev.target.closest('.course-switcher')) { ui.courseMenu = false; renderSidebar(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { closeModal(); closeSidebar(); if (ui.courseMenu) { ui.courseMenu = false; renderSidebar(); } hideTip(); }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('g[data-action], tr[data-action]')) { ev.preventDefault(); ACTIONS[ev.target.dataset.action](ev.target, ev); }
  });
  document.addEventListener('change', (ev) => { const el = ev.target; if (el.dataset && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el); });
  document.addEventListener('input', (ev) => { const el = ev.target; if (el.dataset && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el); });
  document.addEventListener('toggle', (ev) => { const el = ev.target; if (el.dataset && el.dataset.toggle) ui.open[el.dataset.toggle] = el.open; }, true);
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f || !FORMS[f.dataset.form]) return;
    ev.preventDefault();
    FORMS[f.dataset.form](f, new FormData(f));
  });

  // Keep any running review time if the tab is closed.
  window.addEventListener('beforeunload', () => {
    if (!ui.timer) return;
    const s = sub(ui.timer.subId);
    if (!s) return;
    s.review.seconds += Math.round((Date.now() - ui.timer.start) / 1000);
    ui.timer = null;
    if (mode === 'local') { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
    else fetch('/api/state', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
  });

  load();
})();
