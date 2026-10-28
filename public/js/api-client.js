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

  const WAKE_MESSAGE = 'Trace\'s server is starting up or restarting. Wait a minute, then try again.';
  const WAKE_WAIT_MS = 90000;
  let waitingHandler = null;

  // Read the reply once. Errors from our backend are JSON; anything else (an HTML page
  // from the host while the server sleeps or redeploys) is reported as "starting up".
  async function readReply(response) {
    const text = await response.text().catch(() => '');
    let body = null;
    try { body = text ? JSON.parse(text) : {}; } catch (e) { body = null; }
    return { response, body };
  }

  function waking(reply) {
    const status = reply.response.status;
    if (![502, 503, 504].includes(status)) return false;
    const code = reply.body && reply.body.error && typeof reply.body.error === 'object' ? reply.body.error.code : '';
    return !reply.body || code === 'BACKEND_UNREACHABLE';
  }

  // Free hosting puts the backend to sleep when idle. Safe requests (login, refresh, reads)
  // wait for it to wake for up to 90 seconds instead of failing straight away.
  async function send(url, init, retryable) {
    const started = Date.now();
    let delay = 1500;
    let told = false;
    for (;;) {
      let reply = null;
      try { reply = await readReply(await fetch(url, init)); }
      catch (e) { reply = null; }
      if (reply && !waking(reply)) return reply;
      if (!retryable || Date.now() - started > WAKE_WAIT_MS) {
        if (!reply) throw new Error('Trace could not reach its server. Check your internet connection, then try again.');
        return reply;
      }
      if (!told && waitingHandler) { told = true; try { waitingHandler(true); } catch (e) { /* UI only */ } }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 6000);
    }
  }

  function parse(reply) {
    const { response, body } = reply;
    if (!response.ok) {
      const message = !body ? WAKE_MESSAGE
        : body.error && typeof body.error === 'object' ? body.error.message : body.error;
      const error = new Error(message || (response.status >= 500 ? WAKE_MESSAGE : 'The backend request failed.'));
      error.status = response.status;
      error.code = body && body.error && typeof body.error === 'object' ? body.error.code : undefined;
      throw error;
    }
    return body;
  }

  async function refresh() {
    const current = readSession();
    if (!current || !current.refreshToken) throw new Error('Your session has expired. Please log in again.');
    const body = parse(await send(BASE + '/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken })
    }, true));
    writeSession(body.session);
    return body.session;
  }

  async function request(path, options, retried) {
    options = options || {};
    let session = readSession();
    if (!session) throw new Error('Please log in to continue.');
    if (session.expiresAt && session.expiresAt * 1000 < Date.now() + 30000) session = await refresh();

    // Only label requests that carry a body as JSON (an empty JSON DELETE used to be refused).
    const method = String(options.method || 'GET').toUpperCase();
    const reply = await send(BASE + path, Object.assign({}, options, {
      headers: Object.assign(options.body != null ? { 'Content-Type': 'application/json' } : {}, {
        Authorization: 'Bearer ' + session.accessToken
      }, options.headers || {})
    }), method === 'GET');
    if (reply.response.status === 401 && !retried && session.refreshToken) {
      await refresh();
      return request(path, options, true);
    }
    return parse(reply);
  }

  window.Lane2Api = Object.freeze({
    hasSession: () => !!readSession(),
    // Called with true when a request starts waiting for the server to wake up.
    onWaiting(fn) { waitingHandler = typeof fn === 'function' ? fn : null; },
    // Start waking the server early (for example while someone types their password).
    wake() { fetch(BASE + '/health', { cache: 'no-store' }).catch(() => {}); },
    async login(email, password) {
      const body = parse(await send(BASE + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }, true));
      writeSession(body.session);
      return body.session;
    },
    async signup(details) {
      const body = parse(await send(BASE + '/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details)
      }, false));
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
