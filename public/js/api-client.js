/* Authenticated browser client for the Lane2 Fastify API. */
(function () {
  'use strict';

  const STORAGE_KEY = 'lane2-api-session';
  const BASE = '/api/v1';

  function readSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
    catch (e) { return null; }
  }

  function writeSession(session) {
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* storage may be unavailable */ }
  }

  async function parse(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.error && typeof body.error === 'object' ? body.error.message : body.error;
      const error = new Error(message || 'The backend request failed.');
      error.status = response.status;
      error.code = body.error && typeof body.error === 'object' ? body.error.code : undefined;
      throw error;
    }
    return body;
  }

  async function refresh() {
    const current = readSession();
    if (!current || !current.refreshToken) throw new Error('Your session has expired. Please log in again.');
    const response = await fetch(BASE + '/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken })
    });
    const body = await parse(response);
    writeSession(body.session);
    return body.session;
  }

  async function request(path, options, retried) {
    options = options || {};
    let session = readSession();
    if (!session) throw new Error('Please log in to continue.');
    if (session.expiresAt && session.expiresAt * 1000 < Date.now() + 30000) session = await refresh();

    const response = await fetch(BASE + path, Object.assign({}, options, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.accessToken
      }, options.headers || {})
    }));
    if (response.status === 401 && !retried && session.refreshToken) {
      await refresh();
      return request(path, options, true);
    }
    return parse(response);
  }

  window.Lane2Api = Object.freeze({
    hasSession: () => !!readSession(),
    async login(email, password) {
      const body = await parse(await fetch(BASE + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }));
      writeSession(body.session);
      return body.session;
    },
    async signup(details) {
      const body = await parse(await fetch(BASE + '/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details)
      }));
      if (body.session) writeSession(body.session);
      return body;
    },
    logout() { writeSession(null); },
    get: (path) => request(path),
    post: (path, value, options) => request(path, Object.assign({ method: 'POST', body: JSON.stringify(value) }, options || {})),
    put: (path, value, options) => request(path, Object.assign({ method: 'PUT', body: JSON.stringify(value) }, options || {})),
    patch: (path, value, options) => request(path, Object.assign({ method: 'PATCH', body: JSON.stringify(value) }, options || {})),
    delete: (path, options) => request(path, Object.assign({ method: 'DELETE' }, options || {}))
  });
})();
