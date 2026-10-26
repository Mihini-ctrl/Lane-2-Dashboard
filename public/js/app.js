/*
 * app.js — the teacher-facing app.
 *
 * Students log in on the same screen (Student tab) and see their own
 * courses, then hand in a file plus their pasted AI chat log.
 *
 * Screens: Login / sign-up, Dashboard (course cards + screening), Assignments
 * (course index), Course (assignments list and student × assignment overview),
 * Review Performance (class overview + by assignment), Marking (one assignment),
 * Submission (the handed-in work, with an optional AI evaluation by Gemini),
 * AI interactions and rubric (rubric marking per step), Adjust Rubrics, Export, Admin.
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
  const SESSION_KEY = 'lane2-session';
  const DEMO_USER = { id: 'u-senil', username: 'minakh', password: 'lane2demo' };
  // The one demo student account: Sofia Reyes, who takes INFOMGMT 399 and INFOSYS 222.
  const DEMO_STUDENT = { id: 'u-student-demo', studentId: 'p23', username: 'srey914', password: 'lane2demo' };
  const FILE_PREFIX = 'lane2-file-';      // files kept in this browser when the server is not running
  const MAX_FILE = 2 * 1024 * 1024;
  const FILE_TYPES = ['.pdf', '.doc', '.docx'];
  // The demo teacher used to be Senil Kayapa. Saved workspaces are renamed on load.
  const DEMO_RENAME = { from: 'Senil Kayapa', name: 'Mina Khoshmehr', first: 'Mina', initials: 'MK', email: 'mina.khoshmehr@example.ac.nz', oldUsername: 'senilka' };
  const API = window.Lane2Api;
  const REMOTE_ENABLED = !!(window.LANE2_CONFIG && window.LANE2_CONFIG.backendEnabled && API);
  const UNIVERSITY_EMAIL_DOMAINS = ['aucklanduni.ac.nz', 'auckland.ac.nz'];

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
  const isUniversityEmail = (email) => {
    const parts = String(email || '').trim().toLowerCase().split('@');
    return parts.length === 2 && !!parts[0] && UNIVERSITY_EMAIL_DOMAINS.includes(parts[1]);
  };
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
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6zM9 12l2 2 4-4"/></svg>'
  };

  const DECISIONS = {
    changed: { label: 'Changed', cls: 'd-changed', tip: 'The student changed the AI output before using it.' },
    not_used: { label: 'Not used', cls: 'd-notused', tip: 'The student decided not to use the AI output.' },
    unchanged: { label: 'Used unchanged', cls: 'd-unchanged', tip: 'The student used the AI output as it was.' },
    unrecorded: { label: 'Not recorded', cls: 'd-unrecorded', tip: 'The student did not say what they did with the output.' }
  };
  const REVIEW = { not_reviewed: 'Not marked', in_progress: 'In progress', reviewed: 'Marked' };
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
  let pendingRemoteReviewId = null;
  let pendingRemoteAssignmentId = null;
  let lastSync = null;
  const statsCache = new Map();

  const ui = {
    view: 'home', courseId: null, assignmentId: null, subId: null, adminTab: 'courses',
    homeFilter: 'all',
    search: '', group: 'all', stage: 'active', onlyFlagged: false, ruleFilter: null, levelFilter: null, decisionFilter: null, sort: 'flags',
    caseChanged: {}, lastImpact: null,
    open: {}, critOpen: {}, critEdit: {}, railCommentEdit: false, addCrit: null, rubricCourse: null, rubricAid: null, versionNote: '', railComment: false, timer: null, exportSub: '', peopleCourse: 'all', courseMenu: false,
    markCourse: 'all', perfCourse: 'all', perfAid: null, perfTab: 'overview', perfFilter: 'active', authTab: 'login', authRole: 'teacher', authError: '',
    stu: null // the student's hand-in draft for one assignment
  };

  function validState(d) { return d && Array.isArray(d.courses) && Array.isArray(d.assignments) && Array.isArray(d.submissions) && Array.isArray(d.students); }

  function normalise() {
    state.teacher = state.teacher || { name: 'Teacher', first: 'there', initials: 'T', role: 'Teaching staff' };
    state.staff = state.staff || [];
    // Demo login. The seeded teacher owns every seeded course; teachers who
    // sign up start with no courses. Prototype only: passwords are plain text.
    state.users = state.users || [];
    if (mode !== 'backend') {
      const R = DEMO_RENAME;
      const rename = (x) => { if (x && x.name === R.from) Object.assign(x, { name: R.name, initials: R.initials }, 'first' in x ? { first: R.first } : {}, x.email ? { email: R.email } : {}); };
      rename(state.teacher); state.staff.forEach(rename); state.users.forEach(rename);
      state.users.forEach((u) => { if (u.username === R.oldUsername) u.username = DEMO_USER.username; });
    }
    if (mode !== 'backend' && !state.users.some((u) => u.username === DEMO_USER.username)) {
      const t = state.teacher;
      const st = state.staff.find((m) => m.name === t.name);
      state.users.unshift({ id: DEMO_USER.id, username: DEMO_USER.username, password: DEMO_USER.password, name: t.name, first: t.first, initials: t.initials, role: t.role, email: t.email || '', courses: st ? st.courses.slice() : state.courses.map((c) => c.id) });
    }
    if (mode !== 'backend' && !state.users.some((u) => u.id === DEMO_STUDENT.id)) {
      const p = state.students.find((x) => x.id === DEMO_STUDENT.studentId);
      if (p) state.users.push({ id: DEMO_STUDENT.id, type: 'student', studentId: p.id, username: DEMO_STUDENT.username, password: DEMO_STUDENT.password, name: fullName(p), first: p.firstName, initials: initials(p), role: 'Student', email: p.email || '', courses: [] });
    }
    state.users.forEach((u) => { u.courses = (u.courses || []).filter((id) => state.courses.some((c) => c.id === id)); });
    state.courses.forEach((c) => { c.roster = c.roster || []; });
    state.assignments.forEach((a) => {
      a.settings = E.normaliseSettings(a.settings);
      a.rubric = a.rubric || [];
      a.marking = a.marking || [];
      a.markingBands = E.normaliseBands(a.markingBands);
      a.rubric.forEach((criterion) => { criterion.maxScore = Math.max(1, Number(criterion.maxScore) || 10); });
    });
    state.submissions.forEach((s) => {
      s.interactions = s.interactions || [];
      s.sources = s.sources || [];
      s.review = Object.assign({ status: 'not_reviewed', decision: null, comment: '', marks: {}, scores: {}, seconds: 0, content: {}, feedback: '' }, s.review);
      s.review.marks = s.review.marks || {};
      s.review.scores = s.review.scores || {};
    });
  }

  function blankRemoteState() {
    return { version: 4, teacher: { name: 'Teacher', first: 'there', initials: 'T', role: 'Teaching staff' }, staff: [], users: [], courses: [], assignments: [], submissions: [], students: [], drafts: [] };
  }

  async function loadRemoteWorkspace() {
    const result = await API.get('/bootstrap');
    if (!validState(result.state)) throw new Error('The backend returned an invalid workspace.');
    state = result.state;
    mode = 'backend';
    normalise();
    setSession(result.user.id);
    lastSync = new Date();
    return result.user;
  }

  function assignmentPayload(a) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return {
      courseId: a.courseId,
      title: a.title,
      short: a.short,
      description: a.description || '',
      dueDate: a.dueDate || null,
      wordLimit: Number(a.wordLimit) || 0,
      lane: Number(a.lane) || 2,
      settings: Object.assign({}, a.settings || {}, { rubricVersions: a.rubricVersions || [] }),
      rubric: (a.rubric || []).map((criterion) => Object.assign({
        type: criterion.type,
        description: criterion.description || '',
        maxScore: Number(criterion.maxScore) || 10
      }, uuid.test(criterion.id || '') ? { id: criterion.id } : {}, criterion.type === 'rule' ? { ruleKey: criterion.ruleKey } : { name: criterion.name }))
    };
  }

  async function remoteMutation(task, after) {
    saving = true;
    setSync('Saving…');
    try {
      const result = await task();
      await loadRemoteWorkspace();
      statsCache.clear();
      saving = false;
      setSync();
      if (after) after(result);
      else render();
      return result;
    } catch (e) {
      saving = false;
      setSync('Not saved: ' + e.message, true);
      toast(e.message, true);
      return null;
    }
  }

  async function load() {
    if (REMOTE_ENABLED) {
      mode = 'backend';
      state = blankRemoteState();
      if (API.hasSession()) {
        try { await loadRemoteWorkspace(); }
        catch (e) { API.logout(); setSession(null); ui.authError = e.message; }
      } else normalise();
      if (/[?&]embed=1/.test(location.search)) document.body.classList.add('embed');
      if (me()) route(); else renderAuth();
      setSync();
      setInterval(poll, 15000);
      return;
    }
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
    if (me()) route(); else renderAuth();
    setSync();
    if (mode === 'server') setInterval(poll, 15000);
  }

  function save() {
    statsCache.clear();
    if (mode === 'backend' && ui.view === 'review' && ui.subId) pendingRemoteReviewId = ui.subId;
    if (mode === 'backend' && isRulesView(ui.view) && (ui.rubricAid || ui.assignmentId)) pendingRemoteAssignmentId = ui.rubricAid || ui.assignmentId;
    if (mode === 'backend' && !pendingRemoteReviewId && !pendingRemoteAssignmentId) {
      setSync('Not saved: this change is not connected to the backend yet.', true);
      return;
    }
    clearTimeout(saveTimer);
    saving = true;
    setSync('Saving…');
    saveTimer = setTimeout(persist, 350);
  }

  async function persist() {
    try {
      if (mode === 'backend') {
        const reviewId = pendingRemoteReviewId;
        const assignmentId = pendingRemoteAssignmentId;
        pendingRemoteReviewId = null;
        pendingRemoteAssignmentId = null;
        if (reviewId) {
          const submission = sub(reviewId);
          if (!submission) throw new Error('The review no longer exists.');
          const marks = [];
          Object.entries(submission.review.marks || {}).forEach(([interactionId, byCriterion]) => {
            Object.entries(byCriterion || {}).forEach(([criterionId, item]) => {
              marks.push({ interactionId, criterionId, mark: item.mark || null, comment: item.comment || '' });
            });
          });
          const payload = {
            status: submission.review.status,
            decision: submission.review.decision,
            comment: submission.review.comment || '',
            secondsSpent: submission.review.seconds || 0,
            marks,
            scores: Object.entries(submission.review.scores || {}).map(([criterionId, item]) => ({
              criterionId,
              score: item.score == null || item.score === '' ? null : Number(item.score),
              comment: item.comment || ''
            }))
          };
          if (submission.review.updatedAt) payload.expectedUpdatedAt = submission.review.updatedAt;
          const saved = await API.put('/submissions/' + reviewId + '/review', payload);
          submission.review.id = saved.review.id;
          submission.review.updatedAt = saved.review.updated_at;
        }
        if (assignmentId) {
          const assignment = asg(assignmentId);
          if (!assignment) throw new Error('The assignment no longer exists.');
          await API.put('/assignments/' + assignmentId, assignmentPayload(assignment));
          await loadRemoteWorkspace();
          statsCache.clear();
          render();
        }
      } else if (mode === 'server') {
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
      return true;
    } catch (e) {
      saving = false;
      setSync('Not saved: ' + e.message, true);
      return false;
    }
  }

  // Live view: pick up changes saved by another marker or browser tab.
  async function poll() {
    if (saving || ui.timer || !me() || $('#modalRoot').children.length || Object.keys(aiJobs).length || Object.keys(reading).length) return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    try {
      if (mode === 'backend') {
        const before = state.updatedAt;
        await loadRemoteWorkspace();
        if (state.updatedAt !== before) { statsCache.clear(); render(); }
        setSync();
        return;
      }
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const fresh = await r.json();
      lastSync = new Date();
      if (validState(fresh) && fresh.updatedAt && fresh.updatedAt !== state.updatedAt) {
        state = fresh;
        normalise();
        statsCache.clear();
        if (me()) render(); else renderAuth();
      }
      setSync();
    } catch (e) { setSync('Server not reachable. Changes will not be saved.', true); }
  }

  function setSync(msg, bad) {
    const el = $('#sync');
    if (!el) return;
    const where = mode === 'backend' ? 'Connected to secure backend' : mode === 'server' ? 'Saved to data/db.json' : 'Saved in this browser only';
    el.textContent = msg || (where + (lastSync ? ' · ' + lastSync.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }) : ''));
    $('#syncDot').classList.toggle('bad', !!bad);
  }

  /* ------------------------------------------------------------------ */
  /* Session (prototype login: the signed-in user id lives in the browser) */
  /* ------------------------------------------------------------------ */
  let sessionId = null;
  try { sessionId = localStorage.getItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
  function me() { return state && sessionId ? state.users.find((u) => u.id === sessionId) || null : null; }
  const isStudent = () => { const u = me(); return !!u && u.type === 'student'; };

  // Each teacher's view preferences (side panel width, level descriptions), kept in this browser.
  const RAIL_DEFAULT = 330, RAIL_MIN = 300, RAIL_WIDE = 640;
  function prefs() {
    const u = me(); if (!u) return {};
    try { return JSON.parse(localStorage.getItem('lane2-prefs-' + u.id)) || {}; } catch (e) { return {}; }
  }
  function setPref(key, value) {
    const u = me(); if (!u) return;
    const p = prefs(); p[key] = value;
    try { localStorage.setItem('lane2-prefs-' + u.id, JSON.stringify(p)); } catch (e) { /* storage blocked */ }
  }
  const railWidth = () => Math.max(RAIL_MIN, Number(prefs().railWidth) || RAIL_DEFAULT);
  const STUDENT_VIEWS = ['student', 'scourse', 'sasg'];
  function setSession(id) {
    sessionId = id;
    try { if (id) localStorage.setItem(SESSION_KEY, id); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
  }

  /* ------------------------------------------------------------------ */
  /* Lookups and derived numbers                                         */
  /* ------------------------------------------------------------------ */
  // Everything the teacher sees is limited to the courses they teach.
  const owns = (cid) => { const u = me(); return !!u && u.courses.includes(cid); };
  const myCourses = () => state.courses.filter((c) => owns(c.id));
  const myAssignments = () => state.assignments.filter((a) => owns(a.courseId));
  const myStudents = () => { const u = me(); const ids = new Set(); myCourses().forEach((c) => c.roster.forEach((r) => ids.add(r.studentId))); return state.students.filter((p) => ids.has(p.id) || (u && p.createdBy === u.id)); };
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
  const isRulesView = (v) => v === 'rules' || v === 'detect';
  const VIEWS = { detect: viewRules, student: viewStudentHome, scourse: viewStudentCourse, sasg: viewStudentAssignment, home: viewHome, courses: viewCourses, course: viewCourse, reviews: viewPerformance, newasg: viewNewAssignment, marking: viewMarking, assignment: viewAssignment, submission: viewSubmission, mrubric: viewMarkingRubric, review: viewReview, rules: viewRules, export: viewExport, admin: viewAdmin };

  function setContext(view, id) {
    const prevView = ui.view;
    ui.view = view;
    const a = asg(id); const s = sub(id);
    if (STUDENT_VIEWS.includes(view)) return setStudentContext(view, id);
    if (view === 'courses') {
      // Index of every course the teacher teaches; nothing is pre-selected.
    } else if (view === 'marking') {
      ui.markCourse = id === 'all' || owns(id) ? id : (owns(ui.courseId) ? ui.courseId : 'all');
    } else if (view === 'newasg') {
      // New assignment: an id continues that draft; otherwise keep (or start) the one being written.
      const d = id && myDrafts().find((x) => x.id === id);
      if (d && !(ui.wiz && ui.wiz.draftId === id)) ui.wiz = { draftId: d.id, step: d.step || 1, error: '', adding: false, calMonth: (d.data.dueDate || ymd(new Date())).slice(0, 7), data: clone(d.data) };
      else if (!ui.wiz) ui.wiz = newWizard();
    } else if (view === 'reviews') {
      // Review Performance: an assignment id opens "By assignment"; a course id or 'all' opens "Class overview".
      if (a && owns(a.courseId)) { ui.perfTab = 'assignment'; ui.perfAid = id; ui.perfCourse = a.courseId; }
      else { ui.perfTab = 'overview'; ui.perfCourse = id === 'all' || owns(id) ? id : (owns(ui.courseId) ? ui.courseId : 'all'); }
    } else if (view === 'course' && owns(id)) {
      ui.courseId = id;
      if (!ui.assignmentId || !asg(ui.assignmentId) || asg(ui.assignmentId).courseId !== id) ui.assignmentId = defaultAssignment(id);
    } else if (isRulesView(view)) {
      // Adjust Rubrics: no id = choose a class; a course id = choose its assignment; an assignment id = its rubric.
      if (a && owns(a.courseId)) { if (ui.assignmentId !== id) resetFilters(); ui.assignmentId = id; ui.courseId = a.courseId; ui.rubricCourse = a.courseId; ui.rubricAid = id; if (ensureVersions(a)) save(); }
      else if (owns(id)) { ui.rubricCourse = id; ui.rubricAid = null; }
      else { ui.rubricCourse = null; ui.rubricAid = null; }
    } else if (['assignment', 'export'].includes(view) && a && owns(a.courseId)) {
      if (ui.assignmentId !== id) resetFilters();
      ui.assignmentId = id; ui.courseId = a.courseId;
    } else if ((view === 'review' || view === 'submission') && s && asg(s.assignmentId) && owns(asg(s.assignmentId).courseId)) {
      if (ui.subId !== id) { ui.evSel = null; ui.evStep = null; ui.mrComment = {}; }
      // Every submission opens with AI evaluation off; it only stays on when coming back from its AI interactions page.
      if (view === 'submission' && (ui.subId !== id || !['submission', 'review'].includes(prevView))) { ui.aiOn = false; ui.evSel = null; ui.evStep = null; }
      ui.subId = id; ui.assignmentId = s.assignmentId; ui.courseId = asg(ui.assignmentId).courseId;
    } else if (view === 'mrubric' && a && owns(a.courseId)) {
      ui.assignmentId = id; ui.courseId = a.courseId; ui.rubricCourse = a.courseId; ui.rubricAid = id;
      if (!ui.mrEdit || ui.mrEdit.aid !== id) ui.mrEdit = { aid: id, list: clone(a.marking || []), bands: clone(E.normaliseBands(a.markingBands)), error: '' };
    } else if (view === 'admin') {
      ui.adminTab = ['courses', 'assignments', 'people', 'canvas'].includes(id) ? id : ui.adminTab;
    } else if (view !== 'home') {
      ui.view = 'home';
    }
  }
  function resetFilters() { Object.assign(ui, { search: '', group: 'all', stage: 'active', onlyFlagged: false, ruleFilter: null, levelFilter: null, decisionFilter: null, caseChanged: {}, lastImpact: null }); }

  function hashFor() {
    const id = { scourse: ui.courseId, sasg: ui.assignmentId, course: ui.courseId, reviews: ui.perfTab === 'assignment' ? ui.perfAid : ui.perfCourse, newasg: ui.wiz && ui.wiz.draftId, marking: ui.markCourse, assignment: ui.assignmentId, rules: ui.rubricAid || ui.rubricCourse, detect: ui.rubricAid || ui.rubricCourse, export: ui.assignmentId, mrubric: ui.assignmentId, submission: ui.subId, review: ui.subId, admin: ui.adminTab }[ui.view];
    return '#' + ui.view + (id ? '/' + id : '');
  }

  function go(view, id) {
    if (!confirmLeaveRubric(view, id)) return;
    if (!confirmLeaveUnsaved(view, id)) return;
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
    if (!me()) return renderAuth();
    const [view, id] = location.hash.replace('#', '').split('/');
    if (!confirmLeaveRubric(view, id) || !confirmLeaveUnsaved(view, id)) { history.pushState(null, '', hashFor()); return; }
    let target = VIEWS[view] ? view : 'home';
    // Students only see the student pages, and teachers only see theirs.
    if (isStudent() !== STUDENT_VIEWS.includes(target)) target = isStudent() ? 'student' : 'home';
    setContext(target, id);
    render();
  }
  window.addEventListener('popstate', route);
  window.addEventListener('beforeunload', (ev) => { if (me() && isRulesView(ui.view) && pendingChanges(asg(ui.rubricAid)).length) { ev.preventDefault(); ev.returnValue = ''; } });

  function render() {
    if (!me()) return renderAuth();
    document.body.classList.remove('signed-out');
    document.body.classList.toggle('is-student', isStudent());
    $('#authRoot').innerHTML = '';
    statsCache.clear();
    renderSidebar();
    renderCrumbs();
    // The submission page's side panel scrolls on its own: keep its place when the page is redrawn.
    const rail = ui.view === 'submission' && $('.sub-layout .review-rail');
    const railKeep = rail ? { key: ui.subId + '|' + ui.aiOn, top: rail.scrollTop } : null;
    $('#main').innerHTML = '<div class="page active view-' + ui.view + '">' + VIEWS[ui.view]() + '</div>';
    if (railKeep && ui.view === 'submission' && railKeep.key === ui.subId + '|' + ui.aiOn) { const r = $('.sub-layout .review-rail'); if (r) r.scrollTop = railKeep.top; }
    if (ui.view === 'assignment') renderRows();
    if (ui.view === 'submission') afterSubmissionRender();
    if (ui.view === 'review' && ui.jumpTo) {
      const id = ui.jumpTo; ui.jumpTo = null;
      setTimeout(() => { const el = document.getElementById('step-' + id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 1400); } }, 80);
    }
    updateTimer();
    hideTip();
  }

  /* ------------------------------------------------------------------ */
  /* Sidebar, course menu and breadcrumbs                                */
  /* ------------------------------------------------------------------ */
  function renderSidebar() {
    if (isStudent()) return renderStudentSidebar();
    const c = course(ui.courseId);
    $('#courseBadge').textContent = c ? c.badge : '··';
    $('#courseCode').textContent = c ? c.code : 'All courses';
    $('#courseSemester').textContent = c ? c.name : (myCourses().length ? 'Choose a course' : 'No courses yet');
    $('#courseButton').setAttribute('aria-expanded', String(ui.courseMenu));
    const menu = $('#courseMenu');
    menu.hidden = !ui.courseMenu;
    menu.innerHTML = '<button type="button" role="option" class="course-option' + (!c && ui.view === 'home' ? ' on' : '') + '" data-action="pick-course" data-id=""><span class="course-code small">★</span><span><strong>All courses</strong><small>Overview and screening</small></span></button>' +
      myCourses().map((x) => {
        const cs = courseStats(x.id);
        return '<button type="button" role="option" class="course-option' + (c && c.id === x.id ? ' on' : '') + '" data-action="pick-course" data-id="' + x.id + '"><span class="course-code small">' + esc(x.badge) + '</span><span><strong>' + esc(x.code) + '</strong><small>' + esc(x.name) + '</small></span>' + (cs.needs ? '<span class="nav-count"' + tip(cs.needs + ' flagged submissions waiting for your review') + '>' + cs.needs + '</span>' : '') + '</button>';
      }).join('') +
      (myCourses().length ? '' : '<button type="button" class="course-option" data-action="new-course"><span class="course-code small">+</span><span><strong>Add a course</strong><small>Set up your first class</small></span></button>');
    const active = { detect: 'rules', mrubric: 'rules', review: 'marking', submission: 'marking', assignment: 'marking', course: 'courses', newasg: 'courses', export: 'admin' }[ui.view] || ui.view;
    $$('.nav-item, .nav-subitem[data-nav]').forEach((n) => {
      const on = n.dataset.nav === active;
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    // Marking badge: handed-in submissions still to mark, the same number as the Marking page's class tabs.
    const count = myAssignments().reduce((n, x) => n + stats(x).toReview, 0);
    const badge = $('#navReviewCount');
    badge.hidden = !count;
    badge.textContent = count;
    badge.title = count + ' handed-in submissions still to mark across your courses';
    const u = me();
    $('#profileInitials').textContent = u.initials;
    $('#profileName').textContent = u.name;
    $('#profileRole').textContent = u.role;
  }

  function renderCrumbs() {
    if (isStudent()) return renderStudentCrumbs();
    const parts = [['home', '', 'Dashboard']];
    const c = course(ui.courseId);
    const a = asg(ui.assignmentId);
    if (ui.view === 'admin') parts.push(['admin', ui.adminTab, 'Admin']);
    else if (ui.view === 'export') { parts.push(['admin', ui.adminTab, 'Admin']); if (a) parts.push(['export', a.id, 'Export · ' + a.short]); }
    else if (ui.view === 'courses') parts.push(['courses', '', 'Assignments']);
    else if (ui.view === 'marking') parts.push(['marking', ui.markCourse, 'Marking']);
    else if ((ui.view === 'assignment' || ui.view === 'review' || ui.view === 'submission') && a && c) {
      parts.push(['marking', c.id, 'Marking']);
      parts.push(['assignment', a.id, c.code + ' · ' + a.short]);
      if (ui.view !== 'assignment' && sub(ui.subId)) parts.push(['submission', ui.subId, subName(sub(ui.subId))]);
      if (ui.view === 'review' && sub(ui.subId)) parts.push(['review', ui.subId, 'AI interactions and rubric']);
    }
    else if (ui.view === 'newasg') { parts.push(['courses', '', 'Assignments']); parts.push(['newasg', ui.wiz && ui.wiz.draftId || '', ui.wiz && ui.wiz.draftId ? 'Continue draft' : 'New assignment']); }
    else if (ui.view === 'reviews') {
      parts.push(['reviews', ui.perfCourse, 'Review Performance']);
      if (ui.perfTab === 'assignment' && asg(ui.perfAid)) parts.push(['reviews', ui.perfAid, course(asg(ui.perfAid).courseId).code + ' · ' + asg(ui.perfAid).short]);
    }
    else if (ui.view === 'mrubric' && a && c) {
      parts.push(['rules', '', 'Adjust Rubrics']);
      parts.push(['rules', c.id, c.code]);
      parts.push(['mrubric', a.id, a.short + ' · Grading rubric']);
    }
    else if (isRulesView(ui.view)) {
      parts.push(['rules', '', 'Adjust Rubrics']);
      if (course(ui.rubricCourse)) parts.push(['rules', ui.rubricCourse, course(ui.rubricCourse).code]);
      if (asg(ui.rubricAid)) parts.push(['rules', ui.rubricAid, asg(ui.rubricAid).short]);
    }
    else if (ui.view !== 'home' && c) {
      parts.push(['course', c.id, c.code]);
      if (ui.view !== 'course' && a) parts.push(['assignment', a.id, a.short]);
      if (ui.view === 'review' && sub(ui.subId)) parts.push(['review', ui.subId, subName(sub(ui.subId))]);
    }
    $('#crumbs').innerHTML = parts.map((p, i) => i === parts.length - 1
      ? '<span aria-current="page">' + esc(p[2]) + '</span>'
      : '<button type="button" class="crumb" data-action="go" data-view="' + p[0] + '" data-id="' + esc(p[1]) + '">' + esc(p[2]) + '</button><span class="crumb-sep" aria-hidden="true">›</span>').join('');
  }

  /* ------------------------------------------------------------------ */
  /* Login and sign-up (Supabase in backend mode; prototype fallback otherwise) */
  /* ------------------------------------------------------------------ */
  function renderAuth() {
    document.body.classList.add('signed-out');
    $('#main').innerHTML = '';
    const student = ui.authRole === 'student';
    const login = student || ui.authTab === 'login';
    const err = ui.authError ? '<p class="auth-error" role="alert">' + esc(ui.authError) + '</p>' : '';
    const roleSwitch = '<div class="filter-group role-switch" role="tablist" aria-label="Log in as">' + [['teacher', 'Teacher'], ['student', 'Student']].map(([k, l]) =>
      '<button type="button" role="tab" aria-selected="' + (ui.authRole === k) + '" class="filter-button' + (ui.authRole === k ? ' active' : '') + '" data-action="auth-role" data-role="' + k + '">' + l + '</button>').join('') + '</div>';
    const form = student
      ? (REMOTE_ENABLED
        ? '<p class="auth-note">Student log-in works in the prototype only for now. Run Trace without the secure backend to try it.</p>'
        : '<form data-form="login" class="auth-form"><input type="hidden" name="role" value="student">' +
          '<label>Username<input name="username" required autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="Your UPI, e.g. abcd123"></label>' +
          '<label>Password<input name="password" type="password" required autocomplete="current-password"></label>' + err +
          '<button type="submit" class="primary-button full-width">Log in</button>' +
          '<div class="demo-creds">' + ICON.info + '<div><strong>Demo student account</strong><span>Username <code>' + DEMO_STUDENT.username + '</code> · Password <code>' + DEMO_STUDENT.password + '</code></span><button type="button" class="text-button" data-action="fill-demo" data-role="student">Use demo account</button></div></div>' +
        '</form>')
      : login
      ? '<form data-form="login" class="auth-form">' +
          '<label>' + (REMOTE_ENABLED ? 'University email' : 'Username') + '<input name="' + (REMOTE_ENABLED ? 'email' : 'username') + '"' + (REMOTE_ENABLED ? ' type="email" placeholder="name@auckland.ac.nz"' : '') + ' required autocomplete="username" autocapitalize="off" spellcheck="false"></label>' +
          '<label>Password<input name="password" type="password" required autocomplete="current-password"></label>' + err +
          '<button type="submit" class="primary-button full-width">Log in</button>' +
          (REMOTE_ENABLED ? '' : '<div class="demo-creds">' + ICON.info + '<div><strong>Demo account</strong><span>Username <code>' + DEMO_USER.username + '</code> · Password <code>' + DEMO_USER.password + '</code></span><button type="button" class="text-button" data-action="fill-demo">Use demo account</button></div></div>') +
        '</form>'
      : '<form data-form="signup" class="auth-form">' +
          '<div class="form-grid"><label>First name<input name="first" required autocomplete="given-name"></label><label>Last name<input name="last" required autocomplete="family-name"></label></div>' +
          '<label>University email<input name="email" type="email" required autocomplete="email" placeholder="UPI@aucklanduni.ac.nz"><small class="auth-help">Use @aucklanduni.ac.nz for students or @auckland.ac.nz for staff.</small></label>' +
          '<label>Role<select name="role">' + (REMOTE_ENABLED ? [['lecturer', 'Lecturer'], ['coordinator', 'Course coordinator'], ['course_admin', 'Course administrator'], ['teaching_assistant', 'Tutor'], ['marker', 'Marker']].map((r) => '<option value="' + r[0] + '">' + r[1] + '</option>') : ['Lecturer', 'Course coordinator', 'Course administrator', 'Tutor', 'Marker'].map((r) => '<option>' + r + '</option>')).join('') + '</select></label>' +
          (REMOTE_ENABLED ? '' : '<label>Username<input name="username" required minlength="3" maxlength="30" autocomplete="username" autocapitalize="off" spellcheck="false"></label>') +
          '<label>Password<input name="password" type="password" required minlength="' + (REMOTE_ENABLED ? '8' : '6') + '" autocomplete="new-password"></label>' + err +
          '<button type="submit" class="primary-button full-width">Create account</button>' +
          '<p class="auth-note">We will email you a confirmation link before you can log in. Your workspace starts empty.</p>' +
        '</form>';
    $('#authRoot').innerHTML = '<div class="auth-screen">' +
      '<div class="auth-brand"><img class="brand-logo" src="img/logo.png" alt=""><div><strong>Trace</strong></div></div>' +
      '<div class="auth-card panel">' + roleSwitch +
        '<h1>' + (login ? 'Welcome back' : 'Create your teacher account') + '</h1>' +
        '<p class="auth-sub">' + (student ? 'Log in to see your courses and hand in your work.' : login ? 'Log in to see the courses you teach.' : 'For teaching staff setting up Trace for the first time.') + '</p>' +
        (student ? '' : '<div class="filter-group auth-tabs" role="tablist"><button type="button" role="tab" aria-selected="' + login + '" class="filter-button' + (login ? ' active' : '') + '" data-action="auth-tab" data-tab="login">Log in</button><button type="button" role="tab" aria-selected="' + !login + '" class="filter-button' + (!login ? ' active' : '') + '" data-action="auth-tab" data-tab="signup">Sign up</button></div>') +
        form +
      '</div>' +
      '<p class="disclaimer">' + (REMOTE_ENABLED ? 'Secure sign-in is handled by Supabase Auth. Only use approved data in an authorised environment.' : 'Prototype login for demonstrations only. Passwords are stored in plain text, so use made-up details and synthetic data only.') + '</p>' +
    '</div>';
    const f = $('#authRoot input'); if (f) f.focus();
  }

  function signIn(u) {
    setSession(u.id);
    ui.authError = '';
    Object.assign(ui, { courseId: null, assignmentId: null, subId: null, perfCourse: 'all', perfFilter: 'active', peopleCourse: 'all', homeFilter: 'all' });
    resetFilters();
    ui.stu = null;
    history.replaceState(null, '', u.type === 'student' ? '#student' : '#home');
    route();
    setSync();
  }

  /* ------------------------------------------------------------------ */
  /* Small display pieces                                                */
  /* ------------------------------------------------------------------ */
  function heading(eyebrow, title, sub, actions) {
    return '<div class="page-heading"><div>' + (title ? '<h1>' + title + '</h1>' : '') + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="heading-actions">' + actions + '</div>' : '') + '</div>';
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
    return myCourses().map((c) => '<optgroup label="' + esc(c.code) + '">' + courseAssignments(c.id).map((a) =>
      '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.short + ': ' + trunc(a.title.replace(/^[^:]*:\s*/, ''), 48)) + '</option>').join('') + '</optgroup>').join('');
  }
  function emptyState(text, action) { return '<div class="empty-state">' + ICON.info + '<p>' + text + '</p>' + (action || '') + '</div>'; }

  /* ---- charts (plain SVG, no libraries) ---- */
  function decisionChart(dec, interactive) {
    const total = Object.values(dec).reduce((a, b) => a + b, 0) || 1;
    const keys = ['changed', 'not_used', 'unchanged', 'unrecorded'];
    const segs = keys.filter((k) => dec[k] > 0).map((k) => interactive === false
      ? '<span class="hseg static ' + DECISIONS[k].cls + '" style="flex:' + dec[k] + '"' + tip(DECISIONS[k].label + ': ' + dec[k] + ' steps (' + Math.round(dec[k] / total * 100) + '%)') + '></span>'
      : '<button type="button" class="hseg ' + DECISIONS[k].cls + (ui.decisionFilter === k ? ' on' : '') + '" style="flex:' + dec[k] + '" data-action="filter-decision" data-key="' + k + '"' + tip(DECISIONS[k].label + ': ' + dec[k] + ' steps (' + Math.round(dec[k] / total * 100) + '%). Click to show students with at least one.') + '><span class="sr">' + DECISIONS[k].label + '</span></button>').join('');
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

  function viewHome() {
    const mine = myCourses();
    if (!mine.length) return firstRun();
    const all = myAssignments().map((a) => ({ a, st: stats(a) }));
    const cards = mine.map(courseCard).join('');

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
    }).join('') || emptyState(all.length ? 'No assignments match this filter.' : 'None of your courses have assignments yet.');

    return '<section class="section-block"><div class="section-title"><h2>Your courses</h2></div><div class="course-grid">' + cards + '</div></section>' +
      '<section class="panel">' +
        '<div class="panel-header"><div><div class="title-row"><h2>Screening: every assignment</h2><span class="pill count-pill">' + rows.length + '</span></div><p>All classes and their assignments in one list, most urgent first.</p></div>' +
        '<div class="filter-group">' + filters.map(([k, l]) => '<button type="button" class="filter-button' + (ui.homeFilter === k ? ' active' : '') + '" data-action="home-filter" data-filter="' + k + '">' + l + '</button>').join('') + '</div></div>' +
        '<div class="screen-list">' + table + '</div>' +
        '<div class="panel-footer"><span class="legend-inline"><span class="key stage-in"></span>Handed in <span class="key stage-logs"></span>AI log attached <span class="key stage-none"></span>Not started</span><span>Students attach their AI log before they hand in.</span></div>' +
      '</section>' +
      '<p class="disclaimer">Synthetic data only. Flags ask a marker to look closer. They are not evidence of misconduct, and the final judgement is always yours.</p>';
  }

  /** Per-course numbers shown on the dashboard cards and the Assignments index. */
  function courseNumbers(c) {
    const list = courseAssignments(c.id);
    const cs = courseStats(c.id);
    const open = list.filter(isOpen);
    const expected = list.reduce((n, a) => n + stats(a).enrolled, 0);
    return { list, cs, open, expected };
  }

  function courseCard(c) {
    const { list, cs, open, expected } = courseNumbers(c);
    const stat = (value, label, sub, t, cls) => '<span class="cc-stat' + (cls ? ' ' + cls : '') + '"' + tip(t) + '><b>' + value + '</b><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>';
    return '<button type="button" class="course-card" data-action="go" data-view="course" data-id="' + c.id + '"' + tip('Open ' + c.code + ' to see its assignments and students') + '>' +
      '<span class="cc-top"><span class="course-code big">' + esc(c.badge) + '</span>' + (cs.needs ? '<span class="pill count-pill">' + cs.needs + ' to review</span>' : '<span class="pill ok-pill">Up to date</span>') + '</span>' +
      '<strong>' + esc(c.code) + '</strong><span class="cc-name">' + esc(c.name) + '</span>' +
      '<span class="cc-grid">' +
        stat(open.length, 'Open assignments', 'of ' + list.length + ' in total', 'Assignments whose due date has not passed. Students can still attach AI logs and hand in.') +
        stat(cs.flagged, 'Flagged', cs.needs ? cs.needs + ' waiting for you' : 'none waiting', 'Students flagged by the rules across this course\'s assignments. Flags are prompts to look closer, not misconduct findings.', cs.flagged ? 'warn' : '') +
        stat(cs.handed, 'Submissions received', 'of ' + expected + ' expected', 'Handed-in submissions across every assignment in this course.', 'received') +
        // Replaces the student count: how many of this class's assignments still have marking to do.
        stat(list.filter((x) => stats(x).toReview > 0).length, 'Assignments to mark', cs.toReview ? plural(cs.toReview, 'submission') + ' left' : 'all marked', 'Assignments in this course with handed-in submissions that still need your decision.', list.some((x) => stats(x).toReview > 0) ? 'tomark' : '') +
      '</span>' +
      '<span class="meter teal"><i style="width:' + (cs.handed ? cs.reviewed / cs.handed * 100 : 0) + '%"></i></span>' +
      '<small>' + cs.reviewed + ' of ' + cs.handed + ' handed-in submissions reviewed</small>' +
      '<small class="cc-next">' + (open[0] ? 'Next due: ' + esc(open[0].short) + ' · ' + fmtDay(open[0].dueDate) : 'No open assignments') + '</small></button>';
  }

  /** What a teacher sees before they have any courses (e.g. right after sign-up). */
  function firstRun() {
    const step = (n, title, text) => '<li><span class="timeline-num">' + n + '</span><div><strong>' + title + '</strong><p>' + text + '</p></div></li>';
    return heading('WELCOME TO LANE2', '', 'Your workspace is empty. Set up the courses you teach to get started.',
      '<button type="button" class="primary-button" data-action="new-course">' + ICON.plus + 'Create your first course</button>') +
      '<section class="panel first-run">' +
        '<div class="panel-header"><div><h2>Three steps to your first review</h2><p>Everything you add here is visible only to you.</p></div></div>' +
        '<ol class="first-steps">' +
          step(1, 'Add a course', 'Give it a code, name and semester. It appears on this page and in the course drop-down.') +
          step(2, 'Enrol students', 'Add students in Admin → People. Each gets an empty submission for every assignment.') +
          step(3, 'Set an assignment', 'Choose its due date, rubric criteria and how strict the flag rules are. Students attach their AI logs before they hand in.') +
        '</ol>' +
        '<div class="panel-footer"><span>You can change any of this later in Admin.</span><button type="button" class="primary-button small" data-action="new-course">' + ICON.plus + 'Add a course</button></div>' +
      '</section>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Assignments index (every course the teacher teaches)          */
  /* ------------------------------------------------------------------ */
  /* View: New assignment (two pages: details + due date, then rubric)   */
  /* ------------------------------------------------------------------ */
  const DEFAULT_RUBRIC_RULES = ['unchangedNoCheck', 'belowLevel'];
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const myDrafts = () => (state.drafts || []).filter((d) => me() && d.owner === me().id && (!d.data.courseId || owns(d.data.courseId)));

  function newWizard(courseId) {
    const cid = (owns(courseId) && courseId) || (owns(ui.courseId) && ui.courseId) || (myCourses()[0] || {}).id;
    return { draftId: null, step: 1, error: '', adding: false, calMonth: ymd(new Date()).slice(0, 7),
      data: { courseId: cid, title: '', short: '', dueDate: '', wordLimit: '', description: 'AI use is permitted (Lane 2). Attach your AI conversation before you hand in.', preset: 'standard', rules: DEFAULT_RUBRIC_RULES.slice(), customs: [], marking: [], bands: Object.assign({}, E.MARK_BANDS) } };
  }

  /** A large month calendar for the due date: whole-day buttons, so it is hard to miss. */
  function dueCalendar(w) {
    const [y, m] = w.calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7;            // Monday first
    const days = new Date(y, m, 0).getDate();
    const today = ymd(new Date());
    const cells = [];
    for (let k = 0; k < lead; k++) cells.push('<span class="cal-blank"></span>');
    for (let d = 1; d <= days; d++) {
      const v = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const cls = (v === w.data.dueDate ? ' picked' : '') + (v === today ? ' today' : '') + (v < today ? ' past' : '');
      cells.push('<button type="button" class="cal-day' + cls + '" data-action="wiz-date" data-date="' + v + '" aria-pressed="' + (v === w.data.dueDate) + '" aria-label="' + esc(fmtDay(v)) + '">' + d + '</button>');
    }
    return '<div class="calendar" role="group" aria-label="Due date">' +
      '<div class="cal-head"><button type="button" class="icon-button" data-action="wiz-cal" data-step="-1" aria-label="Previous month">‹</button><strong>' + first.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }) + '</strong><button type="button" class="icon-button" data-action="wiz-cal" data-step="1" aria-label="Next month">›</button></div>' +
      '<div class="cal-grid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => '<span class="cal-dow">' + x + '</span>').join('') + cells.join('') + '</div>' +
      '</div>';
  }

  function viewNewAssignment() {
    if (!myCourses().length) return emptyState('Add a course first, then set its assignments.', '<button type="button" class="primary-button" data-action="new-course">' + ICON.plus + 'Add a course</button>');
    if (!ui.wiz) ui.wiz = newWizard();
    const w = ui.wiz; const d = w.data;
    d.marking = d.marking || []; // drafts saved before the grading rubric existed
    d.bands = d.bands || Object.assign({}, E.MARK_BANDS);
    const stepper = '<ol class="rubric-steps wiz-steps" aria-label="Steps">' +
      [[1, 'Step 1', 'Details and due date'], [2, 'Step 2', 'Grading rubric · the work'], [3, 'Step 3', 'AI use rubric · the process']].map(([n, small, label]) => {
        const state_ = n === w.step ? 'current' : n < w.step ? 'done' : 'todo';
        const inner = '<span class="rs-num">' + n + '</span><span><small>' + small + '</small><b>' + label + '</b></span>';
        return '<li class="' + state_ + '">' + (state_ === 'done' ? '<button type="button" data-action="wiz-back" data-to="' + n + '">' + inner + '</button>' : '<span class="rs-item">' + inner + '</span>') + '</li>';
      }).join('') + '</ol>';
    const err = w.error ? '<p class="form-error" role="alert">' + esc(w.error) + '</p>' : '';
    let page;
    if (w.step === 1) {
      page = '<section class="panel wiz-panel"><div class="wiz-form">' +
        '<div class="wiz-fields">' +
          '<label>Course<select class="select-control" data-change="wiz" data-field="courseId">' + myCourses().map((c) => '<option value="' + c.id + '"' + (c.id === d.courseId ? ' selected' : '') + '>' + esc(c.code + ' · ' + c.name) + '</option>').join('') + '</select></label>' +
          '<label>Title<input data-input="wiz" data-field="title" maxlength="120" value="' + esc(d.title) + '" placeholder="e.g. Report 3: Implementation plan"></label>' +
          '<label>Short name<input data-input="wiz" data-field="short" maxlength="24" value="' + esc(d.short) + '" placeholder="e.g. Report 3"></label>' +
          // Due date: a field that opens a small calendar pop-up
          '<div class="date-field"><span class="wiz-label">Due date</span><button type="button" class="date-button' + (w.calOpen ? ' open' : '') + (d.dueDate ? '' : ' empty') + '" data-action="wiz-cal-toggle" aria-expanded="' + !!w.calOpen + '">' + ICON.clock + '<span>' + (d.dueDate ? fmtDay(d.dueDate) : 'Choose a date') + '</span><span class="date-caret" aria-hidden="true">▾</span></button>' +
            (w.calOpen ? '<div class="cal-pop">' + dueCalendar(w) + '</div>' : '') + '</div>' +
          '<label><span>Word limit <span class="optional">(optional)</span></span><input type="number" min="0" data-input="wiz" data-field="wordLimit" value="' + esc(d.wordLimit) + '"></label>' +
          '<label>Instructions for students<textarea rows="3" data-input="wiz" data-field="description">' + esc(d.description) + '</textarea></label>' +
        '</div>' +
      '</div></section>';
    } else if (w.step === 2) {
      page = '<section class="panel wiz-panel"><div class="panel-pad">' + rubricTag('grading') + markingEditor(d.marking, 'wiz', d.bands) + '</div></section>';
    } else {
      const picks = E.RULES.filter((r) => r.scope === 'interaction').map((r) => {
        const on = d.rules.includes(r.key);
        return '<label class="crit-pick' + (on ? ' on' : '') + '"><input type="checkbox" data-change="wiz-rule" data-rule="' + r.key + '"' + (on ? ' checked' : '') + '><span><b>' + esc(r.name) + '</b><small>' + esc(r.describe(E.applyPreset(E.defaultSettings(), d.preset).rules[r.key])) + '</small></span></label>';
      }).join('');
      const own = d.customs.map((x, k) => '<div class="crit-pick on custom"><span><b>' + esc(x.name) + '</b><small>' + esc(x.description || 'Marked by hand only.') + '</small></span><button type="button" class="text-button danger" data-action="wiz-remove-crit" data-k="' + k + '">Remove</button></div>').join('');
      const add = w.adding
        ? '<div class="add-crit inline"><label><span class="sr">Criterion name</span><input id="wiz-crit-name" maxlength="60" placeholder="Criterion name, e.g. Sources checked"></label><label><span class="sr">Description</span><input id="wiz-crit-desc" maxlength="200" placeholder="What you look for (optional)"></label><div class="add-crit-actions"><button type="button" class="text-button" data-action="wiz-toggle-add">Cancel</button><button type="button" class="secondary-button small" data-action="wiz-add-crit">' + ICON.plus + 'Add criterion</button></div></div>'
        : '<button type="button" class="crit-add-tile" data-action="wiz-toggle-add"><span class="add-card-plus" aria-hidden="true">+</span><span><b>Add a criterion</b><small>Name it and say what you look for</small></span></button>';
      page = '<section class="panel wiz-panel ai-rubric-panel"><div class="panel-pad">' + rubricTag('ai') +
        '<p class="muted small rule-group-note">Separate from the grading rubric: these criteria are marked Approve / Flag on every prompt in the student\'s AI chat log.</p>' +
        '<h3 class="rule-group">AI detection sensitivity</h3><p class="muted small rule-group-note">How readily Gemini marks text as AI, and how strict the flag rules are. You can fine-tune this later under Adjust Rubrics → AI detection.</p><div class="filter-group wiz-preset" role="group" aria-label="AI detection sensitivity">' + Object.keys(E.AI_SENSITIVITY).map((k) => { const p = E.AI_SENSITIVITY[k].preset; return '<button type="button" class="filter-button' + (d.preset === p ? ' active' : '') + '" data-action="wiz-preset" data-preset="' + p + '" aria-pressed="' + (d.preset === p) + '"' + tip(E.AI_SENSITIVITY[k].text) + '>' + E.AI_SENSITIVITY[k].label + '</button>'; }).join('') + '</div>' +
        '<h3 class="rule-group">Auto-populated from the flag rules</h3><p class="muted small rule-group-note">Tick the ones to mark on every AI step. Click again to untick.</p><div class="crit-grid">' + picks + '</div>' +
        '<h3 class="rule-group">Your own criteria</h3><p class="muted small rule-group-note">Marked by hand, with no automatic check.</p><div class="crit-grid">' + own + add + '</div>' +
      '</div></section>';
    }
    const actions = '<div class="wiz-actions">' +
      (w.step === 1 ? '<button type="button" class="ghost-button" data-action="wiz-cancel">Cancel</button>' : '<button type="button" class="ghost-button" data-action="wiz-back">← Back</button>') +
      '<span class="wiz-spacer"></span><button type="button" class="secondary-button" data-action="wiz-draft">Save as draft</button>' +
      (w.step === 1 ? '<button type="button" class="primary-button" data-action="wiz-next">Next: grading rubric <span>→</span></button>'
        : w.step === 2 ? '<button type="button" class="primary-button" data-action="wiz-next">Next: AI use rubric <span>→</span></button>'
        : '<button type="button" class="primary-button" data-action="wiz-create">Create assignment</button>') + '</div>';
    return heading('', w.draftId ? 'Continue draft' : 'New assignment', w.step === 1 ? 'Set the details and pick a due date, then build the grading rubric.' : w.step === 2 ? 'How you will mark the work itself: your criteria, their points and what each level looks like.' : 'Choose what you will mark on every AI step.') + stepper + err + page + actions;
  }

  function wizardMissing(d) {
    const miss = [];
    if (!d.courseId) miss.push('a course'); if (!d.title.trim()) miss.push('a title'); if (!d.short.trim()) miss.push('a short name'); if (!d.dueDate) miss.push('a due date');
    return miss;
  }
  const listText = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');

  /** Drafts sit on the Assignments page until the teacher continues or deletes them. */
  function draftsPanel() {
    const list = myDrafts().slice().sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''));
    if (!list.length) return '';
    return '<section class="panel drafts-panel"><div class="panel-header compact"><div><div class="title-row"><h2>Drafts</h2><span class="pill count-pill">' + list.length + '</span></div><p>Assignments you started but have not created yet.</p></div></div><div class="draft-list">' +
      list.map((x) => '<div class="draft-row"><div><strong>' + esc(x.data.title || 'Untitled assignment') + '</strong><small>' + esc((course(x.data.courseId) || {}).code || 'No course') + ' · ' + (x.data.dueDate ? 'due ' + fmtDay(x.data.dueDate) : 'no due date yet') + ' · saved ' + esc(fmtDate(x.updatedAt)) + ' · on step ' + x.step + ' of 2</small></div>' +
        '<span class="draft-actions"><button type="button" class="text-button danger" data-action="wiz-draft-delete" data-id="' + x.id + '">Delete</button><button type="button" class="primary-button small" data-action="go" data-view="newasg" data-id="' + x.id + '">Continue <span>→</span></button></span></div>').join('') +
      '</div></section>';
  }

  /* ------------------------------------------------------------------ */
  function viewCourses() {
    const mine = myCourses();
    if (!mine.length) return firstRun();
    const rows = mine.map((c) => {
      const { list, cs, open } = courseNumbers(c);
      const chips = list.slice(0, 6).map((a) => '<span class="asg-chip ' + (isOpen(a) ? 'open' : 'closed') + '"' + tip(a.title + ' · ' + dueText(a)) + '>' + esc(a.short) + '</span>').join('') + (list.length > 6 ? '<span class="asg-chip more">+' + (list.length - 6) + ' more</span>' : '');
      return '<button type="button" class="course-row" data-action="go" data-view="course" data-id="' + c.id + '">' +
        '<span class="course-code big">' + esc(c.badge) + '</span>' +
        '<span class="cr-text"><strong>' + esc(c.code) + ' · ' + esc(c.name) + '</strong><small>' + esc(c.semester) + ' · ' + plural(c.roster.length, 'student') + '</small>' +
          '<span class="cr-chips">' + (chips || '<span class="muted">No assignments yet</span>') + '</span></span>' +
        '<span class="sr-num"><strong>' + list.length + '</strong><small>assignments</small></span>' +
        '<span class="sr-num"><strong>' + open.length + '</strong><small>open</small></span>' +
        '<span class="sr-num"><strong class="' + (cs.needs ? 'warn-text' : '') + '">' + cs.needs + '</strong><small>to review</small></span>' +
        '<span class="chevron" aria-hidden="true">›</span></button>';
    }).join('');
    return heading('ASSIGNMENTS', 'Your courses', 'Choose a course to see every assignment set in it.',
      '<button type="button" class="secondary-button" data-action="new-course">' + ICON.plus + 'Add course</button>' +
      '<button type="button" class="primary-button" data-action="new-assignment">' + ICON.plus + 'New assignment</button>') +
      draftsPanel() +
      '<section class="panel"><div class="panel-header"><div><div class="title-row"><h2>Courses you teach</h2><span class="pill count-pill">' + mine.length + '</span></div><p>Green chips are open assignments; grey chips have closed.</p></div></div>' +
      '<div class="course-rows">' + rows + '</div></section>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Review Performance (class overview, then one assignment)      */
  /* ------------------------------------------------------------------ */
  const PERF_FILTERS = [['active', 'Everyone with an AI log'], ['handed_in', 'Handed in'], ['logs_attached', 'AI log only, not handed in'], ['rule_flagged', 'Flagged by the rules'], ['unmarked', 'Handed in, not marked yet'], ['approved', 'Approved by you'], ['teacher_flagged', 'Flagged by you']];

  /** The students of one assignment that the stage / decision filter keeps. */
  function perfSubs(a) {
    const st = stats(a);
    const flagged = (s) => !!st.evalById[s.id] && st.evalById[s.id].flagCount > 0;
    const keep = {
      handed_in: (s) => s.stage === 'handed_in',
      logs_attached: (s) => s.stage === 'logs_attached',
      rule_flagged: flagged,
      unmarked: (s) => s.stage === 'handed_in' && s.review.status !== 'reviewed',
      approved: (s) => s.review.decision === 'approve',
      teacher_flagged: (s) => s.review.decision === 'flag'
    }[ui.perfFilter] || (() => true);
    return st.active.filter(keep);
  }

  function perfFilters(withAssignment) {
    const courses = myCourses();
    const c = course(ui.perfCourse);
    const asgs = c ? courseAssignments(c.id) : myAssignments().sort(byDue);
    return '<div class="perf-filters">' +
      '<label><span>Class</span><select class="select-control" data-change="perf-course">' + (withAssignment ? '' : '<option value="all"' + (ui.perfCourse === 'all' ? ' selected' : '') + '>All classes</option>') + courses.map((x) => '<option value="' + x.id + '"' + (x.id === ui.perfCourse ? ' selected' : '') + '>' + esc(x.code) + '</option>').join('') + '</select></label>' +
      (withAssignment ? '<label><span>Assignment</span><select class="select-control" data-change="perf-assignment">' + asgs.map((x) => '<option value="' + x.id + '"' + (x.id === ui.perfAid ? ' selected' : '') + '>' + esc(x.short + ': ' + trunc(x.title.replace(/^[^:]*:\s*/, ''), 44)) + '</option>').join('') + '</select></label>' : '') +
      '<label><span>Students</span><select class="select-control" data-change="perf-filter">' + PERF_FILTERS.map(([k, l]) => '<option value="' + k + '"' + (ui.perfFilter === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '</div>';
  }

  /** One bar cell in the assignment comparison. */
  function cmpCell(n, of, cls, label) {
    const pct = of ? Math.round(n / of * 100) : 0;
    return '<td><div class="cmp-cell"' + tip(label) + '><span class="cmp-bar"><i class="' + cls + '" style="width:' + pct + '%"></i></span><span class="cmp-num"><b>' + n + '</b><small>/' + of + '</small></span></div></td>';
  }

  function perfOverview() {
    const scope = ui.perfCourse === 'all' ? myAssignments() : courseAssignments(ui.perfCourse);
    const list = scope.slice().sort(byDue);
    const dec = { changed: 0, not_used: 0, unchanged: 0, unrecorded: 0 };
    const rows = list.map((a) => {
      const st = stats(a);
      const S = perfSubs(a);
      const evs = S.map((s) => st.evalById[s.id]).filter(Boolean);
      const cc = E.evaluateClass(S, a.settings);
      Object.keys(dec).forEach((k) => { dec[k] += cc.decisions[k] || 0; });
      const handed = S.filter((s) => s.stage === 'handed_in');
      const marked = handed.filter((s) => s.review.status === 'reviewed').length;
      const flagged = evs.filter((e) => e.flagCount > 0).length;
      const lv = evs.map((e) => e.avgLevel).filter((x) => x != null);
      const avg = lv.length ? lv.reduce((x, y) => x + y, 0) / lv.length : null;
      return '<tr class="cmp-row" data-action="go" data-view="reviews" data-id="' + a.id + '" tabindex="0"' + tip('Open the ' + a.short + ' dashboard') + '>' +
        '<td><span class="course-chip">' + esc(course(a.courseId).code) + '</span><strong>' + esc(a.short) + '</strong><small>' + fmtDay(a.dueDate) + ' · ' + dueText(a) + '</small></td>' +
        cmpCell(handed.length, st.enrolled, 'c-handed', handed.length + ' of ' + st.enrolled + ' enrolled students handed in') +
        cmpCell(flagged, S.length, 'c-flagged', flagged + ' of ' + S.length + ' students flagged by the rules') +
        cmpCell(marked, handed.length, 'c-marked', marked + ' of ' + handed.length + ' handed-in submissions marked') +
        '<td><div class="cmp-cell"' + tip('Average critique level, 0 None to 4 Verified and acted') + '><span class="cmp-bar"><i class="c-level" style="width:' + (avg == null ? 0 : avg / 4 * 100) + '%"></i></span><span class="cmp-num"><b>' + (avg == null ? '–' : avg.toFixed(1)) + '</b><small>/4</small></span></div></td>' +
        '<td class="chevron" aria-hidden="true">›</td></tr>';
    }).join('');
    return '<section class="panel"><div class="panel-header compact"><div><h2>Assignment comparison</h2><p>Each assignment side by side, oldest first. Click one to drill down.</p></div></div>' +
        (rows ? '<div class="table-scroll"><table class="cmp-table"><thead><tr><th>Assignment</th><th>Handed in</th><th>Flagged by the rules</th><th>Marked</th><th>Avg critique level</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : emptyState('No assignments match.')) +
      '</section>' +
      '<section class="panel chart-panel"><div class="panel-header compact"><div><h2>What students did with AI output</h2><p>Every AI step across ' + (ui.perfCourse === 'all' ? 'all your classes' : esc(course(ui.perfCourse).code)) + '.</p></div></div><div class="chart-body">' + decisionChart(dec, false) + '</div></section>';
  }

  function perfAssignment(a) {
    const st = stats(a);
    const S = perfSubs(a);
    const cc = E.evaluateClass(S, a.settings);
    const handed = S.filter((s) => s.stage === 'handed_in');
    const marked = handed.filter((s) => s.review.status === 'reviewed').length;
    const summary = plural(S.length, 'student') + ' · ' + handed.length + ' handed in · ' + cc.totals.flaggedStudents + ' flagged by the rules · ' + marked + ' marked';
    return '<div class="perf-title"><div><h2>' + esc(a.title) + '</h2><p>' + summary + '</p></div><button type="button" class="secondary-button" data-action="go" data-view="assignment" data-id="' + a.id + '">Open marking <span>→</span></button></div>' +
      '<section class="chart-grid">' +
        '<div class="panel chart-panel wide"><div class="panel-header compact"><div><h2>What students did with AI output</h2><p>Click a colour to open the marking list with those students.</p></div></div><div class="chart-body">' + decisionChart(cc.decisions) + '</div></div>' +
        '<div class="panel chart-panel"><div class="panel-header compact"><div><h2>Critique levels</h2><p>Click a bar to open those students. Hover for what each level means.</p></div></div><div class="chart-body">' + levelChart(cc.levels) + '</div></div>' +
        '<div class="panel chart-panel"><div class="panel-header compact"><div><h2>Which rules flagged work</h2><p>Click a rule to open the students it flagged.</p></div></div><div class="chart-body">' + ruleChart(a, cc.byRule) + '</div></div>' +
      '</section>';
  }

  function viewPerformance() {
    if (!myCourses().length) return firstRun();
    const a = ui.perfTab === 'assignment' && asg(ui.perfAid);
    const firstAsg = (course(ui.perfCourse) ? courseAssignments(ui.perfCourse)[0] : myAssignments().sort(byDue)[0]);
    const tabs = [['overview', 'Class overview', ui.perfCourse || 'all'], ['assignment', 'By assignment', (a && a.id) || (firstAsg && firstAsg.id) || '']];
    return heading('', 'Review Performance', '') +
      '<div class="perf-bar"><div class="pick-tabs" role="tablist" aria-label="Dashboard">' + tabs.map(([k, l, id]) => '<button type="button" role="tab" aria-selected="' + (ui.perfTab === k) + '" class="filter-button' + (ui.perfTab === k ? ' active' : '') + '" data-action="go" data-view="reviews" data-id="' + id + '"' + (id ? '' : ' disabled') + '>' + l + '</button>').join('') + '</div>' +
      perfFilters(!!a) + '</div>' +
      (a ? perfAssignment(a) : perfOverview());
  }

  /** From a Review Performance graph to the marking list, filtered to the students clicked. */
  function drillToMarking(key, value) {
    const aid = ui.perfAid;
    resetFilters();
    ui[key] = value;
    if (ui.perfFilter === 'handed_in' || ui.perfFilter === 'logs_attached') ui.stage = ui.perfFilter;
    if (ui.perfFilter === 'rule_flagged') ui.onlyFlagged = true;
    ui.assignmentId = aid;
    go('assignment', aid);
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
      // The whole row opens this assignment's marking page; the buttons on the right still do their own thing.
      return '<article class="asg-row clickable" data-action="go" data-view="assignment" data-id="' + a.id + '">' +
        '<button type="button" class="asg-main" data-action="go" data-view="assignment" data-id="' + a.id + '">' +
          '<span class="asg-icon ' + (isOpen(a) ? 'open' : 'closed') + '">' + ICON.doc + '</span>' +
          '<span class="asg-text"><strong>' + esc(a.title) + '</strong><small>' + esc(trunc(a.description, 120)) + '</small>' +
          '<span class="asg-meta"><span>' + fmtDay(a.dueDate) + '</span><span>' + dueText(a) + '</span>' + (a.wordLimit ? '<span>' + a.wordLimit + ' words</span>' : '') + '<span' + tip(a.rubric.map((x) => criterionInfo(a, x).name).join(' · ') || 'No rubric yet') + '>' + plural(a.rubric.length, 'rubric criterion', 'rubric criteria') + '</span></span></span>' +
        '</button>' +
        '<div class="asg-progress">' + pipeline(st) + '<small>' + st.handed.length + ' of ' + st.enrolled + ' handed in' + (st.logsOnly ? ' · ' + st.logsOnly + ' log only' : '') + '</small></div>' +
        '<div class="asg-nums"><span' + tip('Students flagged by the rules') + '><strong class="' + (st.flaggedStudents ? 'warn-text' : '') + '">' + st.flaggedStudents + '</strong><small>flagged</small></span><span' + tip('Submissions with your Approve or Flag decision') + '><strong>' + st.reviewed + '/' + st.handed.length + '</strong><small>reviewed</small></span></div>' +
        '<div class="asg-actions">' +
          '<button type="button" class="ghost-button small" data-action="open-mrubric" data-id="' + a.id + '"' + tip('The rubric for marking the work itself') + '>' + ICON.doc + 'Grading rubric</button>' +
          '<button type="button" class="ghost-button small" data-action="go" data-view="rules" data-id="' + a.id + '"' + tip('Adjust the AI use rubric and flag rules for this assignment') + '>' + ICON.chat + 'AI use rubric</button>' +
          // The main button says how much marking is left, so it is obvious at a glance.
          (st.toReview
            ? '<button type="button" class="primary-button mark-cta" data-action="go" data-view="assignment" data-id="' + a.id + '"' + tip(st.toReview + ' handed-in submissions still need your decision' + (st.needs ? ' (' + st.needs + ' flagged by the rules)' : '') + '. Opens it in Marking.') + '>Mark ' + st.toReview + ' left <span>→</span></button>'
            : '<button type="button" class="secondary-button small" data-action="go" data-view="assignment" data-id="' + a.id + '">' + (st.handed.length ? 'All marked · Open' : isOpen(a) ? 'Open · nothing handed in' : 'Open') + ' <span>→</span></button>') + '</div>' +
      '</article>';
    }).join('') || emptyState('This course has no assignments yet.', '<button type="button" class="primary-button" data-action="new-assignment" data-course="' + c.id + '">' + ICON.plus + 'New assignment</button>');

    const matrix = c.roster.length && list.length ? '<div class="table-scroll"><table class="matrix"><thead><tr><th>Student</th><th>Group</th>' +
      list.map((a) => '<th' + tip(a.title + ' · ' + dueText(a)) + '>' + esc(a.short) + '</th>').join('') + '</tr></thead><tbody>' +
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
    return '<td><button type="button" class="mx ' + cls + (r.status === 'in_progress' ? ' mx-progress' : '') + '" data-action="go" data-view="submission" data-id="' + s.id + '"' + tip(t) + '>' + label + '</button></td>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Marking (one assignment: progress, then the students)        */
  /* ------------------------------------------------------------------ */
  /* View: Marking (choose an assignment, then mark its students)        */
  /* ------------------------------------------------------------------ */
  function viewMarking() {
    const mine = myCourses();
    if (!mine.length) return firstRun();
    const pick = ui.markCourse;
    const shown = pick === 'all' ? mine : mine.filter((c) => c.id === pick);
    const tabs = [['all', 'All classes', myAssignments().reduce((n, a) => n + stats(a).toReview, 0)]].concat(mine.map((c) => [c.id, c.code, courseStats(c.id).toReview]));
    const groups = shown.map((c) => {
      // Most marking left first, so the work that needs doing is at the top.
      const list = courseAssignments(c.id).slice().sort((x, y) => stats(y).toReview - stats(x).toReview || byDue(x, y));
      const cards = list.map((a) => {
        const st = stats(a);
        const pctDone = st.handed.length ? Math.round(st.reviewed / st.handed.length * 100) : 0;
        return '<button type="button" class="pick-card mark-card' + (st.toReview ? ' attention' : ' done') + '" data-action="go" data-view="assignment" data-id="' + a.id + '">' +
          '<span class="pc-top"><span class="status-pill ' + (st.toReview ? 'flagged' : st.handed.length ? 'reviewed' : 'todo') + '">' + (st.toReview ? st.toReview + ' left to mark' : st.handed.length ? 'All marked' : 'Nothing handed in') + '</span><span class="muted">' + dueText(a) + '</span></span>' +
          '<strong>' + esc(a.title) + '</strong><small>' + fmtDay(a.dueDate) + '</small>' +
          '<span class="mp-bar small"><span style="width:' + pctDone + '%"></span></span>' +
          '<span class="pc-nums"><span><b>' + st.reviewed + '/' + st.handed.length + '</b> marked</span>' + (st.needs ? '<span><b class="warn-text">' + st.needs + '</b> flagged and waiting</span>' : '') + '</span>' +
          '<span class="pc-open">' + (st.toReview ? 'Start marking' : 'Open') + ' <span>→</span></span></button>';
      }).join('') || emptyState('No assignments in this course yet.');
      return '<section class="pick-group"><div class="pick-head"><span class="course-code">' + esc(c.badge) + '</span><div><strong>' + esc(c.code) + '</strong><small>' + esc(c.name) + '</small></div></div><div class="pick-grid">' + cards + '</div></section>';
    }).join('');
    return heading('', 'Marking', 'Choose an assignment to mark. Assignments with the most left to mark come first.') +
      '<div class="pick-tabs" role="tablist" aria-label="Filter by class">' + tabs.map(([k, l, n]) => '<button type="button" role="tab" aria-selected="' + (pick === k) + '" class="filter-button' + (pick === k ? ' active' : '') + '" data-action="go" data-view="marking" data-id="' + k + '">' + esc(l) + (n ? ' <span class="pill count-pill">' + n + '</span>' : '') + '</button>').join('') + '</div>' +
      // Several classes sit side by side as columns, so everything fits on one screen.
      '<div class="mark-groups' + (shown.length > 1 ? ' side-by-side' : '') + '">' + groups + '</div>';
  }

  /* ------------------------------------------------------------------ */
  function viewAssignment() {
    const a = asg(ui.assignmentId);
    if (!a) return emptyState('This course has no assignments yet.', '<button type="button" class="primary-button" data-action="new-assignment">' + ICON.plus + 'New assignment</button>');
    const c = course(a.courseId);
    const st = stats(a);
    const groups = Array.from(new Set(c.roster.map((r) => r.group))).sort();
    const next = nextToReview([a]);
    const left = st.handed.length - st.reviewed;

    return heading('', esc(a.title),
      'Lane 2 assessment · due ' + fmtDay(a.dueDate) + ' (' + dueText(a).toLowerCase() + ')' + (a.wordLimit ? ' · ' + a.wordLimit + ' words' : '') + ' · ' + (E.PRESETS[a.settings.preset] ? E.PRESETS[a.settings.preset].label : 'Custom') + ' rules',
      '<label class="heading-select"><span class="sr">Switch assignment</span><select class="select-control" data-change="switch-assignment"' + tip('Switch to another assignment in any of your courses') + '>' + assignmentOptions(a.id) + '</select></label>' +
      '<button type="button" class="ghost-button" data-action="go" data-view="marking" data-id="' + c.id + '">All to mark</button>' +
      '<button type="button" class="ghost-button" data-action="go" data-view="reviews" data-id="' + a.id + '"' + tip('Graphs for this assignment in Review Performance') + '>' + ICON.chart + 'Performance</button>' +
      '<button type="button" class="secondary-button" data-action="open-mrubric" data-id="' + a.id + '">' + ICON.doc + 'Grading rubric</button>' +
      '<button type="button" class="secondary-button" data-action="go" data-view="rules" data-id="' + a.id + '">' + ICON.chat + 'AI use rubric</button>' +
      (next ? '<button type="button" class="primary-button" data-action="go" data-view="submission" data-id="' + next.id + '">Start next review <span>→</span></button>' : '')) +
      '<section class="panel mark-progress"' + tip(st.reviewed + ' of ' + st.handed.length + ' handed-in submissions have your Approve or Flag decision.') + '>' +
        '<div class="mp-head"><div><h2>Marking progress</h2><p>' + st.reviewed + ' of ' + st.handed.length + ' handed-in submissions marked' + (st.needs ? ' · ' + st.needs + ' flagged and waiting' : '') + (st.logsOnly ? ' · ' + st.logsOnly + ' not handed in yet' : '') + '</p></div>' +
        '<div class="mp-left">' + (st.handed.length ? (left ? '<b>' + left + '</b> left to mark' : '<b>All marked</b>') : '<b>Nothing handed in yet</b>') + '</div></div>' +
        '<div class="mp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + st.handed.length + '" aria-valuenow="' + st.reviewed + '"><span style="width:' + (st.handed.length ? st.reviewed / st.handed.length * 100 : 0) + '%"></span></div>' +
      '</section>' +
      '<section class="panel table-panel" id="students-panel">' +
        '<div class="table-toolbar">' +
          '<label class="search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><span class="sr">Search students</span><input type="search" placeholder="Search name or UPI…" value="' + esc(ui.search) + '" data-input="search"></label>' +
          '<div class="toolbar-controls">' +
            '<label><span class="sr">Stage</span><select class="select-control" data-change="stage">' + [['active', 'Log attached or handed in'], ['handed_in', 'Handed in'], ['logs_attached', 'Log only, not handed in'], ['not_started', 'Not started'], ['all', 'Everyone']].map(([v, l]) => '<option value="' + v + '"' + (ui.stage === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
            '<label><span class="sr">Tutorial group</span><select class="select-control" data-change="group"><option value="all">All groups</option>' + groups.map((g) => '<option' + (ui.group === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></label>' +
            '<label><span class="sr">Sort</span><select class="select-control" data-change="sort">' + [['flags', 'Most flags first'], ['review', 'Not marked first'], ['level', 'Lowest critique level first'], ['shared', 'Most shared wording first'], ['name', 'Name A to Z']].map(([v, l]) => '<option value="' + v + '"' + (ui.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
            '<label class="check"><input type="checkbox" data-change="onlyFlagged"' + (ui.onlyFlagged ? ' checked' : '') + '> Flagged only</label>' +
          '</div>' +
        '</div>' +
        '<div class="chips" id="filter-chips">' + filterChips() + '</div>' +
        '<div class="table-scroll"><table class="grid-table students"><thead><tr><th>Student</th><th>Group</th><th>AI log</th><th>AI steps <span class="muted">(colour = what they did)</span></th><th class="num">Avg critique level</th><th class="num">Shared wording</th><th class="num">Flags</th><th class="num"><span data-tip="Mark from your grading rubric (Excellent / Good / Okay / Not good)">Mark</span></th><th>Your decision</th><th><span class="sr">Open</span></th></tr></thead>' +
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
    // Still to mark first, marked last; the chosen sort applies within each group.
    const rank = (x) => (x.s.stage === 'handed_in' ? (x.s.review.status === 'reviewed' ? 2 : 0) : 1);
    rows = rows.sort((x, y) => rank(x) - rank(y) || by[ui.sort](x, y) || fullName(x.p).localeCompare(fullName(y.p)));
    $('#row-count').textContent = 'Showing ' + plural(rows.length, 'student') + ' of ' + st.enrolled;
    $('#filter-chips').innerHTML = filterChips();
    if (!rows.length) { body.innerHTML = '<tr><td colspan="10" class="empty">No students match these filters. Clear the search or filters to see everyone.</td></tr>'; return; }
    body.innerHTML = rows.map(({ s, p, e }) => {
      const started = s.stage !== 'not_started';
      const lvl = e.avgLevel == null ? '<span class="muted">n/a</span>' : '<span' + tip(E.LEVELS[Math.round(e.avgLevel)].text) + '>' + e.avgLevel.toFixed(1) + ' <span class="muted">' + E.LEVELS[Math.round(e.avgLevel)].name + '</span></span>';
      const logCell = stagePill(s) + (s.logsAttachedAt ? '<small class="sub-line">' + fmtDate(s.logsAttachedAt) + '</small>' : '');
      const toMark = s.stage === 'handed_in' && s.review.status !== 'reviewed';
      return '<tr class="' + (started ? 'clickable' : 'dim') + (toMark ? ' to-mark' : '') + '"' + (started ? ' data-action="go" data-view="submission" data-id="' + s.id + '"' : '') + '>' +
        '<td><span class="who">' + avatar(p, 'sm') + '<span><strong>' + esc(fullName(p)) + '</strong><small>' + esc(p.upi) + '</small></span></span></td>' +
        '<td>' + esc(groupOf(s)) + '</td>' +
        '<td>' + logCell + '</td>' +
        '<td>' + (started ? strip(e) : '<span class="muted">–</span>') + '</td>' +
        '<td class="num">' + (started ? lvl : '') + '</td>' +
        '<td class="num">' + (s.stage === 'handed_in' && e.interactions.length ? '<span' + tip('Share of the final submission that matches logged AI output word-for-word (5+ words in a row).') + '>' + pct(e.shared.coverage) + '</span>' : '<span class="muted">n/a</span>') + '</td>' +
        '<td class="num">' + (e.flagCount ? '<span class="flagcount"' + tip(flagSummary(e)) + '>' + e.flagCount + '</span>' : '<span class="muted">0</span>') + '</td>' +
        '<td class="num">' + contentCell(s, a) + '</td>' +
        '<td>' + decisionPill(s) + '</td>' +
        '<td>' + (started ? '<button type="button" class="' + (toMark ? 'primary-button' : 'secondary-button') + ' small" data-action="go" data-view="submission" data-id="' + s.id + '">' + (toMark ? 'Mark' : 'Open') + '</button>' : '') + '</td>' +
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
    const nextOpen = queue.slice(pos + 1).concat(queue.slice(0, pos)).find((x) => x.stage === 'handed_in' && x.review.status !== 'reviewed');
    const prog = rubricProgress(s, a);

    const banner = s.stage === 'logs_attached'
      ? '<div class="info-banner logs">' + ICON.info + '<p><strong>Not handed in yet.</strong> The AI log was attached ' + fmtDate(s.logsAttachedAt) + '. You can read and mark the log now; the final work appears once the student hands in.</p></div>'
      : s.declaration === 'no_ai'
        ? '<div class="info-banner">' + ICON.info + '<p><strong>The student declared no AI use</strong> when handing in on ' + fmtDate(s.handedInAt) + '. There is no log to mark; check the final work if anything looks AI-written.</p></div>' : '';

    // Flags raised by the rules: one row per rule, with the steps it fired on.
    const byRule = {};
    e.interactions.forEach((i) => i.result.flags.forEach((f) => { (byRule[f.key] = byRule[f.key] || { f, steps: [] }).steps.push(i); }));
    const flagRows = e.patternFlags.map((f) => '<li class="flag-item"><span class="flag-pill high"' + tip(f.rule) + '>' + esc(f.name) + '</span><span class="flag-detail">' + esc(f.detail) + '</span><span class="muted">Whole log</span></li>').concat(
      Object.keys(byRule).map((k) => { const x = byRule[k]; return '<li class="flag-item"><span class="flag-pill ' + (x.steps.length > 1 ? 'medium' : 'low') + '"' + tip(x.f.rule + (x.f.simulated ? ' Simulated check.' : '')) + '>' + esc(x.f.name) + '</span><span class="flag-detail">' + esc(x.steps.length === 1 ? x.steps[0].result.flags.find((f) => f.key === k).detail : 'On ' + x.steps.length + ' steps.') + '</span><span class="step-links">' + x.steps.map((i) => '<a href="#step-' + esc(i.id) + '" class="step-link" data-action="jump" data-id="' + esc(i.id) + '"' + tip('Step ' + i.step + ': ' + i.task) + '>Step ' + i.step + '</a>').join('') + '</span></li>'; })).join('');

    // Process timeline, in the marking panel: green once every criterion on a step is marked, red until then.
    const stepDone = (i) => a.rubric.length > 0 && rubricStepProgress(s, a, i).marked === a.rubric.length;
    const doneSteps = e.interactions.filter(stepDone).length;
    const timeline = e.interactions.length ? '<div class="rail-timeline"><div class="row-between"><span>Process timeline</span><b>' + doneSteps + ' / ' + e.interactions.length + ' steps marked</b></div>' +
      '<div class="step-row"><span class="step-label">Step:</span><ol class="step-track">' + e.interactions.map((i) => {
        const done = stepDone(i);
        const pr = rubricStepProgress(s, a, i);
        const state = done ? 'marked' : a.rubric.length ? pr.marked + ' of ' + a.rubric.length + ' criteria marked' : 'no rubric criteria';
        return '<li><a href="#step-' + esc(i.id) + '" class="st ' + (done ? 'done' : 'todo') + '" data-action="jump" data-id="' + esc(i.id) + '" aria-label="Step ' + i.step + ', ' + state + '"' + tip('Step ' + i.step + ': ' + i.task + ' · ' + state.charAt(0).toUpperCase() + state.slice(1) + '. Click to jump to it.') + '>' + i.step + '</a></li>';
      }).join('') + '</ol></div></div>' : '';

    const steps = e.interactions.map((i) => {
      const open = ui.open[i.id];
      return '<article class="step-card" id="step-' + esc(i.id) + '">' +
        '<div class="step-body">' +
          '<header class="step-head"><span class="timeline-num">' + i.step + '</span><div><h3>' + esc(i.task) + '</h3><span class="muted">' + esc(i.tool) + (i.timestamp ? ' · ' + fmtDate(i.timestamp) : '') + (i.decisionSource === 'ai' ? ' · split from the pasted log by AI evaluation' : '') + '</span></div>' + decisionBadge(i.decision) + '</header>' +
          '<div class="dialogue-block prompt"><strong>Student prompt</strong>' + esc(i.prompt) + '</div>' +
          '<details class="dialogue-block response"' + (open !== false ? ' open' : '') + ' data-toggle="' + esc(i.id) + '"><summary><strong>AI response</strong> <span class="muted">' + E.wordCount(i.output) + ' words</span></summary>' + esc(i.output) + '</details>' +
          (i.pushbackText ? '<div class="dialogue-block followup"><strong>Student\'s next message in the chat</strong>' + esc(i.pushbackText) + '</div>' : '') +
        '</div>' +
        rubricCard(s, a, i) +
      '</article>';
    }).join('');

    const submission = s.stage !== 'handed_in' ? '<p class="muted">Not handed in yet.</p>'
      : (s.file ? fileRow(s, 'Handed in ' + fmtDate(s.handedInAt)) : '') +
        (s.submission ? '<p class="submission">' + e.shared.segments.map((g) => g.shared ? '<mark>' + esc(g.text) + '</mark>' : esc(g.text)).join('') + '</p>'
          : s.file ? '<p class="muted small">Shared wording cannot be checked on an uploaded file yet. Download the file to read the work.</p>' : '<p class="muted">No final submission text stored.</p>');

    const decisionText = r.decision === 'approve' ? 'You approved this submission.' : r.decision === 'flag' ? 'You flagged this submission for follow-up.' : 'No decision yet.';
    const rail = '<aside class="review-rail" aria-label="Mark this submission">' +
      '<div class="panel rail-card rail-mark">' +
        rubricTag('ai') + '<h2>AI use decision</h2><p class="rail-sub">' + decisionText + '</p>' +
        '<div class="rail-actions" role="group" aria-label="Your decision">' +
          ['approve', 'flag', 'comment'].map((k) => {
            const on = k === 'comment' ? (ui.railComment || !!r.comment) : r.decision === k;
            return '<button type="button" class="rail-action ' + k + (on ? ' on' : '') + '" data-action="sub-' + k + '" aria-pressed="' + on + '"' + tip(k === 'approve' ? 'Approve: no concerns with how AI was used.' : k === 'flag' ? 'Flag: follow this up (e.g. talk to the student, moderation).' : 'Comment: leave a note on the whole submission.') + '>' + MARK[k].icon + '<span>' + MARK[k].label + '</span></button>';
          }).join('') +
        '</div>' +
        (r.comment && !ui.railCommentEdit
          ? savedComment(r.comment, 'sub-comment-edit', 'sub-comment-delete', '')
          : ui.railComment || ui.railCommentEdit ? commentBox('rail-comment-input', r.comment, 'Comment for markers…', 'sub-comment-post', 'sub-comment-cancel', '') : '') +
        '<div class="rail-progress"' + tip('Rubric criteria you have approved or flagged across all steps.') + '><div class="row-between"><span>Rubric marked</span><b>' + prog.marked + ' / ' + prog.total + '</b></div><div class="meter teal"><i style="width:' + (prog.total ? prog.marked / prog.total * 100 : 0) + '%"></i></div>' +
          '<div class="rail-counts"><span class="ok-text">' + ICON.check + prog.approve + ' approved</span><span class="warn-text">' + ICON.flag + prog.flag + ' flagged</span><span>' + ICON.comment + prog.comments + '</span></div></div>' +
        timeline +
        '<div class="rail-meta"><span class="status-pill ' + (r.status === 'reviewed' ? 'reviewed' : r.status === 'in_progress' ? 'ready' : 'todo') + '">' + REVIEW[r.status] + '</span></div>' +
      '</div>' +
      '<div class="panel rail-card rail-nav">' +
        '<span class="muted">Student ' + (pos + 1) + ' of ' + queue.length + ' in ' + esc(a.short) + '</span>' +
        '<div class="rail-nav-buttons"><button type="button" class="secondary-button" data-action="go" data-view="review" data-id="' + (prev ? prev.id : '') + '"' + (prev ? '' : ' disabled') + '>← Previous</button>' +
          '<button type="button" class="secondary-button" data-action="go" data-view="review" data-id="' + (nextOpen ? nextOpen.id : '') + '"' + (nextOpen ? tip('Next handed-in student without your decision: ' + subName(nextOpen)) : ' disabled') + '>Next →</button></div>' +
        (nextOpen ? '' : '<p class="ok-text small">Every handed-in submission here has your decision.</p>') +
        '<button type="button" class="ghost-button full-width" data-action="print-student" data-id="' + s.id + '">' + ICON.print + 'Print or save PDF</button>' +
      '</div></aside>';

    return '<div class="page-heading review-heading"><div class="who big">' + avatar(p, 'lg') + '<div><h1>' + esc(fullName(p)) + '</h1>' +
        '<p>' + esc(p.upi) + ' · ' + esc(groupOf(s)) + ' · ' + stagePill(s) + (s.logsAttachedAt ? ' · AI log attached ' + fmtDate(s.logsAttachedAt) : '') + (s.handedInAt ? ' · handed in ' + fmtDate(s.handedInAt) + (s.logsAttachedAt ? ' (' + gap(s.logsAttachedAt, s.handedInAt) + ' later)' : '') : '') +
        (s.sources.length ? ' · ' + s.sources.map((x) => esc(x.tool) + ' ' + (x.type === 'link' ? 'share link' : 'pasted text')).join(', ') : '') + '</p></div></div></div>' +
      banner +
      '<div class="review-layout"><div class="review-main">' +
        (steps ? '<section class="steps-section"><div class="row-between section-title"><div>' + rubricTag('ai') + '<h2>AI interactions and rubric</h2><p>Read each step, then Approve, Flag or Comment on each rubric criterion beside it.' + (s.aiSplit ? ' These steps were split from the pasted log by AI evaluation; "Changed", "Used unchanged" and "Not used" are its estimates.' : '') + '</p></div><button type="button" class="secondary-button small" data-action="go" data-view="submission" data-id="' + s.id + '">' + ICON.doc + 'Final submission</button></div>' + steps +
            (s.aiSplit && s.chatLog ? '<details class="panel stu-details orig-log"><summary>Show the chat log exactly as the student pasted it</summary><pre class="chat-log">' + esc(s.chatLog) + '</pre></details>' : '') + '</section>'
          : s.chatLog ? pastedLogPanel(s).replace('Shown exactly as pasted.', 'Shown exactly as pasted. Turn on AI evaluation on the submission page to split it into steps.')
          : s.stage !== 'not_started' && s.declaration !== 'no_ai' ? emptyState('No AI interactions in this log.') : '') +
        '<section class="panel"><div class="panel-header compact"><div><h2>Final submission: shared wording</h2><p><mark>Highlighted</mark> text matches a logged AI output word-for-word (5 or more words in a row). Paraphrased or unlogged AI text is not detected.</p></div><div class="shared-figure"' + tip('Share of the final work matching AI output word-for-word. Indicator only.') + '><b>' + (s.stage === 'handed_in' && e.interactions.length ? pct(e.shared.coverage) : 'n/a') + '</b><span>shared wording with AI</span></div></div><div class="panel-pad">' + submission + '</div></section>' +
        '<section class="panel"><div class="panel-header compact"><div><h2>Flags raised by the rules</h2><p>Prompts to look closer, not decisions. Hover a flag to see the rule; click a step to jump to it.</p></div><span class="pill ' + (e.flagCount ? 'count-pill' : 'ok-pill') + '">' + e.flagCount + '</span></div>' +
          (flagRows ? '<ul class="flag-list">' + flagRows + '</ul>' : '<p class="panel-pad muted">No flags with this assignment\'s rules.</p>') + '</section>' +
      '</div>' + rail + '</div>';
  }
  function fig(n, label, cls, t) { return '<div class="figure ' + (cls || '') + '"' + tip(t) + '><b>' + n + '</b><span>' + label + '</span></div>'; }

  function rubricStepProgress(s, a, i) {
    const m = s.review.marks[i.id] || {};
    return { marked: a.rubric.filter((c) => m[c.id] && m[c.id].mark).length };
  }

  /** "+" on the review rubric: add your own criterion to this assignment's rubric without leaving the script. */
  function addCritControl(a, i) {
    const open = ui.addCrit === i.id;
    const btn = '<button type="button" class="add-crit-toggle' + (open ? ' on' : '') + '" data-action="toggle-add-crit" data-iid="' + esc(i.id) + '" aria-expanded="' + open + '" aria-label="Add a criterion to the rubric"' + tip('Add your own criterion. It is added to the ' + a.short + ' rubric, so it appears for every student and step.') + '>+</button>';
    const form = open ? '<form class="add-crit inline" data-form="add-criterion" data-aid="' + a.id + '"><label><span class="sr">Criterion name</span><input name="name" required maxlength="60" placeholder="Criterion name, e.g. Sources checked"></label><label><span class="sr">Description</span><input name="description" maxlength="200" placeholder="What you look for (optional)"></label><div class="add-crit-actions"><button type="button" class="text-button" data-action="toggle-add-crit" data-iid="' + esc(i.id) + '">Cancel</button><button type="submit" class="secondary-button small">' + ICON.plus + 'Add criterion</button></div></form>' : '';
    return { btn, form };
  }

  /** A comment box with Post / Cancel; nothing is saved until Post. */
  function commentBox(id, value, placeholder, postAction, cancelAction, attrs) {
    return '<div class="comment-compose"><label class="sr" for="' + esc(id) + '">Comment</label><textarea id="' + esc(id) + '" rows="2" placeholder="' + esc(placeholder) + '">' + esc(value || '') + '</textarea>' +
      '<div class="cc-actions"><button type="button" class="text-button" data-action="' + cancelAction + '"' + attrs + '>Cancel</button><button type="button" class="primary-button small" data-action="' + postAction + '"' + attrs + '>Post</button></div></div>';
  }
  /** A posted comment, with Edit and Delete. */
  function savedComment(text, editAction, deleteAction, attrs) {
    return '<div class="saved-comment">' + ICON.comment + '<p>' + esc(text) + '</p><span class="sc-actions"><button type="button" class="text-button" data-action="' + editAction + '"' + attrs + '>Edit</button><button type="button" class="text-button danger" data-action="' + deleteAction + '"' + attrs + '>Delete</button></span></div>';
  }

  function rubricCard(s, a, i) {
    const m = s.review.marks[i.id] || {};
    const pr = rubricStepProgress(s, a, i);
    const add = addCritControl(a, i);
    if (!a.rubric.length) return '<aside class="rubric-card"><header><strong>AI use rubric</strong>' + add.btn + '</header>' + (add.form || '<p class="muted small">This assignment has no rubric criteria yet. Use + to add your own.</p>') + '</aside>';
    return '<aside class="rubric-card" aria-label="Rubric for step ' + i.step + '">' +
      '<header><strong>AI use rubric</strong><span class="muted">' + pr.marked + ' of ' + a.rubric.length + ' marked</span>' +
      (pr.marked < a.rubric.length ? '<button type="button" class="text-button" data-action="approve-rest" data-iid="' + esc(i.id) + '"' + tip('Approve every criterion on this step that is not marked yet.') + '>Approve rest</button>' : '') + add.btn + '</header>' + add.form +
      a.rubric.map((c) => {
        const info = criterionInfo(a, c);
        const x = m[c.id] || {};
        const key = i.id + '|' + c.id;
        const showComment = ui.critOpen[key] || ui.critEdit[key] || x.comment;
        const ids = ' data-iid="' + esc(i.id) + '" data-cid="' + esc(c.id) + '"';
        return '<div class="crit' + (x.mark ? ' m-' + x.mark : '') + '">' +
          '<div class="crit-row"><span class="crit-name"' + tip(info.description) + '>' + esc(info.name) + (c.type === 'custom' ? '' : '') + '</span>' +
          '<span class="crit-actions" role="group" aria-label="' + esc(info.name) + '">' +
            ['approve', 'flag', 'comment'].map((k) => {
              const on = k === 'comment' ? !!showComment : x.mark === k;
              return '<button type="button" class="mark-btn ' + k + (on ? ' on' : '') + '" data-action="mark" data-iid="' + esc(i.id) + '" data-cid="' + esc(c.id) + '" data-mark="' + k + '" aria-pressed="' + on + '" aria-label="' + MARK[k].label + ': ' + esc(info.name) + '"' + tip(MARK[k].label + ' · ' + MARK[k].tip) + '>' + MARK[k].icon + '</button>';
            }).join('') +
          '</span></div>' +
          (x.comment && !ui.critEdit[key] ? savedComment(x.comment, 'crit-comment-edit', 'crit-comment-delete', ids)
            : ui.critOpen[key] || ui.critEdit[key] ? commentBox('cc-' + i.id + '-' + c.id, x.comment, 'Comment on ' + info.name.toLowerCase() + '…', 'crit-comment-post', 'crit-comment-cancel', ids) : '') +
        '</div>';
      }).join('') +
    '</aside>';
  }

  /* ------------------------------------------------------------------ */
  /* View: Adjust Rubrics (class → assignment → rubric, then rule lab)   */
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

  /* ---------- Rubric versions: edits apply live (so the test lab can preview them) and become a version on Save ---------- */
  const rubricSnap = (a) => ({ rubric: clone(a.rubric), settings: clone(a.settings) });
  function ensureVersions(a) {
    if (a.rubricVersions && a.rubricVersions.length) return false;
    a.rubricVersions = [Object.assign({ id: uid('rv-'), n: 1, at: a.createdAt || new Date().toISOString(), by: '', note: 'Original rubric', changes: [] }, rubricSnap(a))];
    return true;
  }
  const lastVersion = (a) => { const v = a.rubricVersions || []; return v[v.length - 1]; };
  function rubricChanges(from, to, a) {
    const out = [];
    const name = (c) => criterionInfo(a, c).name;
    const ids = (r) => r.map((c) => c.id);
    to.rubric.filter((c) => !ids(from.rubric).includes(c.id)).forEach((c) => out.push('Added "' + name(c) + '"'));
    from.rubric.filter((c) => !ids(to.rubric).includes(c.id)).forEach((c) => out.push('Removed "' + name(c) + '"'));
    if (from.settings.preset !== to.settings.preset && E.PRESETS[to.settings.preset]) out.push('Preset set to ' + E.PRESETS[to.settings.preset].label);
    E.RULES.forEach((r) => {
      const x = from.settings.rules[r.key] || {}, y = to.settings.rules[r.key] || {};
      if (x.enabled !== y.enabled) out.push(r.name + (y.enabled ? ' turned on' : ' turned off'));
      else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(r.name + ' threshold changed');
    });
    if (JSON.stringify(from.settings.vocab) !== JSON.stringify(to.settings.vocab)) out.push('Word lists edited');
    const fa = E.normaliseSettings(from.settings).ai, ta = E.normaliseSettings(to.settings).ai;
    if (fa.sensitivity !== ta.sensitivity) out.push('AI detection set to ' + E.AI_SENSITIVITY[ta.sensitivity].label);
    if (fa.unlogged !== ta.unlogged) out.push('"Not recorded" AI text ' + (ta.unlogged ? 'turned on' : 'turned off'));
    if (fa.brainstorm !== ta.brainstorm) out.push('Brainstormed ideas ' + (ta.brainstorm ? 'count' : 'no longer count') + ' as AI help');
    return out;
  }
  const pendingChanges = (a) => (a && lastVersion(a) ? rubricChanges(lastVersion(a), a, a) : []);
  function commitVersion(a, note) {
    ensureVersions(a);
    const last = lastVersion(a);
    const changes = rubricChanges(last, a, a);
    if (!changes.length) return false;
    a.rubricVersions.push(Object.assign({ id: uid('rv-'), n: last.n + 1, at: new Date().toISOString(), by: me().name, note: (note || '').trim().slice(0, 120), changes }, rubricSnap(a)));
    return true;
  }
  function discardRubric(a) {
    const last = lastVersion(a);
    if (!last) return;
    a.rubric = clone(last.rubric); a.settings = clone(last.settings);
    ui.versionNote = ''; ui.caseChanged = {}; ui.lastImpact = null;
    save();
  }
  /** Ask before leaving an assignment's rubric with unsaved changes. True = OK to leave. */
  function confirmLeaveRubric(view, id) {
    const a = isRulesView(ui.view) && asg(ui.rubricAid);
    if (!a || (isRulesView(view) && id === a.id) || !pendingChanges(a).length) return true;
    if (!window.confirm('You have unsaved changes to the ' + a.short + ' rubric. Leave and discard them?')) return false;
    discardRubric(a);
    return true;
  }

  function versionHistory(a) {
    const vs = a.rubricVersions.slice().reverse();
    const dirty = pendingChanges(a).length > 0;
    return '<aside class="panel version-panel" aria-label="Version history"><div class="version-head"><h3>Version history</h3><span class="muted">' + plural(a.rubricVersions.length, 'saved version') + '</span></div><ol class="version-list">' +
      (dirty ? '<li class="version draft"><div class="v-head"><b>Unsaved changes</b><span class="v-tag">Draft</span></div><small>Save to create version ' + (lastVersion(a).n + 1) + '.</small></li>' : '') +
      vs.map((v, k) => {
        const current = k === 0;
        const list = v.changes.length ? '<p class="v-changes"' + tip(v.changes.join(' · ')) + '>' + esc(v.changes.slice(0, 2).join(' · ')) + (v.changes.length > 2 ? ' · +' + (v.changes.length - 2) + ' more' : '') + '</p>' : '';
        return '<li class="version' + (current ? ' current' : '') + '"><div class="v-head"><b>Version ' + v.n + '</b>' + (current ? '<span class="v-tag">' + (dirty ? 'Last saved' : 'Current') + '</span>' : '') + '</div>' +
          '<small>' + esc(fmtDate(v.at)) + (v.by ? ' · ' + esc(v.by) : '') + '</small>' + (v.note ? '<p class="v-note">' + esc(v.note) + '</p>' : '') + list +
          (current ? '' : '<button type="button" class="text-button" data-action="restore-version" data-vid="' + v.id + '"' + tip('Load version ' + v.n + ' into the editor. Nothing changes until you save.') + '>Restore</button>') + '</li>';
      }).join('') + '</ol></aside>';
  }

  function saveBar(a) {
    const changes = pendingChanges(a);
    const dirty = changes.length > 0;
    return '<div class="save-bar' + (dirty ? ' dirty' : '') + '" role="region" aria-label="Save rubric changes">' +
      '<div class="sb-status">' + (dirty
        ? '<b>' + plural(changes.length, 'unsaved change') + '</b><span>' + esc(changes.slice(0, 3).join(' · ')) + (changes.length > 3 ? ' · and ' + (changes.length - 3) + ' more' : '') + '</span>'
        : '<b>All changes saved</b><span>Version ' + lastVersion(a).n + ' is in use. Changes to the rubric or flag rules show here until you save.</span>') + '</div>' +
      (dirty ? '<label class="sb-note"><span class="sr">Note for this version</span><input type="text" maxlength="120" placeholder="Note for this version (optional)" data-input="version-note" value="' + esc(ui.versionNote || '') + '"></label>' : '') +
      '<div class="sb-actions"><button type="button" class="ghost-button" data-action="discard-rubric"' + (dirty ? '' : ' disabled') + '>Discard</button>' +
      '<button type="button" class="primary-button" data-action="save-rubric"' + (dirty ? '' : ' disabled') + '>Save changes</button></div></div>';
  }

  /** Adjust Rubrics: class → assignment → rubric. */
  /** Adjust Rubrics step bar (class → assignment → rubrics), shown on every tab. */
  function rubricStepsBar(c, a) {
    const step = (n, label, value, state, view, id) => {
      const inner = '<span class="rs-num">' + n + '</span><span><small>' + label + '</small><b>' + value + '</b></span>';
      return '<li class="' + state + '">' + (state === 'done' ? '<button type="button" data-action="go" data-view="' + view + '" data-id="' + (id || '') + '"' + tip('Change ' + label.toLowerCase()) + '>' + inner + '</button>' : '<span class="rs-item">' + inner + '</span>') + '</li>';
    };
    return '<ol class="rubric-steps" aria-label="Steps">' +
      step(1, 'Class', c ? esc(c.code) : 'Choose a class', c ? 'done' : 'current', 'rules', '') +
      step(2, 'Assignment', a ? esc(a.short) : c ? 'Choose an assignment' : 'Then an assignment', a ? 'done' : c ? 'current' : 'todo', 'rules', c && c.id) +
      step(3, 'Rubrics', a ? 'Grading and AI use' : 'Then adjust its rubrics', a ? 'current' : 'todo') + '</ol>';
  }

  function viewRules() {
    if (!myCourses().length) return emptyState('Add a course first, then set up its assignments and rubrics.', '<button type="button" class="primary-button" data-action="new-course">' + ICON.plus + 'Add a course</button>');
    const c = course(ui.rubricCourse);
    const a = asg(ui.rubricAid);
    const criteria = (n) => n + (n === 1 ? ' criterion' : ' criteria');
    const steps = rubricStepsBar(c, a);

    let body;
    if (!c) {
      body = '<div class="pick-grid">' + myCourses().map((x) => {
        const n = courseAssignments(x.id).length;
        return '<button type="button" class="pick-card" data-action="go" data-view="rules" data-id="' + x.id + '">' +
          '<span class="pc-top"><span class="course-code">' + esc(x.badge) + '</span></span><strong>' + esc(x.code) + '</strong><small>' + esc(x.name) + '</small>' +
          '<span class="pc-nums"><span><b>' + n + '</b> ' + (n === 1 ? 'assignment' : 'assignments') + '</span></span><span class="pc-open">Choose an assignment →</span></button>';
      }).join('') + '</div>';
    } else if (!a) {
      body = '<div class="pick-grid">' + courseAssignments(c.id).map((x) => {
        const rules = x.rubric.filter((r) => r.type === 'rule').length;
        return '<button type="button" class="pick-card" data-action="go" data-view="rules" data-id="' + x.id + '">' +
          '<strong>' + esc(x.title) + '</strong><small>' + fmtDay(x.dueDate) + ' · ' + dueText(x) + '</small>' +
          '<span class="pc-nums"><span><b>' + rules + '</b> auto-populated</span><span><b>' + (x.rubric.length - rules) + '</b> your own</span></span><span class="pc-open">Adjust rubrics →</span></button>';
      }).join('') +
        '<button type="button" class="pick-card add-card" data-action="new-assignment" data-course="' + c.id + '"><span class="add-card-plus" aria-hidden="true">+</span><strong>New assignment</strong><small>Set one up for ' + esc(c.code) + ', then adjust its rubric.</small></button></div>';
    } else {
      ensureVersions(a);
      const lab = ruleLab(a);
      body = ui.view === 'detect'
        ? rubricTabs(a, 'detect') + detectionPage(a, lab) + saveBar(a)
        : rubricTabs(a, 'ai') + '<div class="rubric-workspace">' +
          '<div class="rw-col"><h2 class="rw-title">AI use rubric</h2><section class="panel ai-rubric-panel" id="rubric-editor"><div class="panel-header"><div>' + rubricTag('ai') + '<h2>' + esc(a.title) + '</h2><p>' + criteria(a.rubric.length) + '. You mark each one on every prompt step with Approve, Flag or Comment.</p></div></div>' + rubricEditor(a) + '</section>' + versionHistory(a) + '</div>' +
          '<div class="rw-col"><h2 class="rw-title">How it is used</h2>' + aiRubricHelp(a) + '</div>' +
        '</div>' + saveBar(a);
    }
    return heading('', 'Adjust Rubrics', '') + steps + body;
  }

  /** Flag rules and word lists (lab) plus the fixed test cases (tests) for one assignment. */
  function ruleLab(a) {
    const s = a.settings;
    const st = stats(a);
    const results = runCases(s);
    const passed = results.filter((x) => x.pass).length;
    const changedN = Object.keys(ui.caseChanged).length;
    const inRubric = (k) => a.rubric.some((x) => x.type === 'rule' && x.ruleKey === k);

    const ruleCards = (scope) => E.RULES.filter((r) => r.scope === scope).map((r) => {
      const cfg = s.rules[r.key];
      return '<article class="rule-card' + (cfg.enabled ? '' : ' off') + '">' +
        '<div class="rule-heading"><div class="rule-icon ' + RULE_ICONS[r.key] + '">' + (scope === 'interaction' ? ICON.chat : ICON.chart) + '</div>' +
          '<div><h3>' + esc(r.name) + (r.simulated ? ' <span class="sim"' + tip('Word-list checks like this misfire easily. Treat with care.') + '>Simulated</span>' : '') + '</h3><p>' + esc(r.describe(cfg)) + '</p>' +
          '<p class="rule-foot">' + (cfg.enabled ? '' : '<span>Turned off</span>') + (inRubric(r.key) ? '<span class="pill ok-pill"' + tip('Teachers mark this criterion on every step in the student review.') + '>In rubric</span>' : '') + '</p></div>' +
          '<label class="switch"' + tip(cfg.enabled ? 'Turn this rule off' : 'Turn this rule on') + '><input type="checkbox" class="rule-toggle" data-change="rule-bool" data-rule="' + r.key + '" data-field="enabled"' + (cfg.enabled ? ' checked' : '') + '><span></span><span class="sr">' + esc(r.name) + '</span></label></div>' +
        ruleControl(a, r) + '</article>';
    }).join('');

    const vocab = Object.keys(VOCAB_LABELS).map((k) =>
      '<label class="field vocab"><b>' + VOCAB_LABELS[k][0] + '</b> <span class="muted">' + VOCAB_LABELS[k][1] + ' One per line.</span><textarea rows="5" data-change="vocab" data-key="' + k + '">' + esc(s.vocab[k].join('\n')) + '</textarea></label>').join('');

    const cases = results.map(({ t, r, flags, pass }, k) => '<div class="case-row' + (ui.caseChanged[t.id] ? ' changed-row' : '') + '"' + tip('"' + (t.critique || '(empty)') + '" · ' + DECISIONS[t.decision].label + '. Expected level ' + t.expectedLevel + ' (' + flagNames(t.expectedFlags) + '). Got level ' + r.level.level + ' (' + flagNames(flags) + ').' + (t.note ? ' ' + t.note : '')) + '>' +
      '<span class="case-num">' + String(k + 1).padStart(2, '0') + '</span><span><strong>' + esc(t.title) + '</strong><small>Level ' + r.level.level + ' · ' + esc(flagNames(flags)) + '</small></span>' +
      '<span class="case-result ' + (pass ? 'clear' : 'flagged') + (ui.caseChanged[t.id] ? ' changed' : '') + '">' + (pass ? 'Pass' : 'Fail') + '</span></div>').join('');

    const impact = ui.lastImpact && ui.lastImpact.aid === a.id && ui.lastImpact.from !== st.flaggedStudents ? ' <span class="delta">was ' + ui.lastImpact.from + '</span>' : '';

    const copyRules = '<label class="copy-rules"' + tip('Replace these flag rules with another assignment\'s. Save to keep the change.') + '><span>Copy rules from</span><select class="select-control" data-change="copy-rules"><option value="">Choose an assignment…</option>' + myAssignments().filter((x) => x.id !== a.id).map((x) => '<option value="' + x.id + '">' + esc(course(x.courseId).code + ' · ' + x.short) + '</option>').join('') + '</select></label>';
    // Fixed test cases sit under the rubric's version history; the rest of the lab stays on the right.
    const tests = '<section class="panel test-results">' +
      '<div class="panel-header"><div><h2>Fixed test cases</h2><p>' + CASES.length + ' example reflections · expected results use the Standard preset</p></div><span class="test-status"><i class="' + (passed === CASES.length ? 'ok' : 'bad') + '"></i>' + passed + '/' + CASES.length + ' pass</span></div>' +
      '<div class="result-summary"><div' + tip('Cases whose level and flags match what we expect') + '><strong>' + passed + '</strong><span>pass</span></div><div' + tip('Cases treated differently from what we expect. Failing is useful: it shows what a rule change does.') + '><strong>' + (CASES.length - passed) + '</strong><span>fail</span></div><div' + tip('Cases whose result changed with your last edit') + '><strong>' + (changedN || '–') + '</strong><span>changed</span></div></div>' +
      '<div class="case-list">' + cases + '</div>' +
      '</section>';
    const lab = '<section class="panel rule-panel">' +
            '<div class="panel-header"><div><h2>Flag rules</h2><p>' + E.RULES.filter((r) => s.rules[r.key].enabled).length + ' of ' + E.RULES.length + ' rules on · ' + (E.PRESETS[s.preset] ? E.PRESETS[s.preset].label + ' preset' : 'Custom settings') + '</p></div>' +
              '<div class="filter-group" role="group" aria-label="Strictness preset">' + Object.keys(E.PRESETS).map((k) => '<button type="button" class="filter-button' + (s.preset === k ? ' active' : '') + '" data-action="preset" data-preset="' + k + '" aria-pressed="' + (s.preset === k) + '"' + tip(E.PRESETS[k].label + ': short reflection under ' + E.PRESETS[k].minWords + ' words, expected level ' + E.PRESETS[k].minLevel + ', shared wording ' + E.PRESETS[k].sharedPct + '%') + '>' + E.PRESETS[k].label + '</button>').join('') + '</div></div>' +
            '<div class="rule-tools"><p class="impact">With these rules, <b>' + st.flaggedStudents + ' of ' + st.active.length + '</b> students in ' + esc(a.short) + ' are flagged' + impact + '.</p>' + copyRules + '</div>' +
            '<h3 class="rule-group">Checks on each AI step</h3><div class="rule-list">' + ruleCards('interaction') + '</div>' +
            '<h3 class="rule-group">Checks across a student\'s whole log</h3><div class="rule-list">' + ruleCards('student') + '</div>' +
            '<details class="vocab-details"><summary>Word lists the rules use</summary><div class="vocab-grid">' + vocab + '</div><button type="button" class="ghost-button" data-action="reset-vocab">Restore default word lists</button></details>' +
          '</section>';
    return { lab, tests };
  }

  /** Pick rubric criteria for an assignment (used in Adjust Rubrics). */
  function rubricEditor(a) {
    const ruleRows = E.RULES.filter((r) => r.scope === 'interaction').map((r) => {
      const on = a.rubric.some((x) => x.type === 'rule' && x.ruleKey === r.key);
      return '<label class="crit-pick' + (on ? ' on' : '') + '"' + tip(r.describe(a.settings.rules[r.key])) + '><input type="checkbox" data-change="rubric-rule" data-rule="' + r.key + '"' + (on ? ' checked' : '') + '><span><b>' + esc(r.name) + '</b><small>' + esc(r.describe(a.settings.rules[r.key])) + '</small></span></label>';
    }).join('');
    const customs = a.rubric.filter((x) => x.type === 'custom').map((x) =>
      '<div class="crit-pick on custom"><span><b>' + esc(x.name) + '</b><small>' + esc(x.description || 'Marked by hand only.') + '</small></span><button type="button" class="text-button danger" data-action="remove-criterion" data-cid="' + esc(x.id) + '">Remove</button></div>').join('');
    const adding = ui.addCrit === 'editor';
    const addTile = adding
      ? '<form class="add-crit inline" data-form="add-criterion" data-aid="' + a.id + '"><label><span class="sr">Criterion name</span><input name="name" required maxlength="60" placeholder="Criterion name, e.g. Sources checked"></label><label><span class="sr">Description</span><input name="description" maxlength="200" placeholder="What you look for (optional)"></label><div class="add-crit-actions"><button type="button" class="text-button" data-action="toggle-add-crit" data-iid="editor">Cancel</button><button type="submit" class="secondary-button small">' + ICON.plus + 'Add criterion</button></div></form>'
      : '<button type="button" class="crit-add-tile" data-action="toggle-add-crit" data-iid="editor"><span class="add-card-plus" aria-hidden="true">+</span><span><b>Add a criterion</b><small>Name it and say what you look for</small></span></button>';
    return '<div class="panel-pad"><h3 class="rule-group">Auto-populated from the flag rules</h3><p class="muted small rule-group-note">Each one is checked automatically on every AI step. Untick any you don\'t want in this rubric.</p><div class="crit-grid">' + ruleRows + '</div>' +
      '<h3 class="rule-group">Your own criteria</h3><p class="muted small rule-group-note">Marked by hand, with no automatic check. Use + to add as many as you need.</p><div class="crit-grid">' + customs + addTile + '</div></div>';
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
    const tabs = [['courses', 'Courses', myCourses().length], ['assignments', 'Assignments', myAssignments().length], ['people', 'People', myStudents().length], ['canvas', 'Canvas & data', '']];
    const body = { courses: adminCourses, assignments: adminAssignments, people: adminPeople, canvas: adminCanvas }[ui.adminTab]();
    const action = { courses: '<button type="button" class="primary-button" data-action="new-course">' + ICON.plus + 'Add course</button>', assignments: '<button type="button" class="primary-button" data-action="new-assignment">' + ICON.plus + 'New assignment</button>', people: '<button type="button" class="secondary-button" data-action="import-students"' + tip('Enrol a whole class from a CSV file') + '>' + ICON.upload + 'Import CSV</button><button type="button" class="primary-button" data-action="new-student">' + ICON.plus + 'Add student</button>', canvas: '' }[ui.adminTab];
    // Export lives here now: it opens on the current assignment, or the first one the teacher has.
    const exportId = (owns((asg(ui.assignmentId) || {}).courseId) && ui.assignmentId) || (myAssignments()[0] || {}).id;
    const exportBtn = exportId ? '<button type="button" class="secondary-button" data-action="go" data-view="export" data-id="' + exportId + '"' + tip('CSV and PDF exports, rule settings, and a full backup') + '>' + ICON.download + 'Export</button>' : '';
    return heading('COURSE SETTINGS', 'Admin', 'Set up the classes you teach, their assignments and rubrics, and who is enrolled.', exportBtn + action) +
      '<section class="panel members-panel"><div class="tab-bar" role="tablist">' + tabs.map(([k, l, n]) => '<button type="button" role="tab" aria-selected="' + (ui.adminTab === k) + '" class="' + (ui.adminTab === k ? 'active' : '') + '" data-action="go" data-view="admin" data-id="' + k + '">' + l + (n !== '' ? ' <span>' + n + '</span>' : '') + '</button>').join('') + '</div>' + body + '</section>';
  }

  function adminCourses() {
    return '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>Badge</th><th>Course code</th><th>Name</th><th>Semester</th><th class="num">Students</th><th class="num">Assignments</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' +
      myCourses().map((c) => '<tr><td><input class="mini-input" maxlength="3" value="' + esc(c.badge) + '" data-change="course-field" data-cid="' + c.id + '" data-field="badge" aria-label="Badge for ' + esc(c.code) + '"></td>' +
        ['code', 'name', 'semester'].map((f) => '<td><input value="' + esc(c[f]) + '" data-change="course-field" data-cid="' + c.id + '" data-field="' + f + '" aria-label="' + f + ' for ' + esc(c.code) + '"></td>').join('') +
        '<td class="num">' + c.roster.length + '</td><td class="num">' + courseAssignments(c.id).length + '</td>' +
        '<td class="row-actions"><button type="button" class="secondary-button small" data-action="go" data-view="course" data-id="' + c.id + '">Open</button><button type="button" class="ghost-button small" data-action="new-assignment" data-course="' + c.id + '">' + ICON.plus + 'Assignment</button><button type="button" class="text-button danger" data-action="delete-course" data-cid="' + c.id + '">Remove</button></td></tr>').join('') +
      '</tbody></table></div>' + (myCourses().length ? '' : '<p class="panel-pad muted">No courses yet. Use Add course to set up your first class.</p>') + '<p class="panel-pad hint">You teach every course listed here. Removing a course also removes its assignments and their submissions; students stay in the People list.</p>';
  }

  function adminAssignments() {
    if (!myCourses().length) return '<p class="panel-pad muted">Add a course first, then set its assignments here.</p>';
    return myCourses().map((c) => {
      const list = courseAssignments(c.id);
      return '<div class="admin-group"><div class="admin-group-head"><span class="course-chip">' + esc(c.code) + '</span><strong>' + esc(c.name) + '</strong><button type="button" class="ghost-button small" data-action="new-assignment" data-course="' + c.id + '">' + ICON.plus + 'New assignment</button></div>' +
        (list.length ? '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>Assignment</th><th>Due</th><th>Status</th><th>Rubric</th><th>Rules</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' +
          list.map((a) => '<tr><td><strong>' + esc(a.short) + '</strong><small class="sub-line">' + esc(trunc(a.title, 70)) + '</small></td><td>' + fmtDay(a.dueDate) + '</td><td><span class="status-pill ' + (isOpen(a) ? 'ready' : 'reviewed') + '">' + (isOpen(a) ? 'Open' : 'Closed') + '</span></td>' +
            '<td' + tip(a.rubric.map((x) => criterionInfo(a, x).name).join(' · ') || 'No criteria') + '>' + plural(a.rubric.length, 'criterion', 'criteria') + '</td><td>' + (E.PRESETS[a.settings.preset] ? E.PRESETS[a.settings.preset].label : 'Custom') + '</td>' +
            '<td class="row-actions"><button type="button" class="secondary-button small" data-action="edit-assignment" data-aid="' + a.id + '">Edit</button><button type="button" class="ghost-button small" data-action="go" data-view="rules" data-id="' + a.id + '">' + ICON.flask + 'Rubric</button><button type="button" class="ghost-button small" data-action="copy-embed" data-aid="' + a.id + '"' + tip('Copy a link that shows this assignment\'s dashboard without the sidebar, for a Canvas page or module.') + '>' + ICON.link + 'Canvas link</button><button type="button" class="text-button danger" data-action="delete-assignment" data-aid="' + a.id + '">Remove</button></td></tr>').join('') +
          '</tbody></table></div>' : '<p class="panel-pad muted">No assignments yet.</p>') + '</div>';
    }).join('');
  }

  function adminPeople() {
    const cid = ui.peopleCourse;
    const c = course(cid);
    const tabs = [['all', 'All students']].concat(myCourses().map((x) => [x.id, x.code]), [['staff', 'Teaching staff']]);
    const filter = '<div class="sub-tabs">' + tabs.map(([k, l]) => '<button type="button" class="filter-button' + (cid === k ? ' active' : '') + '" data-action="people-course" data-id="' + k + '">' + esc(l) + '</button>').join('') + '</div>';
    if (cid === 'staff') {
      return filter + '<div class="member-list">' + state.staff.filter((m) => m.name === me().name || m.courses.some(owns)).map((m) => '<div class="member-row"><div class="member-info"><span class="avatar avatar-navy">' + esc(m.initials) + '</span><span><strong>' + esc(m.name) + '</strong><small>' + esc(m.role) + '</small></span></div><span>' + m.courses.filter(owns).map((x) => course(x) ? '<span class="course-chip">' + esc(course(x).code) + '</span>' : '').join(' ') + '</span><span class="role-badge teacher">' + esc(m.role) + '</span><span class="active-badge">Active</span></div>').join('') + '</div>';
    }
    const list = c && owns(c.id) ? c.roster.map((r) => ({ p: person(r.studentId), group: r.group })).filter((x) => x.p) : myStudents().map((p) => ({ p }));
    return filter + '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>First name</th><th>Last name</th><th>UPI</th><th>Email</th>' + (c ? '<th>Group</th>' : '<th>Courses</th>') + '<th><span class="sr">Actions</span></th></tr></thead><tbody>' +
      list.map(({ p, group }) => '<tr>' + ['firstName', 'lastName', 'upi', 'email'].map((f) => '<td><input value="' + esc(p[f]) + '" data-change="student-field" data-pid="' + p.id + '" data-field="' + f + '"' + (f === 'email' ? ' type="email"' : '') + ' aria-label="' + f + ' for ' + esc(fullName(p)) + '"></td>').join('') +
        (c ? '<td><input class="mini-input wide" value="' + esc(group) + '" data-change="roster-group" data-cid="' + c.id + '" data-pid="' + p.id + '" aria-label="Group for ' + esc(fullName(p)) + '"></td><td class="row-actions"><button type="button" class="text-button danger" data-action="unenrol" data-cid="' + c.id + '" data-pid="' + p.id + '">Remove from course</button></td>'
          : '<td>' + myCourses().filter((x) => x.roster.some((r) => r.studentId === p.id)).map((x) => '<span class="course-chip">' + esc(x.code) + '</span>').join(' ') + '</td><td class="row-actions"><button type="button" class="text-button danger" data-action="delete-student" data-pid="' + p.id + '">Delete</button></td>') + '</tr>').join('') +
      '</tbody></table></div>' + (list.length ? '' : '<p class="panel-pad muted">No students yet.</p>');
  }

  function adminCanvas() {
    return '<div class="panel-pad canvas-pad">' +
      '<div class="info-banner">' + ICON.link + '<p><strong>Use it inside Canvas.</strong> Each assignment has an embed link that opens its marking page without the Trace sidebar. Paste it into a Canvas page, module item or Redirect tool. A full integration would use LTI 1.3 so Canvas handles login and the class list (see docs/canvas-lti.md).</p></div>' +
      '<div class="table-scroll"><table class="grid-table admin"><thead><tr><th>Assignment</th><th>Embed link</th><th><span class="sr">Copy</span></th></tr></thead><tbody>' +
      myAssignments().sort(byDue).map((a) => '<tr><td><span class="course-chip">' + esc(course(a.courseId).code) + '</span> ' + esc(a.short) + '</td><td><input readonly value="' + esc(embedUrl(a)) + '" aria-label="Embed link for ' + esc(a.short) + '"></td><td><button type="button" class="secondary-button small" data-action="copy-embed" data-aid="' + a.id + '">Copy</button></td></tr>').join('') +
      '</tbody></table></div>' +
      '<h3 class="rule-group">Data</h3><p>' + (mode === 'backend' ? 'Changes are saved to Supabase through the authenticated Trace API and protected by course-scoped access policies.' : mode === 'server' ? 'Changes are saved to <code>data/db.json</code> by the local server.' : 'The server is not running, so changes are saved in this browser only. Run <code>node server.js</code> to save to a file.') + ' All students and conversations are synthetic.</p>' +
      '<div class="heading-actions"><button type="button" class="secondary-button" data-action="export-json">Download backup</button><button type="button" class="ghost-button" data-action="reset-demo">Reset to demo data</button></div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Modals                                                              */
  /* ------------------------------------------------------------------ */
  function openModal(eyebrow, title, intro, body, small) {
    $('#modalRoot').innerHTML = '<div class="modal-backdrop open" data-action="modal-backdrop"><div class="modal' + (small ? ' small-modal' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
      '<div class="modal-header"><div><h2 id="modalTitle">' + title + '</h2>' + (intro ? '<p>' + intro + '</p>' : '') + '</div><button type="button" class="icon-button" data-action="close-modal" aria-label="Close">×</button></div>' + body + '</div></div>';
    setTimeout(() => { const f = $('#modalRoot input:not([type=hidden]), #modalRoot select, #modalRoot textarea'); if (f) f.focus(); }, 60);
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }

  /** Edit an existing assignment (new ones use the two-page New assignment view). */
  function assignmentForm(a) {
    const picked = (k) => a.rubric.some((x) => x.type === 'rule' && x.ruleKey === k);
    const customs = a.rubric.filter((x) => x.type === 'custom').map((x) => x.name + (x.description ? ': ' + x.description : '')).join('\n');
    const body = '<form data-form="edit-assignment" data-aid="' + a.id + '">' +
      '<div class="form-grid"><label>Course<select name="courseId" required>' + myCourses().map((c) => '<option value="' + c.id + '"' + (c.id === a.courseId ? ' selected' : '') + '>' + esc(c.code + ' · ' + c.name) + '</option>').join('') + '</select></label>' +
      '<label>Short name<input name="short" required maxlength="24" value="' + esc(a.short) + '" placeholder="e.g. Report 3"></label></div>' +
      '<label>Title<input name="title" required value="' + esc(a.title) + '" placeholder="e.g. Report 3: Implementation plan"></label>' +
      '<div class="form-grid"><label>Due date<input name="dueDate" type="date" required value="' + esc(a.dueDate) + '"></label><label>Word limit <span class="optional">(optional)</span><input name="wordLimit" type="number" min="0" value="' + esc(a.wordLimit || '') + '"></label></div>' +
      '<label>Instructions for students<textarea name="description" rows="2">' + esc(a.description) + '</textarea></label>' +
      '<fieldset class="crit-fieldset"><legend>Rubric criteria <span class="optional">(teachers mark these on every AI step)</span></legend><div class="crit-grid">' +
        E.RULES.filter((r) => r.scope === 'interaction').map((r) => '<label class="crit-pick' + (picked(r.key) ? ' on' : '') + '"><input type="checkbox" name="rule" value="' + r.key + '"' + (picked(r.key) ? ' checked' : '') + '><span><b>' + esc(r.name) + '</b><small>' + esc(r.describe(a.settings.rules[r.key])) + '</small></span></label>').join('') +
      '</div><label>Your own criteria <span class="optional">(one per line, "Name: what to look for")</span><textarea name="custom" rows="3" placeholder="Sources checked: claims from the AI were checked against a reliable source">' + esc(customs) + '</textarea></label></fieldset>' +
      '<div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">' + 'Save changes' + '</button></div></form>';
    openModal('EDIT ASSIGNMENT', 'Edit ' + esc(a.short), '', body);
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

  /* ---------- Class list import (CSV) ---------- */
  let csvImport = null;
  const CSV_TEMPLATE = [['First name', 'Last name', 'UPI', 'Email', 'Group'], ['Aroha', 'Ngata', 'angat001', 'angat001@aucklanduni.ac.nz', 'Tutorial A'], ['Liam', 'Chen', 'lche002', 'lche002@aucklanduni.ac.nz', 'Tutorial B']];

  /** Splits CSV text into rows of cells. Handles quoted cells, "" escapes and line breaks inside quotes. */
  function parseCsv(text) {
    const rows = []; let row = []; let cell = ''; let quoted = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
  }

  /** Turns CSV rows into students. Reads a header row when there is one; otherwise expects First name, Last name, UPI, Email, Group. */
  function studentsFromCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { students: [], skipped: 0, error: 'The file is empty.' };
    const ALIASES = {
      first: ['firstname', 'first', 'givenname', 'given', 'preferredname'],
      last: ['lastname', 'last', 'surname', 'familyname'],
      name: ['name', 'fullname', 'studentname', 'student'],
      upi: ['upi', 'sisloginid', 'username', 'login', 'studentid', 'studentnumber', 'sisuserid', 'id'],
      email: ['email', 'emailaddress', 'mail', 'universityemail'],
      group: ['group', 'tutorial', 'tutorialgroup', 'section', 'stream', 'class']
    };
    const head = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
    const col = {};
    // Aliases are in priority order, so "SIS Login ID" beats Canvas's internal "ID".
    Object.keys(ALIASES).forEach((k) => { const hit = ALIASES[k].find((name) => head.includes(name)); if (hit) col[k] = head.indexOf(hit); });
    const hasHeader = col.first != null || col.name != null;
    if (!hasHeader) Object.assign(col, { first: 0, last: 1, upi: 2, email: 3, group: 4 });
    const body = hasHeader ? rows.slice(1) : rows;
    const seen = new Set(); const students = []; let skipped = 0;
    body.forEach((r) => {
      const get = (k) => (col[k] != null ? String(r[col[k]] || '').trim() : '');
      let first = get('first'); let last = get('last');
      if (!first && get('name')) {
        const n = get('name');
        // Canvas exports names as "Last, First".
        if (n.includes(',')) { last = n.split(',')[0].trim(); first = n.split(',').slice(1).join(',').trim(); }
        else { const parts = n.split(/\s+/); first = parts.shift(); last = parts.join(' '); }
      }
      if (!first || /^points possible$/i.test((first + ' ' + last).trim())) { skipped++; return; }
      const upi = get('upi'); const email = get('email');
      const key = (upi || email || first + ' ' + last).toLowerCase();
      if (seen.has(key)) { skipped++; return; }
      seen.add(key);
      students.push({ firstName: first.slice(0, 100), lastName: last.slice(0, 100), upi: upi.slice(0, 100), email: email.slice(0, 320), group: get('group').slice(0, 100) });
    });
    return { students, skipped, error: students.length ? '' : 'No students found. Check the file has a First name column (or one name per row).' };
  }

  /** An existing student who matches an imported row by UPI or email. */
  function matchStudent(row) {
    const low = (v) => String(v || '').trim().toLowerCase();
    return myStudents().find((p) => (row.upi && low(p.upi) === low(row.upi)) || (row.email && low(p.email) === low(row.email))) || null;
  }

  function renderCsvPreview() {
    const box = $('#csvPreview'); const btn = $('#modalRoot [data-form=import-students] button[type=submit]');
    if (!box) return;
    if (!csvImport) { box.innerHTML = ''; if (btn) btn.disabled = true; return; }
    const { students, skipped, error, fileName } = csvImport;
    if (btn) btn.disabled = !students.length;
    if (error) { box.innerHTML = '<div class="import-state bad">' + ICON.alert + '<div><strong>' + esc(fileName) + '</strong><span>' + esc(error) + '</span></div></div>'; return; }
    const existing = students.filter(matchStudent).length;
    const names = students.slice(0, 4).map((x) => (x.firstName + ' ' + x.lastName).trim()).join(', ') + (students.length > 4 ? ' and ' + (students.length - 4) + ' more' : '');
    box.innerHTML = '<div class="import-state success">' + ICON.check + '<div><strong>' + plural(students.length, 'student') + ' ready to import from ' + esc(fileName) + '</strong>' +
      '<span>' + esc(names) + '</span>' +
      (existing || skipped ? '<span>' + [existing ? plural(existing, 'student') + ' already in your list will be enrolled, not duplicated' : '', skipped ? plural(skipped, 'row') + ' skipped (blank, duplicate or missing a first name)' : ''].filter(Boolean).join(' · ') + '</span>' : '') +
      '</div></div>';
  }

  const FORMS = {
    login: async (f, fd) => {
      if (mode === 'backend') {
        ui.authError = '';
        if (!isUniversityEmail(String(fd.get('email') || ''))) {
          ui.authError = 'Use an @aucklanduni.ac.nz or @auckland.ac.nz email address.';
          renderAuth();
          return;
        }
        try {
          await API.login(String(fd.get('email') || '').trim(), String(fd.get('password') || ''));
          const user = await loadRemoteWorkspace();
          signIn(me());
          toast('Logged in as ' + user.displayName + '.');
        } catch (e) { API.logout(); setSession(null); ui.authError = e.message; renderAuth(); }
        return;
      }
      const name = String(fd.get('username') || '').trim().toLowerCase();
      const asStudent = fd.get('role') === 'student';
      const match = state.users.find((x) => x.username.toLowerCase() === name && x.password === fd.get('password'));
      const u = match && (match.type === 'student') === asStudent ? match : null;
      if (!u) {
        ui.authError = match ? (asStudent ? 'That is a teacher account. Choose Teacher above to log in.' : 'That is a student account. Choose Student above to log in.') : 'That username and password do not match an account.';
        renderAuth(); return;
      }
      signIn(u);
      toast('Logged in as ' + u.name + '.');
    },
    signup: async (f, fd) => {
      const get = (k) => String(fd.get(k) || '').trim();
      if (!isUniversityEmail(get('email'))) {
        ui.authError = 'Use an @aucklanduni.ac.nz or @auckland.ac.nz email address.';
        renderAuth();
        return;
      }
      if (mode === 'backend') {
        ui.authError = '';
        try {
          const result = await API.signup({ email: get('email'), password: String(fd.get('password') || ''), firstName: get('first'), lastName: get('last'), role: get('role') });
          if (result.requiresEmailConfirmation) {
            ui.authTab = 'login';
            ui.authError = 'Account created. Check your email to confirm it, then log in.';
            renderAuth();
            return;
          }
          await loadRemoteWorkspace();
          signIn(me());
          toast('Welcome, ' + get('first') + '.');
        } catch (e) { ui.authError = e.message; renderAuth(); }
        return;
      }
      const username = get('username').toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) { ui.authError = 'Usernames use 3 to 30 letters, numbers, dots, dashes or underscores.'; renderAuth(); return; }
      if (state.users.some((x) => x.username.toLowerCase() === username)) { ui.authError = 'That username is taken. Try another, or log in.'; renderAuth(); return; }
      if (String(fd.get('password') || '').length < 6) { ui.authError = 'Use a password of at least 6 characters.'; renderAuth(); return; }
      const first = get('first'); const last = get('last');
      const u = { id: uid('u-'), username, password: String(fd.get('password')), name: (first + ' ' + last).trim(), first, initials: ((first[0] || '') + (last[0] || '')).toUpperCase() || '?', role: get('role') || 'Lecturer', email: get('email'), courses: [] };
      state.users.push(u);
      state.staff.push({ name: u.name, initials: u.initials, role: u.role, courses: [] });
      save();
      signIn(u);
      toast('Welcome, ' + first + '. Start by adding a course you teach.');
    },
    'edit-assignment': async (f, fd) => {
      const a = asg(f.dataset.aid);
      const newCourse = fd.get('courseId');
      if (newCourse !== a.courseId && asgSubs(a.id).some((s) => s.stage !== 'not_started')) { toast('Students have already started this assignment, so it cannot move to another course.', true); return; }
      if (mode === 'backend') {
        const next = clone(a);
        Object.assign(next, { courseId: newCourse, title: fd.get('title').trim(), short: fd.get('short').trim(), description: fd.get('description').trim(), dueDate: fd.get('dueDate'), wordLimit: Number(fd.get('wordLimit')) || 0 });
        next.rubric = rubricFromForm(fd, a.rubric);
        await remoteMutation(() => API.put('/assignments/' + a.id, assignmentPayload(next)), () => {
          closeModal(); render(); toast(next.short + ' saved.');
        });
        return;
      }
      if (newCourse !== a.courseId) { state.submissions = state.submissions.filter((s) => s.assignmentId !== a.id); a.courseId = newCourse; course(newCourse).roster.forEach((r) => state.submissions.push(emptySubmission(a, r.studentId))); }
      Object.assign(a, { title: fd.get('title').trim(), short: fd.get('short').trim(), description: fd.get('description').trim(), dueDate: fd.get('dueDate'), wordLimit: Number(fd.get('wordLimit')) || 0 });
      ensureVersions(a);
      a.rubric = rubricFromForm(fd, a.rubric);
      commitVersion(a, 'Edited in the assignment settings');
      closeModal(); save(); render(); toast(a.short + ' saved.');
    },
    'new-course': async (f, fd) => {
      const code = fd.get('code').trim();
      const c = { id: uid('c-'), code, name: fd.get('name').trim(), semester: fd.get('semester').trim(), badge: (code.replace(/[^A-Za-z]/g, '').slice(0, 2) || 'C').toUpperCase(), roster: [] };
      if (mode === 'backend') {
        await remoteMutation(() => API.post('/courses', { code: c.code, name: c.name, semester: c.semester, badge: c.badge }), (result) => {
          if (!result) return;
          closeModal(); go('course', result.course.id); toast(code + ' added. Add students and assignments next.');
        });
        return;
      }
      state.courses.push(c);
      me().courses.push(c.id);
      const staff = state.staff.find((m) => m.name === me().name); if (staff) staff.courses.push(c.id);
      closeModal(); save(); go('course', c.id); toast(code + ' added. Add students and assignments next.');
    },
    logout: () => ACTIONS['confirm-logout'](),
    'import-students': async (f, fd) => {
      const c = course(fd.get('courseId'));
      if (!c) { toast('Choose a course first.', true); return; }
      if (!csvImport || !csvImport.students.length) { toast('Choose a CSV file with at least one student.', true); return; }
      const fallbackGroup = String(fd.get('group') || '').trim() || 'Tutorial A';
      const rows = csvImport.students;
      if (mode === 'backend') {
        let failed = 0;
        await remoteMutation(async () => {
          for (const row of rows) {
            const p = matchStudent(row);
            const payload = Object.assign({ groupName: row.group || fallbackGroup }, p ? { studentId: p.id } : { firstName: row.firstName, lastName: row.lastName, institutionalId: row.upi, email: row.email });
            try { await API.post('/courses/' + c.id + '/enrolments', payload); } catch (e) { failed++; }
          }
        }, () => {
          csvImport = null; closeModal(); render();
          toast(plural(rows.length - failed, 'student') + ' imported into ' + c.code + '.' + (failed ? ' ' + failed + ' could not be added (they may already be enrolled).' : ''), !!failed);
        });
        return;
      }
      let created = 0; let added = 0; let already = 0;
      rows.forEach((row, n) => {
        let p = matchStudent(row);
        if (!p) {
          p = { id: uid('p'), createdBy: me().id, firstName: row.firstName, lastName: row.lastName, upi: row.upi, email: row.email, avatar: ['avatar-rose', 'avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-gold'][(state.students.length + n) % 5] };
          state.students.push(p); created++;
        }
        if (enrol(c, p.id, row.group || fallbackGroup)) added++; else already++;
      });
      csvImport = null; closeModal(); save(); render();
      toast(plural(added, 'student') + ' enrolled in ' + c.code + (created < added ? ' (' + created + ' new)' : '') + '.' + (already ? ' ' + plural(already, 'student') + ' already enrolled.' : ''));
    },
    'new-student': async (f, fd) => {
      const c = course(fd.get('courseId'));
      let p = person(fd.get('existing'));
      if (mode === 'backend') {
        const first = String(fd.get('firstName') || '').trim();
        if (!p && !first) { toast('Choose an existing student or enter a first name.', true); return; }
        const payload = {
          groupName: String(fd.get('group') || '').trim(),
          ...(p ? { studentId: p.id } : {
            firstName: first,
            lastName: String(fd.get('lastName') || '').trim(),
            institutionalId: String(fd.get('upi') || '').trim(),
            email: String(fd.get('email') || '').trim()
          })
        };
        const label = p ? fullName(p) : (first + ' ' + String(fd.get('lastName') || '').trim()).trim();
        await remoteMutation(() => API.post('/courses/' + c.id + '/enrolments', payload), () => {
          closeModal(); render(); toast(label + ' enrolled in ' + c.code + '.');
        });
        return;
      }
      if (!p) {
        const first = fd.get('firstName').trim(); const last = fd.get('lastName').trim();
        if (!first) { toast('Choose an existing student or enter a first name.', true); return; }
        p = { id: uid('p'), createdBy: me().id, firstName: first, lastName: last, upi: fd.get('upi').trim(), email: fd.get('email').trim(), avatar: ['avatar-rose', 'avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-gold'][state.students.length % 5] };
        state.students.push(p);
      }
      const added = c ? enrol(c, p.id, fd.get('group').trim()) : false;
      closeModal(); save(); render();
      toast(c ? (added ? fullName(p) + ' enrolled in ' + c.code + '.' : fullName(p) + ' is already in ' + c.code + '.') : fullName(p) + ' added.');
    },
    'add-criterion': (f, fd) => {
      const a = asg(f.dataset.aid || ui.assignmentId);
      const onRubricPage = isRulesView(ui.view);
      if (!onRubricPage) ensureVersions(a);
      a.rubric.push({ id: uid('cr-'), type: 'custom', name: fd.get('name').trim().slice(0, 60), description: fd.get('description').trim() });
      // On Adjust Rubrics this waits for Save; from a student review it is saved as a new version straight away.
      if (!onRubricPage) commitVersion(a, 'Added during a student review');
      ui.addCrit = null;
      if (mode === 'backend') pendingRemoteAssignmentId = a.id;
      save(); render(); toast('Criterion added to the ' + a.short + ' rubric.');
      const ed = $('#rubric-editor'); if (ed) ed.scrollIntoView({ block: 'nearest' });
    }
  };


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
  /* Student view: my courses → a course → one assignment → hand in      */
  /* ------------------------------------------------------------------ */
  const AI_TOOLS = {
    chatgpt: { name: 'ChatGPT', open: 'Go to <b>chatgpt.com</b> and open the chat from the list on the left.' },
    copilot: { name: 'Microsoft Copilot', open: 'Open <b>Copilot</b> and choose the chat from your conversation history.' },
    claude: { name: 'Claude', open: 'Go to <b>claude.ai</b> and open the chat from your recent chats.' },
    gemini: { name: 'Gemini', open: 'Go to <b>gemini.google.com</b> and open the chat from your recent chats.' },
    other: { name: 'Another AI tool', open: 'Open the chat you used for this assignment.' }
  };
  const toolKey = (name) => Object.keys(AI_TOOLS).find((k) => AI_TOOLS[k].name === name || (k === 'copilot' && name === 'Copilot')) || 'chatgpt';

  const myStudentId = () => (me() || {}).studentId;
  const stuCourses = () => state.courses.filter((c) => c.roster.some((r) => r.studentId === myStudentId()));
  const takes = (cid) => stuCourses().some((c) => c.id === cid);
  const mySub = (aid) => state.submissions.find((s) => s.assignmentId === aid && s.studentId === myStudentId());
  const myGroup = (c) => { const r = c.roster.find((x) => x.studentId === myStudentId()); return r ? r.group : ''; };
  const fileExt = (name) => { const m = /\.[a-z0-9]+$/i.exec(name || ''); return m ? m[0].toLowerCase() : ''; };
  const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const logCountText = (text) => { const n = E.wordCount(text || ''); return n ? plural(n, 'word') + ' pasted' : 'Nothing pasted yet'; };

  /** Where one assignment stands for the signed-in student. */
  function stuStatus(a, s) {
    if (s && s.stage === 'handed_in') return { key: 'in', label: 'Handed in', cls: 'stage-in', text: 'Handed in ' + fmtDate(s.handedInAt) };
    if (!isOpen(a)) return { key: 'missed', label: 'Not handed in', cls: 'stage-none', text: 'Closed ' + fmtDay(a.dueDate) };
    if (s && s.stage === 'logs_attached') return { key: 'log', label: 'AI log saved', cls: 'stage-logs', text: 'Add your file to hand in · ' + dueText(a) };
    return { key: 'todo', label: 'To hand in', cls: 'stage-none', text: dueText(a) };
  }
  const stuPill = (st) => '<span class="stage-pill ' + st.cls + '"' + tip(st.text) + '>' + st.label + '</span>';

  /** A log attached before this view existed came in as steps; show it as text so it can be handed in as is. */
  function stepsAsText(s) {
    return (s.interactions || []).map((i) => 'You said:\n' + i.prompt + '\n\n' + (i.tool || 'AI') + ' said:\n' + i.output).join('\n\n');
  }

  function newStuDraft(a) {
    const s = mySub(a.id);
    const prefill = s ? (s.chatLog || stepsAsText(s)) : '';
    return {
      aid: a.id,
      editing: !s || s.stage !== 'handed_in',
      file: s && s.file ? { keep: true, meta: s.file, name: s.file.name, size: s.file.size } : null,
      log: prefill, prefill,
      tool: toolKey(s && s.sources[0] && s.sources[0].tool),
      error: '', busy: false
    };
  }

  function setStudentContext(view, id) {
    const a = asg(id);
    if (view === 'student') ui.courseId = null;
    else if (view === 'scourse' && takes(id)) ui.courseId = id;
    else if (view === 'sasg' && a && takes(a.courseId)) {
      ui.assignmentId = id; ui.courseId = a.courseId;
      if (!ui.stu || ui.stu.aid !== id) ui.stu = newStuDraft(a);
    } else ui.view = 'student';
  }

  function renderStudentSidebar() {
    const c = course(ui.courseId);
    $('#courseBadge').textContent = c ? c.badge : '··';
    $('#courseCode').textContent = c ? c.code : 'All courses';
    $('#courseSemester').textContent = c ? c.name : 'Choose a course';
    $('#courseButton').setAttribute('aria-expanded', String(ui.courseMenu));
    const menu = $('#courseMenu');
    menu.hidden = !ui.courseMenu;
    menu.innerHTML = '<button type="button" role="option" class="course-option' + (!c ? ' on' : '') + '" data-action="pick-course" data-id=""><span class="course-code small">★</span><span><strong>All courses</strong><small>Everything you take</small></span></button>' +
      stuCourses().map((x) => {
        const todo = courseAssignments(x.id).filter((a) => ['todo', 'log'].includes(stuStatus(a, mySub(a.id)).key)).length;
        return '<button type="button" role="option" class="course-option' + (c && c.id === x.id ? ' on' : '') + '" data-action="pick-course" data-id="' + x.id + '"><span class="course-code small">' + esc(x.badge) + '</span><span><strong>' + esc(x.code) + '</strong><small>' + esc(x.name) + '</small></span>' + (todo ? '<span class="nav-count"' + tip(plural(todo, 'assignment') + ' still to hand in') + '>' + todo + '</span>' : '') + '</button>';
      }).join('');
    $$('.nav-item[data-nav]').forEach((n) => {
      const on = n.dataset.nav === 'student';
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    const u = me();
    const p = person(u.studentId);
    $('#profileInitials').textContent = u.initials;
    $('#profileName').textContent = u.name;
    $('#profileRole').textContent = 'Student' + (p && p.upi ? ' · ' + p.upi : '');
  }

  function renderStudentCrumbs() {
    const parts = [['student', '', 'My courses']];
    const c = course(ui.courseId);
    const a = asg(ui.assignmentId);
    if ((ui.view === 'scourse' || ui.view === 'sasg') && c) parts.push(['scourse', c.id, c.code]);
    if (ui.view === 'sasg' && a) parts.push(['sasg', a.id, a.short]);
    $('#crumbs').innerHTML = parts.map((p, i) => i === parts.length - 1
      ? '<span aria-current="page">' + esc(p[2]) + '</span>'
      : '<button type="button" class="crumb" data-action="go" data-view="' + p[0] + '" data-id="' + esc(p[1]) + '">' + esc(p[2]) + '</button><span class="crumb-sep" aria-hidden="true">›</span>').join('');
  }

  /* ---- My courses ---- */
  function viewStudentHome() {
    const mine = stuCourses();
    if (!mine.length) return emptyState('You are not enrolled in any courses yet. Your teacher adds you to a course in Trace.');
    return '<section class="section-block"><div class="section-title"><h2>Your courses</h2></div><div class="course-grid">' + mine.map(stuCourseCard).join('') + '</div></section>' +
      '<p class="disclaimer">Synthetic data only. Hand in your work and your AI chat log here. Your teacher reads both when marking.</p>';
  }

  function stuCourseCard(c) {
    const list = courseAssignments(c.id);
    const rows = list.map((a) => ({ a, st: stuStatus(a, mySub(a.id)) }));
    const handed = rows.filter((x) => x.st.key === 'in').length;
    const todo = rows.filter((x) => x.st.key === 'todo' || x.st.key === 'log');
    const open = list.filter(isOpen);
    const next = todo[0];
    const stat = (value, label, sub, t, cls) => '<span class="cc-stat' + (cls ? ' ' + cls : '') + '"' + tip(t) + '><b>' + value + '</b><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>';
    return '<button type="button" class="course-card" data-action="go" data-view="scourse" data-id="' + c.id + '"' + tip('Open ' + c.code + ' to see its assignments') + '>' +
      '<span class="cc-top"><span class="course-code big">' + esc(c.badge) + '</span>' + (todo.length ? '<span class="pill count-pill">' + todo.length + ' to hand in</span>' : '<span class="pill ok-pill">Up to date</span>') + '</span>' +
      '<strong>' + esc(c.code) + '</strong><span class="cc-name">' + esc(c.name) + '</span>' +
      '<span class="cc-grid three">' +
        stat(open.length, 'Open', 'of ' + list.length, 'Assignments whose due date has not passed.') +
        stat(todo.length, 'To hand in', todo.length ? 'still open' : 'none left', 'Open assignments you have not handed in yet.', todo.length ? 'warn' : '') +
        stat(handed, 'Handed in', 'of ' + list.length, 'Assignments you have handed in.', 'received') +
      '</span>' +
      '<span class="meter teal"><i style="width:' + (list.length ? handed / list.length * 100 : 0) + '%"></i></span>' +
      '<small>' + handed + ' of ' + list.length + ' assignments handed in</small>' +
      '<small class="cc-next">' + (next ? 'Next due: ' + esc(next.a.short) + ' · ' + fmtDay(next.a.dueDate) : 'Nothing left to hand in') + '</small></button>';
  }

  /* ---- One course ---- */
  function viewStudentCourse() {
    const c = course(ui.courseId);
    if (!c) return emptyState('Choose a course from the sidebar.');
    const list = courseAssignments(c.id);
    const rows = list.map((a) => {
      const s = mySub(a.id);
      const st = stuStatus(a, s);
      const cta = st.key === 'todo' || st.key === 'log'
        ? '<button type="button" class="primary-button mark-cta" data-action="go" data-view="sasg" data-id="' + a.id + '">Hand in <span>→</span></button>'
        : '<button type="button" class="secondary-button small" data-action="go" data-view="sasg" data-id="' + a.id + '">' + (st.key === 'in' && isOpen(a) ? 'View or replace' : 'View') + ' <span>→</span></button>';
      return '<article class="asg-row stu-row">' +
        '<div class="asg-main">' +
          '<span class="asg-icon ' + (isOpen(a) ? 'open' : 'closed') + '">' + ICON.doc + '</span>' +
          '<span class="asg-text"><strong>' + esc(a.title) + '</strong><small>' + esc(trunc(a.description, 140)) + '</small>' +
          '<span class="asg-meta"><span>Due ' + fmtDay(a.dueDate) + '</span><span>' + dueText(a) + '</span>' + (a.wordLimit ? '<span>' + a.wordLimit + ' words</span>' : '') + '</span></span>' +
        '</div>' +
        '<div class="stu-status">' + stuPill(st) + '<small>' + esc(st.text) + '</small></div>' +
        '<div class="asg-actions">' + cta + '</div>' +
      '</article>';
    }).join('') || emptyState('This course has no assignments yet.');
    const todo = list.filter((a) => ['todo', 'log'].includes(stuStatus(a, mySub(a.id)).key)).length;
    const group = myGroup(c);
    return heading('', esc(c.name), esc(c.code) + ' · ' + esc(c.semester) + (group ? ' · ' + esc(group) : '')) +
      '<section class="panel">' +
        '<div class="panel-header"><div><div class="title-row"><h2>Assignments</h2><span class="pill count-pill">' + list.length + '</span></div><p>' + (todo ? plural(todo, 'assignment') + ' still to hand in.' : 'Nothing left to hand in for this course.') + ' Open an assignment to hand in your work and your AI chat log.</p></div></div>' +
        '<div class="asg-list">' + rows + '</div>' +
      '</section>';
  }

  /* ---- One assignment: details and hand-in ---- */
  function viewStudentAssignment() {
    const a = asg(ui.assignmentId);
    if (!a) return emptyState('That assignment no longer exists.');
    const c = course(a.courseId);
    const s = mySub(a.id);
    const st = stuStatus(a, s);
    const d = ui.stu;
    const open = isOpen(a);

    let main;
    if (!open && st.key !== 'in') main = '<div class="info-banner warn">' + ICON.alert + '<p><strong>This assignment closed on ' + fmtDay(a.dueDate) + '.</strong> Talk to your teacher if you need to hand in late.</p></div>';
    else if (st.key === 'in' && !d.editing) main = stuSummary(a, s, open);
    else main = (st.key === 'log' ? '<div class="info-banner logs">' + ICON.info + '<p><strong>You saved an AI log on ' + fmtDate(s.logsAttachedAt) + '.</strong> It is filled in below. Add your assignment file, check the log, then hand in.</p></div>' : '') + stuForm(a, s, d);

    const about = '<aside class="stu-aside"><section class="panel stu-about"><div class="panel-header compact"><div><h2>About this assignment</h2></div></div><div class="panel-pad">' +
      (a.description ? '<p>' + esc(a.description) + '</p>' : '') +
      '<dl><dt>Course</dt><dd>' + esc(c.code) + '</dd><dt>Due</dt><dd>' + fmtDay(a.dueDate) + '</dd><dt>Status</dt><dd>' + stuPill(st) + '</dd>' + (a.wordLimit ? '<dt>Word limit</dt><dd>' + a.wordLimit + ' words</dd>' : '') + '<dt>Hand in</dt><dd>Your file and your AI chat log</dd></dl>' +
      '</div></section></aside>';

    return heading('', esc(a.title), esc(c.code) + ' · Due ' + fmtDay(a.dueDate) + ' · ' + dueText(a)) +
      '<div class="stu-layout"><div class="stu-main">' + main + '</div>' + about + '</div>';
  }

  /** A downloadable file row, used by students and teachers. */
  function fileRow(s, note, extra) {
    const f = s.file;
    return '<div class="stu-file">' + ICON.doc + '<span><strong>' + esc(f.name) + '</strong><small>' + fmtSize(f.size) + (note ? ' · ' + esc(note) : '') + '</small></span>' +
      '<button type="button" class="secondary-button small" data-action="download-file" data-sub="' + s.id + '">' + ICON.download + 'Download</button>' + (extra || '') + '</div>';
  }

  /** Teacher review: a pasted chat log that has not been split into steps. */
  function pastedLogPanel(s) {
    const src = s.sources[0];
    return '<section class="panel"><div class="panel-header compact"><div><h2>AI chat log</h2><p>Pasted by the student' + (src ? ' from ' + esc(src.tool) : '') + ' on ' + fmtDate(s.logsAttachedAt) + '. Shown exactly as pasted.</p></div><span class="pill count-pill">' + plural(E.wordCount(s.chatLog), 'word') + '</span></div>' +
      '<div class="panel-pad"><pre class="chat-log">' + esc(s.chatLog) + '</pre></div></section>';
  }

  function stuSummary(a, s, open) {
    const log = s.chatLog || stepsAsText(s);
    const src = s.sources[0];
    const work = s.file ? fileRow(s, 'uploaded ' + fmtDate(s.file.uploadedAt))
      : s.submission ? '<details class="stu-details"><summary>Handed in as text · ' + plural(E.wordCount(s.submission), 'word') + '</summary><p>' + esc(s.submission) + '</p></details>'
      : '<p class="muted small">No file stored.</p>';
    return '<section class="panel"><div class="panel-header"><div><div class="title-row"><h2>Your submission</h2><span class="stage-pill stage-in">Handed in</span></div><p>Handed in ' + fmtDate(s.handedInAt) + '. ' + (open ? 'You can replace it until ' + fmtDay(a.dueDate) + '.' : 'This assignment is closed.') + '</p></div>' +
        (open ? '<button type="button" class="secondary-button" data-action="stu-edit">' + ICON.upload + 'Replace submission</button>' : '') + '</div>' +
      '<div class="stu-step"><span class="timeline-num">1</span><div><h3>Your assignment</h3>' + work + '</div></div>' +
      '<div class="stu-step"><span class="timeline-num">2</span><div><h3>Your AI chat log</h3><p class="hint">' + (src ? esc(src.tool) + ' · ' : '') + plural(E.wordCount(log), 'word') + '</p>' +
        (log ? '<details class="stu-details"><summary>Show the chat log you handed in</summary><pre class="chat-log">' + esc(log) + '</pre></details>' : '<p class="muted small">No AI log.</p>') + '</div></div>' +
      '</section>';
  }

  function stuForm(a, s, d) {
    const tool = AI_TOOLS[d.tool];
    const file = d.file
      ? '<div class="stu-file">' + ICON.doc + '<span><strong>' + esc(d.file.name) + '</strong><small>' + fmtSize(d.file.size) + (d.file.keep ? ' · from your last hand-in' : d.file.reading ? ' · reading the text…' : d.file.text ? ' · ' + plural(E.wordCount(d.file.text), 'word') + ' found · ready to hand in' : ' · ready to hand in (the text could not be read, so your teacher will download the file)') + '</small></span><button type="button" class="ghost-button small" data-action="stu-clear-file">Change file</button></div>'
      : '<label class="dropzone">' + ICON.upload + '<strong>Choose a file or drag it here</strong><span>PDF or Word (.pdf, .doc, .docx), up to 2 MB</span>' +
        '<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-change="stu-file"></label>';
    const steps = [
      tool.open,
      'Scroll to the very top of the chat so every message has loaded.',
      'Click on a blank part of the conversation (not the message box). Press <kbd>Ctrl</kbd> + <kbd>A</kbd> to select everything, then <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy it.',
      'Click in the box below and press <kbd>Ctrl</kbd> + <kbd>V</kbd> to paste.'
    ];
    return '<form data-form="stu-submit" class="panel stu-form" novalidate>' +
      '<div class="panel-header"><div><h2>' + (s && s.stage === 'handed_in' ? 'Replace your submission' : 'Hand in your work') + '</h2><p>Add your assignment file and your AI chat history, then press Hand in.</p></div></div>' +
      '<div class="stu-step"><span class="timeline-num">1</span><div><h3>Upload your assignment</h3><p class="hint">The finished piece of work, as a PDF or Word file.</p>' + file + '</div></div>' +
      '<div class="stu-step"><span class="timeline-num">2</span><div><h3>Paste your AI chat history</h3><p class="hint">Copy the whole conversation you had with the AI for this assignment, every prompt and every reply.</p>' +
        '<div class="tool-tabs" role="tablist" aria-label="Which AI tool did you use?">' + Object.keys(AI_TOOLS).map((k) =>
          '<button type="button" role="tab" aria-selected="' + (d.tool === k) + '" class="tool-tab' + (d.tool === k ? ' on' : '') + '" data-action="stu-tool" data-tool="' + k + '">' + AI_TOOLS[k].name + '</button>').join('') + '</div>' +
        '<ol class="stu-howto">' + steps.map((x) => '<li>' + x + '</li>').join('') + '</ol>' +
        '<p class="hint stu-tip">On a Mac, use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd>. Used more than one chat? Paste them one after the other. Please don\'t edit the text after pasting.</p>' +
        '<label class="sr" for="stuLog">AI chat history</label>' +
        '<textarea id="stuLog" class="stu-log" data-input="stu-log" spellcheck="false" placeholder="Paste your full AI chat here">' + esc(d.log) + '</textarea>' +
        '<div class="stu-count"><span id="stuLogCount">' + logCountText(d.log) + '</span><span>' + esc(tool.name) + '</span></div>' +
      '</div></div>' +
      (d.error ? '<p class="auth-error stu-error" role="alert">' + esc(d.error) + '</p>' : '') +
      '<div class="panel-footer"><span>Your teacher sees your file and chat log once you hand in. You can replace them until ' + fmtDay(a.dueDate) + '.</span>' +
        '<div class="heading-actions">' + (s && s.stage === 'handed_in' ? '<button type="button" class="secondary-button" data-action="stu-cancel">Cancel</button>' : '') +
        '<button type="submit" class="primary-button"' + (d.busy ? ' disabled' : '') + '>' + ICON.upload + (d.busy ? 'Handing in…' : 'Hand in') + '</button></div></div>' +
      '</form>';
  }

  /** Read a picked or dropped file into the draft, after checking its type and size. */
  function pickFile(file) {
    const d = ui.stu;
    if (!d || !file) return;
    const bad = !FILE_TYPES.includes(fileExt(file.name)) ? 'Hand in a PDF or Word file (.pdf, .doc or .docx).'
      : !file.size ? 'That file is empty.'
      : file.size > MAX_FILE ? 'That file is ' + fmtSize(file.size) + '. Files must be 2 MB or smaller.' : '';
    if (bad) { d.error = bad; render(); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const picked = { name: file.name, size: file.size, type: file.type || '', data: reader.result, reading: true, text: '' };
      d.file = picked; d.error = ''; render();
      try { picked.text = await fileText(file.name, await fileBuffer(null, reader.result)); } catch (e) { picked.text = ''; }
      picked.reading = false;
      if (ui.stu === d && d.file === picked) render();
    };
    reader.onerror = () => { d.error = 'That file could not be read. Try again.'; render(); };
    reader.readAsDataURL(file);
  }

  /** Keep a handed-in file: on the local server when it runs, otherwise in this browser. */
  async function storeFile(f) {
    const meta = { name: f.name, size: f.size, type: f.type, uploadedAt: new Date().toISOString() };
    if (mode === 'server') {
      const r = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, data: String(f.data).split(',')[1] || '' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The file could not be saved.');
      return Object.assign(meta, { id: j.id, where: 'server' });
    }
    const id = 'f-' + Math.random().toString(36).slice(2, 12) + fileExt(f.name);
    try { localStorage.setItem(FILE_PREFIX + id, f.data); }
    catch (e) { throw new Error('This browser has no room left for that file. Try a smaller file.'); }
    return Object.assign(meta, { id, where: 'local' });
  }
  function dropFile(meta) {
    if (meta && meta.where === 'local') { try { localStorage.removeItem(FILE_PREFIX + meta.id); } catch (e) { /* ignore */ } }
  }
  function downloadFile(meta) {
    let href = meta.where === 'server' ? '/api/files/' + encodeURIComponent(meta.id) : null;
    if (meta.where === 'local') { try { href = localStorage.getItem(FILE_PREFIX + meta.id); } catch (e) { /* storage blocked */ } }
    if (!href) { toast('That file is only stored in the browser it was handed in from.', true); return; }
    const link = document.createElement('a');
    link.href = href; link.download = meta.name;
    document.body.append(link); link.click(); link.remove();
  }

  const STUDENT_ACTIONS = {
    'stu-tool': (el) => { if (ui.stu) { ui.stu.tool = el.dataset.tool; render(); } },
    'stu-clear-file': () => { if (ui.stu) { ui.stu.file = null; render(); } },
    'stu-edit': () => { ui.stu = newStuDraft(asg(ui.assignmentId)); ui.stu.editing = true; render(); },
    'stu-cancel': () => { ui.stu = newStuDraft(asg(ui.assignmentId)); render(); },
    'download-file': (el) => { const s = sub(el.dataset.sub); if (s && s.file) downloadFile(s.file); }
  };

  const STUDENT_FORMS = {
    'stu-submit': async () => {
      const d = ui.stu;
      const a = d && asg(d.aid);
      if (!a || d.busy || !takes(a.courseId)) return;
      const fail = (msg) => { d.error = msg; render(); const el = $('.stu-error'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      if (!isOpen(a)) return fail('This assignment has closed, so it can no longer be handed in.');
      if (!d.file) return fail('Add your assignment file (step 1).');
      if (!d.log.trim()) return fail('Paste your AI chat history (step 2).');
      if (d.file.reading) return fail('Still reading your file. Try again in a moment.');
      d.busy = true; d.error = ''; render();
      try {
        let s = mySub(a.id);
        if (!s) {
          s = { id: uid('s-'), assignmentId: a.id, studentId: myStudentId(), stage: 'not_started', sources: [], interactions: [], submission: '', review: { status: 'not_reviewed', decision: null, comment: '', marks: {}, scores: {}, seconds: 0 } };
          state.submissions.push(s);
        }
        const meta = d.file.keep ? d.file.meta : await storeFile(d.file);
        if (s.file && s.file.id !== meta.id) dropFile(s.file);
        const now = new Date().toISOString();
        const logChanged = d.log !== d.prefill || !s.logsAttachedAt;
        Object.assign(s, {
          stage: 'handed_in', declaration: 'ai_used', handedInAt: now, file: meta,
          submission: d.file.keep ? (s.submission || '') : (d.file.text || ''), textTried: !d.file.keep || !!s.textTried, aiEval: null,
          chatLog: d.log, handIns: (s.handIns || 0) + 1
        });
        if (logChanged) {
          // A new paste replaces any earlier steps; the teacher sees it exactly as pasted.
          s.logsAttachedAt = now;
          s.interactions = [];
          s.aiSplit = false;
          s.sources = [{ type: 'pasted', tool: AI_TOOLS[d.tool].name, attachedAt: now }];
        }
        save();
        ui.stu = newStuDraft(a);
        render();
        window.scrollTo(0, 0);
        toast('Handed in. Your teacher can now see your work and AI chat log.');
      } catch (e) {
        d.busy = false;
        fail(e.message);
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Reading the text out of a handed-in PDF or Word file                */
  /* ------------------------------------------------------------------ */
  const LIBS = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js'
  };
  const scriptLoads = {};
  function loadScript(src) {
    if (!scriptLoads[src]) {
      scriptLoads[src] = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src; el.async = true;
        el.onload = resolve;
        el.onerror = () => { delete scriptLoads[src]; reject(new Error('Could not load the file reader. Check the internet connection.')); };
        document.head.append(el);
      });
    }
    return scriptLoads[src];
  }
  const tidyText = (t) => String(t || '').replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  /** Plain text of a PDF or .docx, with blank lines between paragraphs. Old .doc files return ''. */
  async function fileText(name, buffer) {
    const ext = fileExt(name);
    if (ext === '.docx') {
      await loadScript(LIBS.mammoth);
      const r = await window.mammoth.extractRawText({ arrayBuffer: buffer });
      return tidyText(r.value);
    }
    if (ext !== '.pdf') return '';
    await loadScript(LIBS.pdf);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const pdf = await lib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const lines = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let line = null;
      content.items.forEach((it) => {
        if (typeof it.str !== 'string') return;
        const y = it.transform[5];
        if (!line || Math.abs(line.y - y) > 2) { line = { text: '', y, h: it.height || 10, page: n }; lines.push(line); }
        line.text += it.str;
        if (it.hasEOL) line = null;
      });
    }
    // A bigger gap than usual between lines starts a new paragraph.
    const gaps = [];
    lines.forEach((l, i) => { const p = lines[i - 1]; if (p && p.page === l.page) gaps.push(Math.abs(p.y - l.y)); });
    gaps.sort((x, y) => x - y);
    const usual = gaps[Math.floor(gaps.length / 2)] || 14;
    let out = '';
    lines.forEach((l, i) => {
      const p = lines[i - 1];
      const t = l.text.trim();
      if (!t) { out += '\n\n'; return; }
      if (!p) out = t;
      // A new page only starts a paragraph if the last line finished a sentence.
      else if (p.page !== l.page ? /[.!?:"”)]$/.test(out) : Math.abs(p.y - l.y) > usual * 1.45) out += '\n\n' + t;
      else out += (/-$/.test(out) ? '' : ' ') + t;
    });
    return tidyText(out);
  }
  async function fileBuffer(meta, dataUrl) {
    let href = dataUrl;
    if (!href && meta.where === 'server') href = '/api/files/' + encodeURIComponent(meta.id);
    if (!href && meta.where === 'local') { try { href = localStorage.getItem(FILE_PREFIX + meta.id); } catch (e) { /* blocked */ } }
    if (!href) throw new Error('The file is not stored here.');
    const r = await fetch(href);
    if (!r.ok) throw new Error('The file could not be opened.');
    return r.arrayBuffer();
  }

  /* ------------------------------------------------------------------ */
  /* View: Submission (the handed-in work, with optional AI evaluation)  */
  /* ------------------------------------------------------------------ */
  // How a sentence of the submission was written, in the app's colour system.
  const SOURCE = {
    own: { label: 'Student\'s own writing', cls: 'src-own', tip: 'No clear link to any AI reply in the log.' },
    changed: { label: DECISIONS.changed.label, cls: 'd-changed', tip: 'Based on an AI reply, but reworded or developed by the student.' },
    unchanged: { label: DECISIONS.unchanged.label, cls: 'd-unchanged', tip: 'Repeats an AI reply word-for-word or nearly so.' },
    unlogged: { label: DECISIONS.unrecorded.label, cls: 'd-unrecorded', tip: 'Reads like AI text, but no prompt in the log matches it.' }
  };
  const USE_TO_DECISION = { unchanged: 'unchanged', changed: 'changed', not_used: 'not_used', unclear: 'unrecorded' };
  const PURPOSE_LABEL = { brainstorming: 'Brainstorming', research: 'Research', drafting: 'Drafting', editing: 'Editing', checking: 'Checking', other: 'Other' };
  let aiStatus = null;
  const aiJobs = {};      // submission id → true while Gemini is working
  const aiErrors = {};    // submission id → last error message
  const reading = {};     // submission id → true while the file's text is read
  ui.aiOn = false; // each submission opens with AI evaluation off, so the work is marked on its own first
  ui.evSel = null; ui.evStep = null;

  async function loadAiStatus() {
    if (aiStatus) return aiStatus;
    if (mode !== 'server') { aiStatus = { configured: false, reason: mode === 'backend' ? 'backend' : 'server' }; return aiStatus; }
    try { const r = await fetch('/api/ai/status', { cache: 'no-store' }); aiStatus = r.ok ? await r.json() : { configured: false, reason: 'server' }; }
    catch (e) { aiStatus = { configured: false, reason: 'server' }; }
    return aiStatus;
  }
  const subLog = (s) => s.interactions.length ? null : (s.chatLog || '');
  function cannotEvaluate(s) {
    if (s.stage !== 'handed_in') return 'This submission has not been handed in yet.';
    if (s.declaration === 'no_ai' && !s.interactions.length && !s.chatLog) return 'The student declared no AI use, so there is no chat log to compare with.';
    if (!String(s.submission || '').trim()) return reading[s.id] ? 'Reading the file…' : 'There is no submission text to evaluate.';
    if (!s.interactions.length && !String(s.chatLog || '').trim()) return 'There is no AI chat log to evaluate.';
    return '';
  }

  /** Sends the work and the log to Gemini (through server.js) and saves the result on the submission. */
  async function runAiEval(s) {
    if (aiJobs[s.id] || cannotEvaluate(s)) return;
    const st = await loadAiStatus();
    if (!st.configured) { render(); return; }
    aiJobs[s.id] = true; delete aiErrors[s.id];
    if (ui.subId === s.id) render();
    const a = asg(s.assignmentId);
    try {
      const r = await fetch('/api/ai/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment: { title: a.title, description: a.description },
          submission: s.submission,
          detection: savedAi(a),
          log: subLog(s),
          steps: s.interactions.length ? s.interactions.map((i) => ({ prompt: i.prompt, output: i.output, critique: i.critique })) : null
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'AI evaluation failed.');
      s = sub(s.id) || s; // the workspace may have reloaded while Gemini worked
      // A raw pasted log is split into steps the first time, so the rubric screen and the rules can use them.
      if (!s.interactions.length) {
        const tool = (s.sources[0] && s.sources[0].tool) || 'AI';
        s.interactions = j.steps.map((x, k) => ({
          id: s.id + '-g' + (k + 1), step: k + 1, task: x.task || 'Step ' + (k + 1), tool,
          prompt: x.prompt || '', output: x.response || '',
          critique: x.reaction || '', critiqueSource: x.reaction ? 'chat' : 'none',
          pushback: false, pushbackText: x.reaction || '',
          decision: USE_TO_DECISION[x.use] || 'unrecorded', decisionSource: 'ai',
          timestamp: s.logsAttachedAt || s.handedInAt
        }));
        s.aiSplit = true;
      }
      const idOf = (n) => (s.interactions[n - 1] || {}).id;
      const steps = {};
      j.steps.forEach((x) => { const id = idOf(x.step); if (id) steps[id] = { task: x.task, purpose: x.purpose, use: x.use }; });
      s.aiEval = {
        model: j.model, ranAt: new Date().toISOString(), summary: j.summary, detection: j.detection || savedAi(a),
        textLength: s.submission.length,
        sentences: j.sentences.map((x) => ({ text: x.text, para: x.para, source: x.source, steps: x.steps.map(idOf).filter(Boolean) })),
        steps
      };
      ui.evSel = null; ui.evStep = null;
      save();
      toast('AI evaluation ready for ' + subName(s) + '.');
    } catch (e) {
      aiErrors[s.id] = e.message;
    } finally {
      delete aiJobs[s.id];
      if (ui.subId === s.id && ui.view === 'submission') render();
    }
  }

  /** Files handed in before text reading existed: read them once, when a teacher opens the submission. */
  async function readSubmissionFile(s) {
    if (reading[s.id] || !s.file || s.submission || s.textTried) return;
    reading[s.id] = true;
    try { s.submission = await fileText(s.file.name, await fileBuffer(s.file)); }
    catch (e) { /* show the download button instead */ }
    s.textTried = true;
    delete reading[s.id];
    save();
    if (ui.subId === s.id) render();
  }

  /** Runs after the submission screen is drawn: read the file, start AI evaluation if it is switched on. */
  function afterSubmissionRender() {
    const s = sub(ui.subId);
    if (!s || s.stage !== 'handed_in') return;
    if (s.file && !s.submission && !s.textTried) readSubmissionFile(s);
    if (ui.aiOn && !s.aiEval && !aiJobs[s.id] && !aiErrors[s.id] && !cannotEvaluate(s)) {
      loadAiStatus().then((st) => { if (st.configured) runAiEval(s); else render(); });
    }
  }

  function wordsBySource(ev) {
    const n = { own: 0, changed: 0, unchanged: 0, unlogged: 0 };
    ev.sentences.forEach((x) => { n[x.source] += E.wordCount(x.text); });
    const total = Object.values(n).reduce((p, q) => p + q, 0) || 1;
    return { n, total };
  }

  function viewSubmission() {
    const s = sub(ui.subId);
    if (!s) return emptyState('That submission no longer exists.', '<button type="button" class="secondary-button" data-action="go" data-view="home">Back to all courses</button>');
    const a = asg(s.assignmentId);
    const p = person(s.studentId);
    const e = evalOf(s);
    const handed = s.stage === 'handed_in';
    const stale = s.aiEval && s.aiEval.textLength !== String(s.submission || '').length;
    const ev = ui.aiOn && s.aiEval && !stale ? s.aiEval : null;

    const toggle = '<button type="button" class="ai-toggle' + (ui.aiOn ? ' on' : '') + '" role="switch" aria-checked="' + ui.aiOn + '" data-action="ai-toggle"' + tip('Show how AI was used in this work. Off: read the work on its own.') + '><span class="ai-track"><span class="ai-knob"></span></span><span>AI evaluation</span></button>';
    const head = '<div class="page-heading review-heading"><div class="who big">' + avatar(p, 'lg') + '<div><h1>' + esc(fullName(p)) + '</h1>' +
        '<p>' + esc(p.upi) + ' · ' + esc(groupOf(s)) + ' · ' + stagePill(s) + (s.handedInAt ? ' · handed in ' + fmtDate(s.handedInAt) : '') + '</p></div></div>' +
      '<div class="heading-actions">' + toggle +
        '<button type="button" class="secondary-button" data-action="go" data-view="review" data-id="' + s.id + '"' + tip('Each prompt and AI reply from the chat log, with the rubric beside it') + '>' + ICON.chat + 'AI interactions and rubric <span>→</span></button></div></div>';

    // The document: plain on its own, coloured by source when AI evaluation is on.
    let doc;
    if (!handed) doc = emptyState(s.stage === 'logs_attached' ? 'Not handed in yet. The student has attached an AI log, which you can read under AI interactions and rubric.' : 'Not handed in yet.');
    else if (!String(s.submission || '').trim()) doc = reading[s.id] ? '<p class="loading">Reading the file…</p>'
      : emptyState(s.file ? 'The text of this file could not be read here. Download it to read the work.' : 'No final submission text stored.', s.file ? '<button type="button" class="secondary-button" data-action="download-file" data-sub="' + s.id + '">' + ICON.download + 'Download ' + esc(s.file.name) + '</button>' : '');
    else if (ev) {
      const flagged = new Set(e.interactions.filter((i) => i.result.flags.length).map((i) => i.id));
      const paras = [];
      ev.sentences.forEach((x, k) => {
        const src = SOURCE[x.source] || SOURCE.own;
        const nums = x.steps.map((id) => (s.interactions.find((i) => i.id === id) || {}).step).filter(Boolean);
        const cls = 'ev ev-' + x.source + (x.steps.some((id) => flagged.has(id)) ? ' ev-flag' : '') + (ui.evSel === k ? ' on' : '') + (ui.evStep && x.steps.includes(ui.evStep) ? ' hl' : '');
        // Only the coloured (AI-like) parts can be clicked; the student's own writing stays plain.
        const span = x.source === 'own' ? '<span class="ev ev-own">' + esc(x.text) + '</span>'
          : '<span class="' + cls + '" role="button" tabindex="0" data-action="ev-part" data-idx="' + k + '"' + tip(src.label + (nums.length ? ' · from step ' + nums.join(', ') : '') + '. Click to see the prompts behind it.') + '>' + esc(x.text) + '</span>';
        (paras[x.para] = paras[x.para] || []).push(span);
      });
      doc = '<div class="doc-page' + (ui.evStep ? ' focus' : '') + '">' + paras.filter(Boolean).map((x) => '<p>' + x.join(' ') + '</p>').join('') + '</div>';
    } else {
      doc = '<div class="doc-page">' + String(s.submission).split(/\n\s*\n/).map((x) => '<p>' + esc(x.trim()) + '</p>').join('') + '</div>';
    }
    const words = E.wordCount(s.submission || '');
    const docPanel = '<section class="panel"><div class="panel-header compact"><div><h2>' + esc(a.title) + '</h2><p>Final submission' + (words ? ' · ' + plural(words, 'word') : '') + (a.wordLimit ? ' · limit ' + a.wordLimit : '') + (s.file ? ' · ' + esc(s.file.name) : '') + '</p></div>' +
      (s.file ? '<button type="button" class="ghost-button small" data-action="download-file" data-sub="' + s.id + '">' + ICON.download + 'Download original</button>' : '') + '</div>' + doc + '</section>';

    const w = railWidth();
    return head + '<div class="review-layout sub-layout" style="--rail-w:' + w + 'px"><div class="review-main">' + docPanel + '</div>' +
      '<div class="rail-resize" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Side panel width" aria-valuemin="' + RAIL_MIN + '" aria-valuenow="' + w + '"' + tip('Drag to make the side panel wider or narrower. Double-click to reset.') + '><span></span></div>' +
      '<aside class="review-rail" aria-label="' + (ui.aiOn ? 'AI evaluation' : 'Grading rubric') + '">' + (ui.aiOn ? aiRail(s, a, e, ev, stale) : markingRail(s, a)) + '</aside></div>';
  }


  function aiRail(s, a, e, ev, stale) {
    const blocked = cannotEvaluate(s);
    if (blocked) return '<div class="panel rail-card"><h2>AI evaluation</h2><p class="hint">' + esc(blocked) + '</p></div>';
    if (aiStatus && !aiStatus.configured) {
      const why = aiStatus.reason === 'server' ? 'AI evaluation runs through the local server. Start Trace with <code>node server.js</code> instead of opening the file directly.'
        : aiStatus.reason === 'backend' ? 'AI evaluation is not connected to the secure backend yet.'
        : 'Add your Gemini API key to the <code>.env</code> file as <code>GEMINI_API_KEY=…</code>, then restart <code>node server.js</code>. See the README for a free key.';
      return '<div class="panel rail-card"><h2>AI evaluation</h2><div class="info-banner warn">' + ICON.info + '<p>' + why + '</p></div></div>';
    }
    if (aiJobs[s.id]) return '<div class="panel rail-card"><h2>AI evaluation</h2><p class="ai-working"><span class="spinner" aria-hidden="true"></span>Gemini is reading the submission and the chat log. This can take up to a minute.</p></div>';
    if (aiErrors[s.id]) return '<div class="panel rail-card"><h2>AI evaluation</h2><div class="info-banner warn">' + ICON.alert + '<p>' + esc(aiErrors[s.id]) + '</p></div><button type="button" class="secondary-button" data-action="ai-run">Try again</button></div>';
    if (!ev) return '<div class="panel rail-card"><h2>AI evaluation</h2><p class="hint">' + (stale ? 'The student handed in again after the last evaluation.' : 'Not evaluated yet.') + '</p><button type="button" class="primary-button" data-action="ai-run">Run AI evaluation</button></div>';

    const { n, total } = wordsBySource(ev);
    const keys = ['own', 'changed', 'unchanged', 'unlogged'];
    const bar = '<div class="hbar ev-bar">' + keys.filter((k) => n[k]).map((k) => '<span class="hseg static ' + SOURCE[k].cls + '" style="flex:' + n[k] + '"' + tip(SOURCE[k].label + ': ' + Math.round(n[k] / total * 100) + '% of the words') + '></span>').join('') + '</div>';
    const legend = '<ul class="legend ev-legend">' + keys.map((k) => '<li' + tip(SOURCE[k].tip) + '><span class="key ' + SOURCE[k].cls + '"></span>' + SOURCE[k].label + ' <b>' + Math.round(n[k] / total * 100) + '%</b></li>').join('') +
      '<li' + tip('Text shaped by a step that the flag rules flagged.') + '><span class="key flagged-key"></span>Step has flags</li></ul>';
    const aiPct = Math.round((n.changed + n.unchanged + n.unlogged) / total * 100);
    const now = savedAi(a);
    const evAi = Object.assign({}, E.DEFAULT_AI, ev.detection || {});
    const outdated = !sameAi(evAi, now) ? '<div class="info-banner warn ev-outdated">' + ICON.info + '<p><b>Run with older AI detection settings</b> (' + E.AI_SENSITIVITY[evAi.sensitivity].label + '). This assignment now uses ' + E.AI_SENSITIVITY[now.sensitivity].label + '. Press Re-run to update.</p></div>' : '';
    // The prompts appear only once the teacher clicks a coloured part of the text.
    // They then sit right under the figures and bar, in place of the legend and summary, so no scrolling is needed.
    let selected = '';
    const x = ev.sentences[ui.evSel];
    if (x && x.source !== 'own') {
      const src = SOURCE[x.source] || SOURCE.own;
      const from = s.interactions.filter((i) => x.steps.includes(i.id));
      const stepBox = (i) => {
        const info = ev.steps[i.id] || {};
        const res = (e.interactions.find((y) => y.id === i.id) || { result: { flags: [] } }).result;
        const parts = ev.sentences.filter((y) => y.steps.includes(i.id)).length;
        return '<li class="ev-step' + (ui.evStep === i.id ? ' on' : '') + '">' +
          '<span class="ev-step-top"><b>Step ' + i.step + '</b>' + decisionBadge(USE_TO_DECISION[info.use] || i.decision) + (info.purpose ? '<span class="muted">' + PURPOSE_LABEL[info.purpose] + '</span>' : '') + '</span>' +
          '<span class="ev-step-task">' + esc(info.task || i.task) + '</span>' +
          '<div class="ev-chat"><p class="ev-you"><b>Student</b>' + esc(trunc(i.prompt, 400)) + '</p><p class="ev-ai"><b>' + esc(i.tool || 'AI') + '</b>' + esc(trunc(i.output, 280)) + '</p>' +
            (i.pushbackText ? '<p class="ev-you"><b>Student\'s next message</b>' + esc(trunc(i.pushbackText, 200)) + '</p>' : '') + '</div>' +
          (res.flags.length ? '<div class="ev-flags"><b>Flags raised (' + res.flags.length + ')</b><ul>' +
            res.flags.map((f) => '<li' + tip(f.detail || f.rule) + '>' + ICON.flag + '<span>' + esc(f.name) + '</span></li>').join('') + '</ul></div>' : '') +
          '<span class="ev-step-links">' + (parts > 1 ? '<button type="button" class="text-button" data-action="ev-step" data-id="' + esc(i.id) + '" aria-pressed="' + (ui.evStep === i.id) + '">' + (ui.evStep === i.id ? 'Stop highlighting' : 'Highlight all ' + parts + ' parts from this prompt') + '</button>' : '') +
          '<button type="button" class="text-button" data-action="see-step" data-id="' + esc(i.id) + '">Open in AI interactions and rubric →</button></span></li>';
      };
      // The selected part is already outlined in the text, so the heading only says how it was used.
      selected = '<div class="ev-picked"><div class="ev-picked-head"><h3>Prompts behind this part</h3>' +
          '<span class="ev-src"' + tip(src.tip) + '><span class="key ' + src.cls + '"></span>' + src.label + '</span>' +
          '<button type="button" class="icon-button" data-action="ev-part" data-idx="' + ui.evSel + '" aria-label="Close and show the summary again"' + tip('Close and show the summary again') + '>×</button></div>' +
        (from.length ? '<ul class="ev-steps">' + from.map(stepBox).join('') + '</ul>'
          : '<p class="hint">' + (x.source === 'unlogged' ? 'This reads like AI text, but no prompt in the log matches it.' : 'No single prompt in the log shaped this part.') + '</p>') + '</div>';
    }

    return '<div class="panel rail-card ev-card"><div class="row-between"><h2>AI evaluation</h2><button type="button" class="ghost-button small" data-action="ai-run"' + tip('Ask Gemini again. Rubric marks are kept.') + '>Re-run</button></div>' +
      outdated + '<p class="ev-sens">' + ICON.shield + 'AI detection: <b>' + E.AI_SENSITIVITY[evAi.sensitivity].label + '</b>' + (evAi.unlogged ? '' : ' · "Not recorded" off') + '</p>' +
      '<div class="ev-figures"><div><b>' + (100 - aiPct) + '%</b><span>student\'s own</span></div><div><b>' + aiPct + '%</b><span>with AI</span></div></div>' + bar +
      (selected || legend +
        (ev.summary ? '<p class="ev-summary">' + esc(ev.summary) + '</p>' : '') +
        '<p class="ev-cta">' + ICON.info + 'Click a coloured part of the text to see the prompts behind it.</p>' +
        '<p class="hint">Estimated by ' + esc(ev.model) + ' on ' + fmtDate(ev.ranAt) + '. A guide to where to look, not evidence.</p>') +
    '</div>';
  }

  const SUBMISSION_ACTIONS = {
    'ai-toggle': () => {
      ui.aiOn = !ui.aiOn; ui.evSel = null; ui.evStep = null;
      if (ui.aiOn) loadAiStatus().then(() => render()); else render();
    },
    'ai-run': () => { const s = sub(ui.subId); if (s) { delete aiErrors[s.id]; runAiEval(s); } },
    'ev-part': (el) => {
      const k = Number(el.dataset.idx); ui.evSel = ui.evSel === k ? null : k; ui.evStep = null; render();
      // Bring the prompts into view at the top of the side panel.
      const r = $('.sub-layout .review-rail'); if (r && ui.evSel != null) r.scrollTop = 0;
    },
    'ev-step': (el) => { ui.evStep = ui.evStep === el.dataset.id ? null : el.dataset.id; render(); },
    'see-step': (el) => { ui.jumpTo = el.dataset.id; go('review', ui.subId); }
  };

  /* ------------------------------------------------------------------ */
  /* Grading rubric: the teacher's own rubric for the work itself        */
  /* Each criterion has points and is marked Excellent / Good / Okay /   */
  /* Not good (100 / 75 / 50 / 25% of its points). Separate from the     */
  /* AI-use rubric, which is marked on each prompt step.                 */
  /* ------------------------------------------------------------------ */
  const fmtPts = (n) => String(Math.round((Number(n) || 0) * 10) / 10);
  // Two different rubrics, always labelled and coloured the same way:
  //   grading rubric  grades the work itself (forest green)
  //   AI use rubric   checks how AI was used on each prompt (burgundy)
  const RUBRIC_KIND = {
    grading: { label: 'Grading rubric', sub: 'grades the work itself', icon: ICON.doc },
    ai: { label: 'AI use rubric', sub: 'checks how AI was used', icon: ICON.chat },
    detect: { label: 'AI detection', sub: 'how sensitive the AI checks are', icon: ICON.shield }
  };
  const rubricTag = (k) => '<span class="rubric-tag ' + k + '">' + RUBRIC_KIND[k].icon + '<b>' + RUBRIC_KIND[k].label + '</b><span>' + RUBRIC_KIND[k].sub + '</span></span>';
  /** Tabs on Adjust Rubrics: one assignment's two rubrics side by side. */
  function rubricTabs(a, active) {
    const g = a.marking || [];
    const pts = g.reduce((n, c) => n + (Number(c.points) || 0), 0);
    const tab = (k, attrs, detail) => '<button type="button" role="tab" aria-selected="' + (active === k) + '" class="rubric-tab ' + k + (active === k ? ' on' : '') + '"' + (active === k ? '' : ' ' + attrs) + '>' +
      RUBRIC_KIND[k].icon + '<span><b>' + RUBRIC_KIND[k].label + '</b><small>' + RUBRIC_KIND[k].sub.charAt(0).toUpperCase() + RUBRIC_KIND[k].sub.slice(1) + ' · ' + detail + '</small></span></button>';
    return '<div class="rubric-tabs" role="tablist" aria-label="Rubrics for ' + esc(a.short) + '">' +
      tab('grading', 'data-action="open-mrubric" data-id="' + a.id + '"', g.length ? plural(g.length, 'criterion', 'criteria') + ', ' + fmtPts(pts) + ' points' : 'not set up yet') +
      tab('ai', 'data-action="go" data-view="rules" data-id="' + a.id + '"', plural(a.rubric.length, 'criterion', 'criteria') + ' on every prompt step') +
      tab('detect', 'data-action="go" data-view="detect" data-id="' + a.id + '"', E.AI_SENSITIVITY[a.settings.ai.sensitivity].label + ' · Gemini and flag rules') + '</div>';
  }
  const blankCriterion = () => ({ id: uid('mc-'), name: '', points: 10, description: '', levels: { excellent: '', good: '', okay: '', not_good: '' } });
  const mrList = (scope) => scope === 'wiz' ? ui.wiz.data.marking : (ui.mrEdit || {}).list;
  ui.mrComment = {};

  function markingProblem(list) {
    if (!list || !list.length) return 'Add at least one grading criterion.';
    if (list.some((c) => !String(c.name || '').trim())) return 'Give every grading criterion a name.';
    if (list.some((c) => !(Number(c.points) > 0))) return 'Give every grading criterion some points.';
    return '';
  }
  const cleanMarking = (list) => list.map((c) => ({
    id: c.id || uid('mc-'), name: String(c.name).trim().slice(0, 60), points: Math.round(Number(c.points)), description: String(c.description || '').trim().slice(0, 240),
    levels: E.MARK_LEVELS.reduce((o, l) => { o[l.key] = String((c.levels || {})[l.key] || '').trim().slice(0, 300); return o; }, {})
  }));

  /** The rubric grid editor, used by the New assignment wizard and the Grading rubric page. */
  function markingEditor(list, scope, bands) {
    const total = list.reduce((n, c) => n + (Number(c.points) || 0), 0);
    const rangeText = (c, key) => { const r = E.levelRanges(c.points, bands)[key]; return fmtPts(r[0]) + (r[1] > r[0] ? '–' + fmtPts(r[1]) : '') + ' pts'; };
    const b = E.normaliseBands(bands);
    const bandBox = '<div class="mr-bands"><div><b>Score bands</b><small>Where each level starts, as a share of a criterion\'s points. Markers can click a level or enter any score; the level follows the score.</small></div>' +
      [['excellent', 'Excellent'], ['good', 'Good'], ['okay', 'Okay']].map(([k, l]) => '<label class="mr-band lvl-' + k + '"><span>' + l + ' from</span><input type="number" min="1" max="100" data-input="mr-band" data-change="mr-total" data-scope="' + scope + '" data-k="' + k + '" value="' + esc((bands || {})[k] != null ? bands[k] : b[k]) + '"><span>%</span></label>').join('') +
      '<span class="mr-band lvl-not_good"><span>Not good below ' + b.okay + '%</span></span></div>';
    const at = (k) => ' data-scope="' + scope + '" data-k="' + k + '"';
    const rows = list.map((c, k) =>
      '<div class="mr-edit-row">' +
        '<div class="mr-edit-head"><span class="timeline-num">' + (k + 1) + '</span>' +
          '<label class="mr-name"><span>Criterion</span><input data-input="mr"' + at(k) + ' data-f="name" maxlength="60" value="' + esc(c.name) + '" placeholder="e.g. Argument"></label>' +
          '<label class="mr-points"><span>Points</span><input type="number" min="1" max="1000" data-input="mr" data-change="mr-total"' + at(k) + ' data-f="points" value="' + esc(c.points) + '"></label>' +
          '<button type="button" class="icon-button" data-action="mr-remove"' + at(k) + ' aria-label="Remove ' + esc(c.name || 'criterion') + '"' + tip('Remove this criterion') + '>×</button></div>' +
        '<label class="mr-descr"><span>What you look for <span class="optional">(optional)</span></span><input data-input="mr"' + at(k) + ' data-f="description" maxlength="240" value="' + esc(c.description) + '" placeholder="e.g. Takes and defends a clear position"></label>' +
        '<div class="mr-grid">' + E.MARK_LEVELS.map((l) =>
          '<label class="mr-cell lvl-' + l.key + '"><span class="mr-cell-head"><b>' + l.label + '</b><small>' + rangeText(c, l.key) + '</small></span>' +
          '<textarea rows="3" data-input="mr"' + at(k) + ' data-f="level:' + l.key + '" maxlength="300" placeholder="What ' + l.label.toLowerCase() + ' work looks like">' + esc((c.levels || {})[l.key]) + '</textarea></label>').join('') + '</div>' +
      '</div>').join('');
    const templates = Object.keys(E.MARKING_TEMPLATES).map((k) => '<button type="button" class="ghost-button small" data-action="mr-template" data-scope="' + scope + '" data-key="' + k + '">' + E.MARKING_TEMPLATES[k].label + '</button>').join('');
    return '<div class="mr-editor">' +
      '<p class="muted small rule-group-note">Each criterion is marked <b>Excellent</b>, <b>Good</b>, <b>Okay</b> or <b>Not good</b>, or given any score in between. Describing each level is optional; markers see it while they mark.</p>' + bandBox +
      (list.length ? rows : '<div class="empty-state">' + ICON.info + '<p>No grading criteria yet. Start from a template or add your own.</p></div>') +
      '<div class="mr-editor-foot"><button type="button" class="secondary-button" data-action="mr-add" data-scope="' + scope + '">' + ICON.plus + 'Add a criterion</button>' +
        '<span class="mr-templates"><span class="muted small">Start from a template:</span>' + templates + '</span>' +
        '<span class="mr-sum">Total <b>' + fmtPts(total) + '</b> points</span></div>' +
    '</div>';
  }

  /** Page: edit an existing assignment's grading rubric. */
  function viewMarkingRubric() {
    const a = asg(ui.assignmentId);
    if (!a || !ui.mrEdit) return emptyState('Choose an assignment first.');
    const c = course(a.courseId);
    const marked = asgSubs(a.id).filter((s) => Object.keys((s.review || {}).content || {}).length).length;
    return heading('', 'Adjust Rubrics', '') + rubricStepsBar(c, a) + rubricTabs(a, 'grading') +
      (marked ? '<div class="info-banner warn">' + ICON.info + '<p><strong>' + plural(marked, 'submission') + ' already ' + (marked === 1 ? 'has' : 'have') + ' marks.</strong> Changing points re-calculates their totals; removing a criterion removes its marks.</p></div>' : '') +
      (ui.mrEdit.error ? '<p class="form-error" role="alert">' + esc(ui.mrEdit.error) + '</p>' : '') +
      '<section class="panel wiz-panel grading-panel"><div class="panel-pad">' + rubricTag('grading') + markingEditor(ui.mrEdit.list, 'edit', ui.mrEdit.bands) + '</div></section>' +
      '<div class="wiz-actions"><button type="button" class="ghost-button" data-action="mr-cancel">Cancel</button><span class="wiz-spacer"></span><button type="button" class="primary-button" data-action="mr-save">Save grading rubric</button></div>';
  }

  /** Submission page, AI evaluation off: mark the work against the teacher's rubric. */
  function markingRail(s, a) {
    const list = a.marking || [];
    const edit = '<button type="button" class="text-button" data-action="open-mrubric" data-id="' + a.id + '">' + (list.length ? 'Edit rubric' : 'Create a grading rubric') + '</button>';
    if (!list.length) return '<div class="panel rail-card mr-card"><h2>Grading rubric</h2><p class="hint">This assignment has no grading rubric yet. Set one up to mark the work Excellent, Good, Okay or Not good on each criterion.</p>' + edit + '</div>';
    if (s.stage !== 'handed_in') return '<div class="panel rail-card mr-card"><div class="row-between"><h2>Grading rubric</h2>' + edit + '</div><p class="hint">You can mark the work once the student hands it in.</p></div>';
    const d = gradeDraft(s);
    const marks = d.content;
    const bands = a.markingBands;
    const sc = E.contentScore(list, marks, bands);
    const showText = prefs().levelText !== false;
    const crits = list.map((c) => {
      const m = marks[c.id] || {};
      const ranges = E.levelRanges(c.points, bands);
      const score = E.criterionScore(c, m, bands);
      const lvl = score != null ? E.levelForScore(score, c.points, bands) : null;
      const range = (k) => fmtPts(ranges[k][0]) + (ranges[k][1] > ranges[k][0] ? '–' + fmtPts(ranges[k][1]) : '');
      // Each level is one big clickable cell, like a Canvas rubric.
      const levels = E.MARK_LEVELS.map((l) => {
        const text = (c.levels || {})[l.key];
        return '<button type="button" class="mr-level lvl-' + l.key + (lvl === l.key ? ' on' : '') + '" data-action="mr-mark" data-crit="' + esc(c.id) + '" data-level="' + l.key + '" aria-pressed="' + (lvl === l.key) + '"' +
          tip('Click to give ' + fmtPts(ranges[l.key][1]) + ' points. For a score in between, type it in the points box.' + (!showText && text ? ' ' + text : '')) + '>' +
          '<span class="mr-level-top"><b>' + l.label + '</b><span class="mr-tick" aria-hidden="true">' + ICON.check + '</span></span>' +
          (showText && text ? '<span class="mr-level-text">' + esc(text) + '</span>' : '') +
          '<small class="mr-level-pts">' + range(l.key) + ' pts</small></button>';
      }).join('');
      const points = '<label class="mr-points' + (score != null ? ' has' : '') + '"' + tip('Type any score from 0 to ' + c.points + ', half points included. The matching level lights up.') + '>' +
        '<span class="sr">Points for ' + esc(c.name) + '</span>' +
        '<input type="number" inputmode="decimal" min="0" max="' + c.points + '" step="0.5" data-input="mr-score" data-change="mr-score-done" data-crit="' + esc(c.id) + '" value="' + (score != null ? score : '') + '" placeholder="–">' +
        '<span class="mr-points-of">/ ' + c.points + '</span></label>';
      const showComment = ui.mrComment[c.id] || m.comment;
      return '<div class="mr-crit' + (lvl ? ' done' : '') + '">' +
        '<div class="mr-crit-info"><b>' + esc(c.name) + '</b>' + (c.description ? '<p class="mr-crit-desc">' + esc(c.description) + '</p>' : '') + '</div>' +
        points +
        '<div class="mr-levels" role="group" aria-label="' + esc(c.name) + ' level">' + levels + '</div>' +
        '<div class="mr-crit-foot">' +
          (showText ? '' : '<div class="mr-desc-slot">' + levelDescHtml(c, lvl) + '</div>') +
          (showComment ? '<textarea class="mr-comment" rows="2" data-input="mr-comment" data-crit="' + esc(c.id) + '" placeholder="Comment on ' + esc(c.name.toLowerCase()) + '…">' + esc(m.comment || '') + '</textarea>'
            : '<button type="button" class="text-button mr-add-comment" data-action="mr-comment-open" data-crit="' + esc(c.id) + '">+ Comment</button>') +
        '</div>' +
      '</div>';
    }).join('');
    const wide = railWidth() >= RAIL_WIDE - 40;
    const widen = '<button type="button" class="text-button mr-widen" data-action="rail-widen"' + tip(wide ? 'Make the panel narrow again. You can also drag its left edge.' : 'Make the panel wider so the levels sit side by side. You can also drag its left edge.') + '>' + (wide ? '→ Narrow' : '← Widen') + '</button>';
    return '<div class="panel rail-card mr-card">' + rubricTag('grading') +
      '<div class="row-between"><h2>Grading rubric</h2><div class="mr-head-actions">' + widen + edit + '</div></div>' +
      '<div class="mr-summary" id="mrSummary">' + markSummaryHtml(sc) + '</div>' +
      '<label class="check mr-opt"' + tip('Show what each level means inside the rubric cells. Saved for your account in this browser.') + '><input type="checkbox" data-change="mr-pref-text"' + (showText ? ' checked' : '') + '> Show level descriptions</label>' +
      crits +
      '<label class="mr-feedback"><span>Overall feedback</span><textarea rows="3" data-input="mr-feedback" placeholder="Feedback on the work as a whole…">' + esc(d.feedback) + '</textarea></label>' +
      '<div class="grade-save">' + gradeStateHtml(s) +
        '<button type="button" class="ghost-button small" id="gradeDiscard" data-action="grade-discard"' + (d.dirty ? '' : ' hidden') + '>Discard</button>' +
        '<button type="button" class="primary-button" id="gradeSave" data-action="grade-save"' + (d.dirty ? '' : ' disabled') + '>' + ICON.check + 'Save marks</button></div>' +
      '<p class="hint">Marks are only kept once you press Save marks. They are for teachers only for now.</p>' +
    '</div>';
  }

  /** Total, progress bar and "x of y marked" at the top of the grading rubric. */
  function markSummaryHtml(sc) {
    return '<div class="mr-total"' + tip(sc.complete ? 'Every criterion is marked.' : sc.marked + ' of ' + sc.total + ' criteria marked so far.') + '><div><b>' + fmtPts(sc.earned) + '</b><span> / ' + fmtPts(sc.possible) + '</span></div><em>' + (sc.marked ? Math.round(sc.pct * 100) + '%' : '–') + '</em></div>' +
      '<div class="meter teal"><i style="width:' + (sc.total ? sc.marked / sc.total * 100 : 0) + '%"></i></div>' +
      '<p class="rail-sub mr-progress">' + (sc.complete ? '<span class="ok-text">' + ICON.check + 'All ' + sc.total + ' criteria marked</span>' : sc.marked + ' of ' + sc.total + ' criteria marked') + '</p>';
  }
  /** The chosen level's description, shown under the cells when descriptions are hidden in them. */
  function levelDescHtml(c, lvl) {
    const on = E.MARK_LEVEL_BY_KEY[lvl];
    return on && (c.levels || {})[lvl] ? '<p class="mr-level-desc lvl-' + lvl + '"><b>' + on.label + ':</b> ' + esc(c.levels[lvl]) + '</p>' : '';
  }

  /** The marks being worked on for one submission. Nothing reaches the saved data until "Save marks". */
  function gradeDraft(s) {
    const d = ui.gradeDraft;
    if (d && d.subId === s.id && d.dirty) return d;
    ui.gradeDraft = { subId: s.id, content: clone(s.review.content || {}), feedback: s.review.feedback || '', dirty: false };
    return ui.gradeDraft;
  }
  function gradeStateHtml(s) {
    const d = ui.gradeDraft;
    if (d && d.dirty) return '<span id="gradeState" class="grade-state dirty">Unsaved changes</span>';
    if (s.review.contentSavedAt) return '<span id="gradeState" class="grade-state saved"' + tip('Saved' + (s.review.contentSavedBy ? ' by ' + s.review.contentSavedBy : '') + ' on ' + fmtDate(s.review.contentSavedAt)) + '>' + ICON.check + 'Saved ' + fmtDate(s.review.contentSavedAt) + '</span>';
    return '<span id="gradeState" class="grade-state">Not marked yet</span>';
  }
  function markGradeDirty() {
    ui.gradeDraft.dirty = true;
    const st = $('#gradeState'); if (st) { st.className = 'grade-state dirty'; st.textContent = 'Unsaved changes'; }
    const b = $('#gradeSave'); if (b) b.disabled = false;
    const x = $('#gradeDiscard'); if (x) x.hidden = false;
  }
  /** Saves right away (not after the usual short delay) and says whether it worked. */
  async function saveNow() {
    if (mode === 'backend') { toast('Saving grades to the secure backend is not connected yet.', true); return false; }
    clearTimeout(saveTimer);
    statsCache.clear();
    saving = true;
    setSync('Saving…');
    return persist();
  }
  /** Asks before leaving a page with unsaved marks or an unsaved grading rubric. */
  function confirmLeaveUnsaved(view, id) {
    const d = ui.gradeDraft;
    if (ui.view === 'submission' && d && d.dirty && !(view === 'submission' && id === d.subId)) {
      const s = sub(d.subId);
      if (!window.confirm('You have unsaved marks for ' + (s ? subName(s) : 'this student') + '. Leave without saving them?')) return false;
      ui.gradeDraft = null;
    }
    const e = ui.mrEdit;
    if (ui.view === 'mrubric' && e && !(view === 'mrubric' && id === e.aid)) {
      const a = asg(e.aid);
      if (a && mrDirty(e, a) && !window.confirm('You have unsaved changes to the ' + a.short + ' grading rubric. Leave without saving them?')) return false;
      ui.mrEdit = null;
    }
    return true;
  }
  const hasUnsaved = () => (ui.view === 'submission' && ui.gradeDraft && ui.gradeDraft.dirty) ||
    (ui.view === 'mrubric' && ui.mrEdit && asg(ui.mrEdit.aid) && mrDirty(ui.mrEdit, asg(ui.mrEdit.aid)));
  function mrDirty(e, a) { return JSON.stringify(e.list) !== JSON.stringify(a.marking || []) || JSON.stringify(E.normaliseBands(e.bands)) !== JSON.stringify(E.normaliseBands(a.markingBands)); }
  window.addEventListener('beforeunload', (ev) => { if (me() && hasUnsaved()) { ev.preventDefault(); ev.returnValue = ''; } });

  /** Marking list cell: the content mark so far. */
  function contentCell(s, a) {
    if (!(a.marking || []).length || s.stage !== 'handed_in') return '<span class="muted">–</span>';
    const sc = E.contentScore(a.marking, s.review.content, a.markingBands);
    if (!sc.marked) return '<span class="muted"' + tip('Not marked against the grading rubric yet') + '>–</span>';
    return sc.complete ? '<b' + tip(fmtPts(sc.earned) + ' of ' + fmtPts(sc.possible) + ' points') + '>' + Math.round(sc.pct * 100) + '%</b>'
      : '<span class="muted"' + tip(sc.marked + ' of ' + sc.total + ' criteria marked') + '>' + sc.marked + '/' + sc.total + '</span>';
  }

  const MARKING_ACTIONS = {
    'mr-add': (el) => { mrList(el.dataset.scope).push(blankCriterion()); if (ui.wiz) ui.wiz.error = ''; if (ui.mrEdit) ui.mrEdit.error = ''; render(); const ins = $$('.mr-name input'); if (ins.length) ins[ins.length - 1].focus(); },
    'mr-remove': (el) => {
      const list = mrList(el.dataset.scope); const c = list[Number(el.dataset.k)];
      if (c && (c.name || Object.values(c.levels || {}).some(Boolean)) && !window.confirm('Remove "' + (c.name || 'this criterion') + '"?')) return;
      list.splice(Number(el.dataset.k), 1); render();
    },
    'mr-template': (el) => {
      const list = mrList(el.dataset.scope); const t = E.MARKING_TEMPLATES[el.dataset.key];
      if (list.length && !window.confirm('Replace your ' + plural(list.length, 'criterion', 'criteria') + ' with the ' + t.label + ' template?')) return;
      list.splice(0, list.length, ...E.markingFromTemplate(el.dataset.key, uid('mc-')));
      if (ui.wiz) ui.wiz.error = ''; if (ui.mrEdit) ui.mrEdit.error = '';
      render();
    },
    'open-mrubric': (el) => {
      const [view, id] = location.hash.replace('#', '').split('/');
      ui.mrFrom = { view: view || 'home', id };
      ui.mrEdit = null;
      go('mrubric', el.dataset.id);
    },
    'mr-cancel': () => { const f = ui.mrFrom; const aid = ui.mrEdit && ui.mrEdit.aid; ui.mrEdit = null; f && f.view !== 'mrubric' ? go(f.view, f.id) : go('rules', aid); },
    'mr-save': () => {
      const e = ui.mrEdit; const a = asg(e.aid);
      const problem = markingProblem(e.list) || E.bandsProblem(e.bands);
      if (problem) { e.error = problem; render(); window.scrollTo(0, 0); return; }
      a.marking = cleanMarking(e.list);
      a.markingBands = E.normaliseBands(e.bands);
      const ids = new Set(a.marking.map((c) => c.id));
      asgSubs(a.id).forEach((s) => { const m = s.review.content || {}; Object.keys(m).forEach((k) => { if (!ids.has(k)) delete m[k]; }); });
      save();
      toast('Grading rubric saved for ' + a.short + '.');
      ui.mrEdit = null;
      const f = ui.mrFrom;
      if (f && !['rules', 'mrubric'].includes(f.view)) go(f.view, f.id); else go('mrubric', a.id);
    },
    'mr-mark': (el) => {
      const s = sub(ui.subId); if (!s) return;
      const a = asg(s.assignmentId); const c = (a.marking || []).find((x) => x.id === el.dataset.crit); if (!c) return;
      const d = gradeDraft(s);
      const cur = d.content[c.id] || {};
      const top = E.levelRanges(c.points, a.markingBands)[el.dataset.level][1];
      const curScore = E.criterionScore(c, cur, a.markingBands);
      // Clicking the level that is already chosen at its top score clears it; otherwise give that level's top score.
      d.content[c.id] = curScore === top && E.levelForScore(curScore, c.points, a.markingBands) === el.dataset.level
        ? Object.assign({}, cur, { score: null, level: null })
        : Object.assign({}, cur, { score: top, level: el.dataset.level });
      d.dirty = true;
      render();
    },
    'rail-widen': () => {
      const layout = $('.sub-layout'); if (!layout) return;
      setPref('railWidth', setRailWidth(layout, railWidth() >= RAIL_WIDE - 40 ? RAIL_DEFAULT : RAIL_WIDE));
      render();
    },
    'grade-save': async (el) => {
      const s = sub(ui.subId); const d = ui.gradeDraft;
      if (!s || !d || d.subId !== s.id || !d.dirty) return;
      const a = asg(s.assignmentId);
      s.review.content = clone(d.content);
      s.review.feedback = d.feedback;
      s.review.contentSavedAt = new Date().toISOString();
      s.review.contentSavedBy = me().name;
      el.disabled = true; el.textContent = 'Saving…';
      const ok = await saveNow();
      if (ok) {
        d.dirty = false;
        const sc = E.contentScore(a.marking, s.review.content, a.markingBands);
        toast('Marks saved for ' + subName(s) + ': ' + fmtPts(sc.earned) + ' / ' + fmtPts(sc.possible) + (sc.complete ? ' (' + Math.round(sc.pct * 100) + '%)' : ', ' + sc.marked + ' of ' + sc.total + ' criteria marked') + '.');
      } else toast('The marks could not be saved. Check that the server is running, then press Save marks again.', true);
      render();
    },
    'grade-discard': () => {
      if (!window.confirm('Discard your unsaved marks?')) return;
      ui.gradeDraft = null; render();
    },
    'mr-comment-open': (el) => { ui.mrComment[el.dataset.crit] = true; render(); const t = $('.mr-comment[data-crit="' + el.dataset.crit + '"]'); if (t) t.focus(); }
  };
  const MARKING_INPUTS = {
    'mr-band': (el) => { const b = el.dataset.scope === 'wiz' ? ui.wiz.data.bands : ui.mrEdit.bands; b[el.dataset.k] = el.value === '' ? '' : Math.round(Number(el.value)); },
    'mr-score': (el) => {
      const s = sub(ui.subId); if (!s) return;
      const a = asg(s.assignmentId); const c = (a.marking || []).find((x) => x.id === el.dataset.crit); if (!c) return;
      const d = gradeDraft(s);
      const cur = d.content[c.id] || {};
      if (el.value === '') { d.content[c.id] = Object.assign({}, cur, { score: null, level: null }); }
      else {
        const v = Math.max(0, Math.min(Number(c.points), Math.round(Number(el.value) * 2) / 2));
        d.content[c.id] = Object.assign({}, cur, { score: v, level: E.levelForScore(v, c.points, a.markingBands) });
      }
      markGradeDirty();
      // Update the page in place so typing is not interrupted: light up the matching level and refresh the total.
      const box = el.closest('.mr-crit');
      if (box) {
        const sc = E.criterionScore(c, d.content[c.id], a.markingBands);
        const lvl = sc != null ? E.levelForScore(sc, c.points, a.markingBands) : null;
        box.querySelectorAll('.mr-level').forEach((b) => { const on = b.dataset.level === lvl; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        box.classList.toggle('done', !!lvl);
        el.closest('.mr-points').classList.toggle('has', sc != null);
        const slot = box.querySelector('.mr-desc-slot'); if (slot) slot.innerHTML = levelDescHtml(c, lvl);
      }
      const sum = $('#mrSummary'); if (sum) sum.innerHTML = markSummaryHtml(E.contentScore(a.marking, d.content, a.markingBands));
    },
    mr: (el) => {
      const c = mrList(el.dataset.scope)[Number(el.dataset.k)]; if (!c) return;
      const f = el.dataset.f;
      if (f.indexOf('level:') === 0) { c.levels = c.levels || {}; c.levels[f.slice(6)] = el.value; }
      else if (f === 'points') c.points = Math.max(0, Math.round(Number(el.value) || 0));
      else c[f] = el.value;
    },
    'mr-comment': (el) => {
      const s = sub(ui.subId); if (!s) return;
      const d = gradeDraft(s);
      d.content[el.dataset.crit] = Object.assign({}, d.content[el.dataset.crit], { comment: el.value });
      markGradeDirty();
    },
    'mr-feedback': (el) => { const s = sub(ui.subId); if (!s) return; gradeDraft(s).feedback = el.value; markGradeDirty(); }
  };

  /* ------------------------------------------------------------------ */
  /* Adjust Rubrics → AI detection: one sensitivity setting for Gemini's */
  /* AI evaluation and the flag rules, plus Gemini's options.            */
  /* ------------------------------------------------------------------ */
  const GEMINI_LINE = {
    cautious: 'Only colours text that clearly matches a reply in the chat log.',
    balanced: 'Colours text with good evidence in the chat log; gives the benefit of the doubt.',
    strict: 'Also colours reworded and paraphrased AI text.'
  };
  /** The AI detection settings in the last saved version (what AI evaluation uses). */
  const savedAi = (a) => { const v = (a.rubricVersions || []).length ? lastVersion(a) : null; return E.normaliseSettings(v ? v.settings : a.settings).ai; };
  const aiKey = (d) => { const x = Object.assign({}, E.DEFAULT_AI, d || {}); return x.sensitivity + '|' + !!x.unlogged + '|' + !!x.brainstorm; };
  const sameAi = (x, y) => aiKey(x) === aiKey(y);

  function detectionPage(a, lab) {
    const ai = a.settings.ai;
    const st = stats(a);
    const evaluated = asgSubs(a.id).filter((s) => s.aiEval);
    const saved = savedAi(a);
    const older = evaluated.filter((s) => !sameAi(s.aiEval.detection, saved)).length;
    const cards = Object.keys(E.AI_SENSITIVITY).map((k) => {
      const x = E.AI_SENSITIVITY[k]; const p = E.PRESETS[x.preset]; const on = ai.sensitivity === k;
      return '<button type="button" class="sens-card s-' + k + (on ? ' on' : '') + '" data-action="ai-sensitivity" data-key="' + k + '" aria-pressed="' + on + '">' +
        '<span class="sens-top"><span class="sens-meter" aria-hidden="true"><i></i><i></i><i></i></span><b>' + x.label + '</b>' + (on ? '<span class="pill ok-pill">In use</span>' : '') + '</span>' +
        '<span class="sens-text">' + x.text + '</span>' +
        '<span class="sens-line"><b>AI evaluation (Gemini)</b>' + GEMINI_LINE[k] + '</span>' +
        '<span class="sens-line"><b>Flag rules</b>' + p.label + ' preset: reflections under ' + p.minWords + ' words, below level ' + p.minLevel + ', or ' + p.sharedPct + '%+ shared wording are flagged.</span></button>';
    }).join('');
    const opt = (key, title, text) => '<div class="det-opt"><span><b>' + title + '</b><small>' + text + '</small></span>' +
      '<label class="switch"' + tip(ai[key] ? 'Turn off' : 'Turn on') + '><input type="checkbox" data-change="ai-opt" data-key="' + key + '"' + (ai[key] ? ' checked' : '') + '><span></span><span class="sr">' + title + '</span></label></div>';
    const custom = a.settings.preset === 'custom' || E.AI_SENSITIVITY[ai.sensitivity].preset !== a.settings.preset;
    return '<section class="panel det-intro"><div class="panel-pad">' + rubricTag('detect') +
        '<h2>How Trace looks for AI use in ' + esc(a.short) + '</h2>' +
        '<div class="det-two"><div><b>' + ICON.chat + 'AI evaluation (Gemini)</b><p>Reads the final submission and the chat log, colours the parts that look like AI and links them to the prompts behind them. Runs when a marker turns on AI evaluation on a submission.</p></div>' +
        '<div><b>' + ICON.flag + 'Flag rules</b><p>Check every step of the chat log: the student\'s reflection, what they did with the reply, and how much wording they copied. Run automatically on every submission.</p></div></div>' +
        '<p class="det-note">Choose how sensitive both should be. These are prompts for you to look closer, never proof of misconduct.</p>' +
      '</div></section>' +
      '<div class="rubric-workspace">' +
        '<div class="rw-col"><h2 class="rw-title">Sensitivity</h2>' +
          '<section class="panel"><div class="panel-pad"><div class="sens-grid" role="group" aria-label="AI detection sensitivity">' + cards + '</div>' +
            '<p class="impact">With these flag rules, <b>' + st.flaggedStudents + ' of ' + st.active.length + '</b> students in ' + esc(a.short) + ' are flagged.</p>' +
            (custom ? '<p class="hint">You have fine-tuned the flag rules, so they no longer match the ' + E.AI_SENSITIVITY[ai.sensitivity].label + ' preset. Choosing a sensitivity again resets them.</p>' : '') +
          '</div></section>' +
          '<section class="panel"><div class="panel-header compact"><div><h2>AI evaluation options</h2><p>Sent to Gemini with every evaluation for this assignment.</p></div></div><div class="panel-pad det-opts">' +
            opt('unlogged', 'Flag AI-like text with no matching prompt', 'Shown as "Not recorded". Useful for spotting AI use the student did not paste, but more likely to misfire.') +
            opt('brainstorm', 'Count ideas from brainstorming as AI help', 'When on, a paragraph that develops an idea ChatGPT suggested counts as "Changed". When off, it counts as the student\'s own writing.') +
          '</div></section>' +
          '<section class="panel"><div class="panel-pad det-status">' + ICON.info + '<p>' + (evaluated.length
            ? plural(evaluated.length, 'submission has', 'submissions have') + ' an AI evaluation. ' + (older ? '<b>' + plural(older, 'was', 'were') + ' run with older settings</b> and show a "re-run" note to markers; Gemini only runs again when a marker asks.' : 'All of them use the saved settings.')
            : 'No submissions have an AI evaluation yet.') + ' Changes count once you press <b>Save changes</b>.</p></div></section>' +
          lab.tests +
        '</div>' +
        '<div class="rw-col"><h2 class="rw-title">Fine-tune the flag rules</h2>' + lab.lab + '</div>' +
      '</div>';
  }

  /** AI use rubric tab: what the rubric is for, and where its strictness is set. */
  function aiRubricHelp(a) {
    const ai = a.settings.ai;
    return '<section class="panel ai-rubric-panel"><div class="panel-pad ai-help">' +
      '<p>On each submission, open <b>AI interactions and rubric</b>. Every prompt in the student\'s chat log has these criteria beside it, and you mark each one <b>Approve</b>, <b>Flag</b> or <b>Comment</b>.</p>' +
      '<p>Criteria taken from the flag rules are pre-checked by the rules, so you can see where to look. How strict those rules are, and how readily Gemini marks text as AI, is set on the <b>AI detection</b> tab.</p>' +
      '<p class="det-now">' + ICON.shield + 'AI detection is <b>' + E.AI_SENSITIVITY[ai.sensitivity].label + '</b></p>' +
      '<button type="button" class="secondary-button" data-action="go" data-view="detect" data-id="' + a.id + '">Change AI detection settings →</button>' +
      '<p class="hint">The grading rubric for the work itself is on the <b>Grading rubric</b> tab and is marked separately.</p>' +
    '</div></section>';
  }

  const DETECT_ACTIONS = {
    'ai-sensitivity': (el) => {
      const k = el.dataset.key; const x = E.AI_SENSITIVITY[k];
      changeSettings((a) => { a.settings = E.applyPreset(a.settings, x.preset); a.settings.ai = Object.assign({}, a.settings.ai, { sensitivity: k }); }, 'AI detection set to ' + x.label + '. Press Save changes to use it.');
    }
  };
  const DETECT_CHANGES = {
    'ai-opt': (el) => changeSettings((a) => { a.settings.ai = Object.assign({}, a.settings.ai, { [el.dataset.key]: el.checked }); })
  };

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  function closeSidebar() { $('.sidebar').classList.remove('open'); $('.drawer-backdrop').classList.remove('open'); }
  const curSub = () => sub(ui.subId);

  const ACTIONS = {
    'auth-tab': (el) => { ui.authTab = el.dataset.tab; ui.authError = ''; renderAuth(); },
    'fill-demo': (el) => { const d = el.dataset.role === 'student' ? DEMO_STUDENT : DEMO_USER; $('#authRoot [name=username]').value = d.username; $('#authRoot [name=password]').value = d.password; },
    'auth-role': (el) => { ui.authRole = el.dataset.role; ui.authTab = 'login'; ui.authError = ''; renderAuth(); },
    logout: () => {
      const u = me();
      openModal('ACCOUNT', 'Log out of Trace?', 'You are signed in as ' + esc(u ? u.name : 'this teacher') + '. You will need to log in again to ' + (isStudent() ? 'hand in work.' : 'keep marking.'),
        '<form data-form="logout">' + (ui.timer ? '<p class="modal-note">Your marking timer for this student will stop and the time so far is kept.</p>' : '') +
        '<div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Log out</button></div></form>', true);
      setTimeout(() => { const b = $('#modalRoot [data-action=close-modal].secondary-button'); if (b) b.focus(); }, 70);
    },
    'confirm-logout': () => {
      if (ui.timer) stopTimer(true);
      const name = me() ? me().first || me().name : '';
      ui.authRole = isStudent() ? 'student' : 'teacher'; // come back to the same tab
      if (mode === 'backend') API.logout();
      setSession(null);
      if (mode === 'backend') { state = blankRemoteState(); normalise(); }
      Object.assign(ui, { authTab: 'login', authError: '', courseMenu: false, courseId: null, assignmentId: null, subId: null, stu: null });
      document.body.classList.remove('is-student');
      closeModal(); closeSidebar();
      history.replaceState(null, '', location.pathname + location.search);
      renderAuth();
      if (name) toast('Logged out. See you soon, ' + name + '.');
    },
    go: (el) => {
      if (!el.dataset.view || (el.dataset.view === 'review' && !el.dataset.id)) return;
      if (el.dataset.course) ui.peopleCourse = el.dataset.course;
      go(el.dataset.view, el.dataset.id || undefined);
    },
    'toggle-course-menu': () => { ui.courseMenu = !ui.courseMenu; renderSidebar(); },
    'pick-course': (el) => {
      ui.courseMenu = false;
      const id = el.dataset.id;
      if (isStudent()) return id ? go('scourse', id) : go('student');
      if (ui.view === 'reviews') { ui.courseId = id || null; return go('reviews', id || 'all'); }
      return id ? go('course', id) : (ui.courseId = null, go('home'));
    },
    'toggle-sidebar': () => { $('.sidebar').classList.toggle('open'); $('.drawer-backdrop').classList.toggle('open'); },
    'close-sidebar': closeSidebar,
    'home-filter': (el) => { ui.homeFilter = ui.homeFilter === el.dataset.filter && el.classList.contains('metric-card') ? 'all' : el.dataset.filter; render(); },
    'sort-review': () => { ui.sort = 'review'; render(); $('#students-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'filter-rule': (el) => { if (ui.view === 'reviews') return drillToMarking('ruleFilter', el.dataset.rule); ui.ruleFilter = ui.ruleFilter === el.dataset.rule ? null : el.dataset.rule; render(); },
    'filter-level': (el) => { if (ui.view === 'reviews') return drillToMarking('levelFilter', Number(el.dataset.level)); const l = Number(el.dataset.level); ui.levelFilter = ui.levelFilter === l ? null : l; render(); },
    'filter-decision': (el) => { if (ui.view === 'reviews') return drillToMarking('decisionFilter', el.dataset.key); ui.decisionFilter = ui.decisionFilter === el.dataset.key ? null : el.dataset.key; render(); },
    'clear-filter': (el) => { ui[el.dataset.key] = el.dataset.key === 'onlyFlagged' ? false : null; render(); },
    jump: (el, ev) => { ev.preventDefault(); const t = document.getElementById('step-' + el.dataset.id); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.classList.add('pulse'); setTimeout(() => t.classList.remove('pulse'), 1200); } },
    mark: (el) => {
      const s = curSub();
      const { iid, cid, mark } = el.dataset;
      const key = iid + '|' + cid;
      if (mark === 'comment') {
        const saved = ((s.review.marks[iid] || {})[cid] || {}).comment;
        if (saved) ui.critEdit[key] = !ui.critEdit[key]; else ui.critOpen[key] = !ui.critOpen[key];
        render(); const ta = $('#cc-' + CSS.escape(iid) + '-' + CSS.escape(cid)); if (ta) ta.focus(); return;
      }
      const m = s.review.marks[iid] = s.review.marks[iid] || {};
      const x = m[cid] = m[cid] || { mark: null, comment: '' };
      x.mark = x.mark === mark ? null : mark;
      touchReview(s); save(); render();
    },
    'save-rubric': () => {
      const a = asg(ui.rubricAid); if (!a) return;
      if (commitVersion(a, ui.versionNote)) { ui.versionNote = ''; ui.caseChanged = {}; ui.lastImpact = null; save(); render(); toast('Saved as version ' + lastVersion(a).n + ' of the ' + a.short + ' rubric.'); }
    },
    'discard-rubric': () => {
      const a = asg(ui.rubricAid); if (!a) return;
      if (!window.confirm('Discard your unsaved changes to the ' + a.short + ' rubric?')) return;
      discardRubric(a); render(); toast('Changes discarded. Back to version ' + lastVersion(a).n + '.');
    },
    'restore-version': (el) => {
      const a = asg(ui.rubricAid); const v = a && (a.rubricVersions || []).find((x) => x.id === el.dataset.vid); if (!v) return;
      a.rubric = clone(v.rubric); a.settings = clone(v.settings);
      ui.versionNote = 'Restored from version ' + v.n; ui.caseChanged = {}; ui.lastImpact = null;
      save(); render(); toast('Version ' + v.n + ' loaded. Save to make it the current rubric.');
    },
    'toggle-add-crit': (el) => {
      ui.addCrit = ui.addCrit === el.dataset.iid ? null : el.dataset.iid;
      render();
      if (ui.addCrit) { const inp = $('.add-crit.inline input[name="name"]'); if (inp) inp.focus(); }
    },
    'approve-rest': (el) => {
      const s = curSub(); const a = asg(s.assignmentId);
      const m = s.review.marks[el.dataset.iid] = s.review.marks[el.dataset.iid] || {};
      a.rubric.forEach((c) => { m[c.id] = m[c.id] || { mark: null, comment: '' }; if (!m[c.id].mark) m[c.id].mark = 'approve'; });
      touchReview(s); save(); render();
    },
    'sub-approve': () => { const s = curSub(); s.review.decision = s.review.decision === 'approve' ? null : 'approve'; touchReview(s); save(); render(); if (s.review.decision) toast(subName(s) + ' approved.'); },
    'sub-flag': () => { const s = curSub(); s.review.decision = s.review.decision === 'flag' ? null : 'flag'; if (s.review.decision) ui.railComment = true; touchReview(s); save(); render(); if (s.review.decision) { toast(subName(s) + ' flagged for follow-up. Add a comment to say why.'); const ta = $('.rail-comment textarea'); if (ta) ta.focus(); } },
    'sub-comment': () => {
      const s = curSub();
      if (s.review.comment) { ui.railCommentEdit = !ui.railCommentEdit; } else ui.railComment = !ui.railComment;
      render(); const ta = $('#rail-comment-input'); if (ta) ta.focus();
    },
    'sub-comment-post': () => {
      const s = curSub(); const ta = $('#rail-comment-input'); const text = ta ? ta.value.trim() : '';
      if (!text) { toast('Write a comment first.', true); return; }
      s.review.comment = text; ui.railComment = false; ui.railCommentEdit = false;
      touchReview(s); save(); render(); toast('Comment posted.');
    },
    'sub-comment-cancel': () => { ui.railComment = false; ui.railCommentEdit = false; render(); },
    'sub-comment-edit': () => { ui.railCommentEdit = true; render(); const ta = $('#rail-comment-input'); if (ta) ta.focus(); },
    'sub-comment-delete': () => { const s = curSub(); s.review.comment = ''; ui.railComment = false; ui.railCommentEdit = false; touchReview(s); save(); render(); toast('Comment deleted.'); },
    'crit-comment-post': (el) => {
      const s = curSub(); const { iid, cid } = el.dataset; const key = iid + '|' + cid;
      const ta = $('#cc-' + CSS.escape(iid) + '-' + CSS.escape(cid)); const text = ta ? ta.value.trim() : '';
      if (!text) { toast('Write a comment first.', true); return; }
      const m = s.review.marks[iid] = s.review.marks[iid] || {};
      const x = m[cid] = m[cid] || { mark: null, comment: '' };
      x.comment = text; ui.critOpen[key] = false; ui.critEdit[key] = false;
      touchReview(s); save(); render(); toast('Comment posted.');
    },
    'crit-comment-cancel': (el) => { const key = el.dataset.iid + '|' + el.dataset.cid; ui.critOpen[key] = false; ui.critEdit[key] = false; render(); },
    'crit-comment-edit': (el) => { const key = el.dataset.iid + '|' + el.dataset.cid; ui.critEdit[key] = true; render(); },
    'crit-comment-delete': (el) => {
      const s = curSub(); const { iid, cid } = el.dataset; const x = (s.review.marks[iid] || {})[cid];
      if (x) x.comment = '';
      ui.critOpen[iid + '|' + cid] = false; ui.critEdit[iid + '|' + cid] = false;
      touchReview(s); save(); render(); toast('Comment deleted.');
    },
    timer: (el) => {
      const s = sub(el.dataset.id);
      if (ui.timer && ui.timer.subId === s.id) { stopTimer(); }
      else { if (ui.timer) stopTimer(true); ui.timer = { subId: s.id, start: Date.now() }; s.review.status = s.review.status === 'not_reviewed' ? 'in_progress' : s.review.status; save(); }
      render();
    },
    preset: (el) => changeSettings((a) => { a.settings = E.applyPreset(a.settings, el.dataset.preset); a.settings.ai = Object.assign({}, a.settings.ai, { sensitivity: E.SENSITIVITY_FOR_PRESET[el.dataset.preset] || a.settings.ai.sensitivity }); }, E.PRESETS[el.dataset.preset].label + ' preset applied to ' + asg(ui.assignmentId).short + '.'),
    'reset-vocab': () => changeSettings((a) => { a.settings.vocab = clone(E.DEFAULT_VOCAB); }, 'Default word lists restored.'),
    'remove-criterion': (el) => { const a = asg(ui.assignmentId); a.rubric = a.rubric.filter((x) => x.id !== el.dataset.cid); save(); render(); toast('Criterion removed. Marks already given are kept in the backup but no longer shown.'); },
    'print-student': (el) => printStudent(el.dataset.id),
    'print-class': () => printClass(asg(ui.assignmentId)),
    'export-class-csv': () => exportClassCsv(asg(ui.assignmentId)),
    'export-rubric-csv': () => exportRubricCsv(asg(ui.assignmentId)),
    'export-interactions-csv': () => exportInteractionsCsv(asg(ui.assignmentId)),
    'export-json': () => download('lane2-backup-' + stamp() + '.json', JSON.stringify(state, null, 2), 'application/json'),
    'export-rules': () => { const a = asg(ui.assignmentId); download(fileBase(a) + '-rules-' + stamp() + '.json', JSON.stringify(a.settings, null, 2), 'application/json'); },
    'new-assignment': (el) => { if (!myCourses().length) { toast('Add a course first, then set its assignments.'); return ACTIONS['new-course'](); } ui.wiz = newWizard(el.dataset.course); go('newasg'); },
    'wiz-date': (el) => { ui.wiz.data.dueDate = el.dataset.date; ui.wiz.error = ''; ui.wiz.calOpen = false; render(); },
    'wiz-cal-toggle': () => { ui.wiz.calOpen = !ui.wiz.calOpen; if (ui.wiz.calOpen && ui.wiz.data.dueDate) ui.wiz.calMonth = ui.wiz.data.dueDate.slice(0, 7); render(); },
    'wiz-cal': (el) => { const [y, m] = ui.wiz.calMonth.split('-').map(Number); ui.wiz.calMonth = ymd(new Date(y, m - 1 + Number(el.dataset.step), 1)).slice(0, 7); render(); },
    'wiz-next': () => {
      const w = ui.wiz;
      if (w.step === 1) { const miss = wizardMissing(w.data); if (miss.length) { w.error = 'Add ' + listText(miss) + ' before moving on.'; render(); return; } }
      if (w.step === 2) { const problem = markingProblem(w.data.marking) || E.bandsProblem(w.data.bands); if (problem) { w.error = problem; render(); window.scrollTo(0, 0); return; } }
      w.error = ''; w.step = Math.min(3, w.step + 1); render(); window.scrollTo(0, 0);
    },
    'wiz-back': (el) => { ui.wiz.step = el && el.dataset.to ? Number(el.dataset.to) : Math.max(1, ui.wiz.step - 1); ui.wiz.error = ''; render(); },
    'wiz-preset': (el) => { ui.wiz.data.preset = el.dataset.preset; render(); },
    'wiz-toggle-add': () => { ui.wiz.adding = !ui.wiz.adding; render(); const n = $('#wiz-crit-name'); if (n) n.focus(); },
    'wiz-add-crit': () => {
      const name = ($('#wiz-crit-name').value || '').trim().slice(0, 60);
      if (!name) { toast('Give the criterion a name.', true); return; }
      ui.wiz.data.customs.push({ name, description: ($('#wiz-crit-desc').value || '').trim().slice(0, 200) });
      ui.wiz.adding = false; render();
    },
    'wiz-remove-crit': (el) => { ui.wiz.data.customs.splice(Number(el.dataset.k), 1); render(); },
    'wiz-cancel': () => {
      const d = ui.wiz.data;
      if ((d.title || d.short || d.dueDate) && !window.confirm('Leave without saving? Use "Save as draft" to keep it for later.')) return;
      ui.wiz = null; go('courses');
    },
    'wiz-draft': () => {
      if (mode === 'backend') { toast('Draft assignments are not yet stored in Supabase. Complete the assignment to save it.', true); return; }
      const w = ui.wiz;
      state.drafts = state.drafts || [];
      let d = w.draftId && state.drafts.find((x) => x.id === w.draftId);
      if (!d) { d = { id: uid('d-'), owner: me().id }; state.drafts.push(d); }
      Object.assign(d, { step: w.step, data: clone(w.data), updatedAt: new Date().toISOString() });
      ui.wiz = null; save(); go('courses');
      toast('Draft saved. Continue it any time from Drafts on this page.');
    },
    'wiz-draft-delete': (el) => {
      if (!window.confirm('Delete this draft? This cannot be undone.')) return;
      state.drafts = (state.drafts || []).filter((x) => x.id !== el.dataset.id); save(); render(); toast('Draft deleted.');
    },
    'wiz-create': async () => {
      const w = ui.wiz; const d = w.data;
      const miss = wizardMissing(d); if (miss.length) { w.step = 1; w.error = 'Add ' + listText(miss) + ' before creating the assignment.'; render(); return; }
      const problem = markingProblem(d.marking) || E.bandsProblem(d.bands); if (problem) { w.step = 2; w.error = problem; render(); return; }
      const c = course(d.courseId);
      const a = { id: uid('a-'), courseId: c.id, title: d.title.trim(), short: d.short.trim(), description: d.description.trim(), dueDate: d.dueDate, wordLimit: Number(d.wordLimit) || 0, lane: 2,
        settings: Object.assign(E.applyPreset(E.defaultSettings(), d.preset || 'standard'), { ai: Object.assign({}, E.DEFAULT_AI, { sensitivity: E.SENSITIVITY_FOR_PRESET[d.preset || 'standard'] || 'balanced' }) }),
        markingBands: E.normaliseBands(d.bands),
        rubric: d.rules.map((k) => ({ id: 'cr-' + k, type: 'rule', ruleKey: k })).concat(d.customs.map((x) => ({ id: uid('cr-'), type: 'custom', name: x.name, description: x.description }))),
        marking: cleanMarking(d.marking) };
      if (mode === 'backend') {
        await remoteMutation(() => API.post('/assignments', assignmentPayload(a)), (result) => {
          if (!result) return;
          ui.wiz = null; go('assignment', result.assignment.id);
          toast(a.short + ' created for ' + c.code + '. ' + plural(c.roster.length, 'student') + ' can now attach their AI logs.');
        });
        return;
      }
      state.assignments.push(a);
      c.roster.forEach((r) => state.submissions.push(emptySubmission(a, r.studentId)));
      if (w.draftId) state.drafts = (state.drafts || []).filter((x) => x.id !== w.draftId);
      ui.wiz = null; save(); go('assignment', a.id);
      toast(a.short + ' created for ' + c.code + '. ' + plural(c.roster.length, 'student') + ' can now attach their AI logs.');
    },
    'edit-assignment': (el) => assignmentForm(asg(el.dataset.aid)),
    'new-course': () => openModal('NEW COURSE', 'Add a course', 'Courses you teach appear on the All courses page and in the sidebar drop-down.',
      '<form data-form="new-course"><div class="form-grid"><label>Course code<input name="code" required maxlength="20" placeholder="e.g. INFOSYS 340"></label><label>Semester<input name="semester" required value="Semester 2 · 2026"></label></div><label>Course name<input name="name" required placeholder="e.g. Business Process Management"></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Add course</button></div></form>', true),
    'new-student': () => {
      const cid = course(ui.peopleCourse) ? ui.peopleCourse : (ui.courseId || '');
      openModal('ENROLMENT', 'Add a student', 'Enrol an existing student in a course, or create a new one. They get an empty submission for every assignment in that course.',
        '<form data-form="new-student"><label>Course<select name="courseId">' + myCourses().map((c) => '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.code) + '</option>').join('') + '</select></label>' +
        '<label>Existing student <span class="optional">(leave blank to create a new one)</span><select name="existing"><option value="">New student…</option>' + myStudents().sort((x, y) => fullName(x).localeCompare(fullName(y))).map((p) => '<option value="' + p.id + '">' + esc(fullName(p) + ' (' + p.upi + ')') + '</option>').join('') + '</select></label>' +
        '<div class="form-grid"><label>First name<input name="firstName"></label><label>Last name<input name="lastName"></label><label>UPI<input name="upi"></label><label>Email<input name="email" type="email"></label></div>' +
        '<label>Group<input name="group" value="Tutorial A"></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Add student</button></div></form>', true);
    },
    'import-students': () => {
      if (!myCourses().length) { toast('Add a course first, then import its class list.', true); return; }
      const cid = course(ui.peopleCourse) ? ui.peopleCourse : (ui.courseId || '');
      csvImport = null;
      openModal('ENROLMENT', 'Import a class list', 'Upload a CSV to enrol a whole class at once. Each student gets an empty submission for every assignment in the course.',
        '<form data-form="import-students"><div class="form-grid"><label>Course<select name="courseId">' + myCourses().map((c) => '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.code) + '</option>').join('') + '</select></label>' +
        '<label>Default group <span class="optional">(if the file has none)</span><input name="group" value="Tutorial A"></label></div>' +
        '<label>CSV file<div class="file-drop">' + ICON.doc + '<div><span><strong>Choose a CSV file</strong> or drag it here</span><small>Columns: First name, Last name, UPI, Email, Group (optional). Canvas class lists work too.</small></div><input type="file" name="file" accept=".csv,text/csv" data-change="import-students-file" aria-label="CSV file"></div></label>' +
        '<div id="csvPreview"></div>' +
        '<div class="modal-actions spread"><button type="button" class="text-button" data-action="csv-template">' + ICON.download + 'Download template</button><span><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button" disabled>Import students</button></span></div></form>', true);
    },
    'csv-template': () => download('class-list-template.csv', '\uFEFF' + csv(CSV_TEMPLATE), 'text/csv'),
    'people-course': (el) => { ui.peopleCourse = el.dataset.id; render(); },
    'close-modal': closeModal,
    'modal-backdrop': (el, ev) => { if (ev.target === el) closeModal(); },
    'copy-embed': (el) => copyText(embedUrl(asg(el.dataset.aid)), 'Canvas embed link'),
    'delete-course': async (el) => {
      const c = course(el.dataset.cid);
      const aids = courseAssignments(c.id).map((a) => a.id);
      if (!confirm('Remove ' + c.code + ' with its ' + plural(aids.length, 'assignment') + ' and all their submissions? Students stay in the People list.')) return;
      if (mode === 'backend') {
        const code = c.code;
        await remoteMutation(() => API.delete('/courses/' + c.id), () => {
          if (ui.courseId === c.id) { ui.courseId = null; ui.assignmentId = null; }
          render(); toast(code + ' removed.');
        });
        return;
      }
      state.courses = state.courses.filter((x) => x !== c);
      state.assignments = state.assignments.filter((a) => !aids.includes(a.id));
      state.submissions = state.submissions.filter((s) => !aids.includes(s.assignmentId));
      if (ui.courseId === c.id) { ui.courseId = null; ui.assignmentId = null; }
      save(); render(); toast(c.code + ' removed.');
    },
    'delete-assignment': async (el) => {
      const a = asg(el.dataset.aid);
      if (!confirm('Remove ' + a.short + ' (' + a.title + ') and all its submissions and reviews?')) return;
      if (mode === 'backend') {
        const short = a.short; const courseId = a.courseId;
        await remoteMutation(() => API.delete('/assignments/' + a.id), () => {
          if (ui.assignmentId === a.id) ui.assignmentId = defaultAssignment(courseId);
          render(); toast(short + ' removed.');
        });
        return;
      }
      state.assignments = state.assignments.filter((x) => x !== a);
      state.submissions = state.submissions.filter((s) => s.assignmentId !== a.id);
      if (ui.assignmentId === a.id) ui.assignmentId = defaultAssignment(a.courseId);
      save(); render(); toast(a.short + ' removed.');
    },
    unenrol: async (el) => {
      const c = course(el.dataset.cid); const p = person(el.dataset.pid);
      const aids = courseAssignments(c.id).map((a) => a.id);
      if (!confirm('Remove ' + fullName(p) + ' from ' + c.code + '? Their submissions for this course are deleted.')) return;
      if (mode === 'backend') {
        await remoteMutation(() => API.delete('/courses/' + c.id + '/enrolments/' + p.id));
        return;
      }
      c.roster = c.roster.filter((r) => r.studentId !== p.id);
      state.submissions = state.submissions.filter((s) => !(s.studentId === p.id && aids.includes(s.assignmentId)));
      save(); render();
    },
    'delete-student': async (el) => {
      const p = person(el.dataset.pid);
      if (!confirm('Delete ' + fullName(p) + ' from all your courses, with their submissions?')) return;
      if (mode === 'backend') {
        const name = fullName(p);
        await remoteMutation(() => API.delete('/students/' + p.id), () => { render(); toast(name + ' deleted.'); });
        return;
      }
      const aids = myAssignments().map((a) => a.id);
      myCourses().forEach((c) => { c.roster = c.roster.filter((r) => r.studentId !== p.id); });
      state.submissions = state.submissions.filter((s) => !(s.studentId === p.id && aids.includes(s.assignmentId)));
      // Keep the student record if another teacher still has them enrolled.
      if (!state.courses.some((c) => c.roster.some((r) => r.studentId === p.id))) state.students = state.students.filter((x) => x !== p);
      save(); render();
    },
    'reset-demo': async () => {
      if (mode === 'backend') { toast('Demo reset is disabled for the production backend.', true); return; }
      if (!confirm('Replace all current data with the demo courses? Download a backup first if you want to keep your changes.')) return;
      if (mode === 'server') { const r = await fetch('/api/reset', { method: 'POST' }); state = await r.json(); }
      else { state = clone(window.SEED_DATA); try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
      normalise(); ui.timer = null; ui.courseId = null; ui.assignmentId = null;
      go('home'); setSync(); toast('Demo data restored.');
    }
  };

  const CHANGES = {
    'import-students-file': (el) => {
      const f = el.files && el.files[0];
      if (!f) { csvImport = null; renderCsvPreview(); return; }
      const reader = new FileReader();
      reader.onload = () => { csvImport = Object.assign({ fileName: f.name }, studentsFromCsv(reader.result)); renderCsvPreview(); };
      reader.onerror = () => { csvImport = { fileName: f.name, students: [], skipped: 0, error: 'The file could not be read.' }; renderCsvPreview(); };
      reader.readAsText(f);
    },
    wiz: (el) => { ui.wiz.data[el.dataset.field] = el.value; },
    'wiz-rule': (el) => { const r = ui.wiz.data.rules; const k = el.dataset.rule; ui.wiz.data.rules = el.checked ? r.concat(r.includes(k) ? [] : [k]) : r.filter((x) => x !== k); render(); },
    'perf-course': (el) => {
      if (ui.perfTab === 'assignment') { const x = courseAssignments(el.value)[0]; return x ? go('reviews', x.id) : go('reviews', el.value); }
      go('reviews', el.value);
    },
    'perf-assignment': (el) => go('reviews', el.value),
    'perf-filter': (el) => { ui.perfFilter = el.value; render(); },
    group: (el) => { ui.group = el.value; renderRows(); },
    sort: (el) => { ui.sort = el.value; renderRows(); },
    stage: (el) => { ui.stage = el.value; renderRows(); },
    onlyFlagged: (el) => { ui.onlyFlagged = el.checked; render(); },
    'switch-assignment': (el) => go('assignment', el.value),
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
      if (!validState(data)) return toast('This file is not a backup from this version of Trace.', true);
      if (!confirm('Replace all current data with this backup (' + plural(data.courses.length, 'course') + ', ' + plural(data.assignments.length, 'assignment') + ')?')) return;
      state = data; normalise(); save(); go('home'); toast('Backup restored.');
    }),
    'import-rules': (el) => readJsonFile(el, (data) => {
      if (!data || !data.rules) return toast('This file does not contain rule settings.', true);
      changeSettings((a) => { a.settings = E.normaliseSettings(data); }, 'Rule settings loaded into ' + asg(ui.assignmentId).short + '.');
    }),
    'course-field': async (el) => {
      const c = course(el.dataset.cid); const value = el.value.trim();
      if (mode === 'backend') {
        await remoteMutation(() => API.patch('/courses/' + c.id, { [el.dataset.field]: value }), () => { renderSidebar(); renderCrumbs(); render(); });
        return;
      }
      c[el.dataset.field] = value; save(); renderSidebar(); renderCrumbs();
    },
    'student-field': async (el) => {
      const p = person(el.dataset.pid); const value = el.value.trim();
      if (mode === 'backend') {
        const field = el.dataset.field === 'upi' ? 'institutionalId' : el.dataset.field;
        await remoteMutation(() => API.patch('/students/' + p.id, { [field]: value }));
        return;
      }
      p[el.dataset.field] = value; save();
    },
    'roster-group': async (el) => {
      const c = course(el.dataset.cid); const r = c.roster.find((x) => x.studentId === el.dataset.pid);
      if (!r) return;
      const value = el.value.trim();
      if (mode === 'backend') {
        await remoteMutation(() => API.patch('/courses/' + c.id + '/enrolments/' + el.dataset.pid, { groupName: value }));
        return;
      }
      r.group = value; save();
    }
  };

  const INPUTS = {
    wiz: (el) => { ui.wiz.data[el.dataset.field] = el.value; },
    'version-note': (el) => { ui.versionNote = el.value; },
    search: (el) => { ui.search = el.value; renderRows(); },
    'rule-preview': (el) => { const o = el.parentElement.querySelector('output'); if (o) o.textContent = el.value + (el.dataset.suffix || ''); },
  };

  Object.assign(ACTIONS, STUDENT_ACTIONS, SUBMISSION_ACTIONS, MARKING_ACTIONS, DETECT_ACTIONS);
  Object.assign(CHANGES, DETECT_CHANGES);
  Object.assign(INPUTS, MARKING_INPUTS);
  CHANGES['mr-total'] = () => render();
  // Show the score as it was kept (rounded to half points, within range) without redrawing, so Tab moves on normally.
  CHANGES['mr-score-done'] = (el) => {
    const d = ui.gradeDraft; const m = d && d.content[el.dataset.crit];
    const v = m && m.score != null ? String(m.score) : '';
    if (el.value !== v) el.value = v;
  };
  CHANGES['mr-pref-text'] = (el) => { setPref('levelText', el.checked); render(); };

  // Drag the bar between the work and the side panel to resize the panel.
  function setRailWidth(layout, w) {
    const max = Math.min(1000, layout.getBoundingClientRect().width - 380);
    w = Math.round(Math.max(RAIL_MIN, Math.min(max, w)));
    layout.style.setProperty('--rail-w', w + 'px');
    const h = layout.querySelector('.rail-resize'); if (h) h.setAttribute('aria-valuenow', w);
    return w;
  }
  document.addEventListener('pointerdown', (ev) => {
    const h = ev.target.closest && ev.target.closest('.rail-resize');
    if (!h || ev.button !== 0) return;
    const layout = h.parentElement;
    ev.preventDefault();
    hideTip();
    try { h.setPointerCapture(ev.pointerId); } catch (e) { /* keeps working without capture */ }
    document.body.classList.add('resizing');
    let w = railWidth();
    const move = (e) => { w = setRailWidth(layout, layout.getBoundingClientRect().right - e.clientX - h.offsetWidth / 2); };
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      setPref('railWidth', w);
      render(); // updates the Widen / Narrow button
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
  document.addEventListener('dblclick', (ev) => {
    const h = ev.target.closest && ev.target.closest('.rail-resize');
    if (h) { setPref('railWidth', setRailWidth(h.parentElement, RAIL_DEFAULT)); render(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (!ev.target.matches || !ev.target.matches('.rail-resize')) return;
    const step = { ArrowLeft: 30, ArrowRight: -30 }[ev.key];
    if (!step && ev.key !== 'Home') return;
    ev.preventDefault();
    setPref('railWidth', setRailWidth(ev.target.parentElement, ev.key === 'Home' ? RAIL_DEFAULT : railWidth() + step));
  });
  Object.assign(FORMS, STUDENT_FORMS);
  CHANGES['stu-file'] = (el) => { pickFile(el.files && el.files[0]); };
  INPUTS['stu-log'] = (el) => {
    if (!ui.stu) return;
    ui.stu.log = el.value;
    const n = $('#stuLogCount'); if (n) n.textContent = logCountText(el.value);
  };
  // Drag a file onto the upload box.
  document.addEventListener('dragover', (ev) => { const z = ev.target.closest && ev.target.closest('.dropzone'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { const z = ev.target.closest && ev.target.closest('.dropzone'); if (z) z.classList.remove('over'); });
  document.addEventListener('drop', (ev) => {
    const z = ev.target.closest && ev.target.closest('.dropzone');
    if (!z) return;
    ev.preventDefault();
    pickFile(ev.dataTransfer && ev.dataTransfer.files[0]);
  });

  document.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-nav]');
    if (nav) {
      ev.preventDefault();
      const v = nav.dataset.nav;
      if (isStudent()) { ui.courseId = null; return go('student'); }
      if (v === 'home') { ui.courseId = null; return go('home'); }
      if (v === 'admin') return go('admin', ui.adminTab);
      // Assignments opens a chooser; Review Performance opens the class overview.
      if (v === 'courses') return go('courses');
      if (v === 'rules') return go('rules');
      if (v === 'marking') return go('marking', owns(ui.courseId) ? ui.courseId : 'all');
      if (v === 'reviews') return go('reviews', owns(ui.courseId) ? ui.courseId : 'all');
      if (!owns(ui.courseId)) ui.courseId = (myCourses()[0] || {}).id;
      if (!ui.courseId) { toast('Add a course first.'); return go('home'); }
      if (!ui.assignmentId || !asg(ui.assignmentId) || !owns(asg(ui.assignmentId).courseId)) ui.assignmentId = defaultAssignment(ui.courseId);
      return ui.assignmentId ? go(v, ui.assignmentId) : (toast('This course has no assignments yet.'), go('course', ui.courseId));
    }
    const a = ev.target.closest('[data-action]');
    if (a && ACTIONS[a.dataset.action] && !a.disabled) {
      if (a.tagName === 'TR' && ev.target.closest('button, a, input, select, textarea') && ev.target.closest('button, a, input, select, textarea') !== a) return;
      ACTIONS[a.dataset.action](a, ev);
      return;
    }
    if (ui.courseMenu && !ev.target.closest('.course-switcher')) { ui.courseMenu = false; renderSidebar(); }
    if (ui.view === 'newasg' && ui.wiz && ui.wiz.calOpen && !ev.target.closest('.date-field')) { ui.wiz.calOpen = false; render(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (ui.wiz && ui.wiz.calOpen) { ui.wiz.calOpen = false; render(); } closeModal(); closeSidebar(); if (ui.courseMenu) { ui.courseMenu = false; renderSidebar(); } hideTip(); }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('g[data-action], tr[data-action], [role=button][data-action]')) { ev.preventDefault(); ACTIONS[ev.target.dataset.action](ev.target, ev); }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.matches && el.matches('.crit-pick input[type=checkbox]')) el.closest('.crit-pick').classList.toggle('on', el.checked);
    if (el.dataset && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el);
  });
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
    if (mode === 'backend') return;
    if (mode === 'local') { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
    else fetch('/api/state', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
  });

  load();
})();
