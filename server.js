/*
 * server.js — a small local server with no npm dependencies.
 *
 *   node server.js            then open http://localhost:3000
 *
 * It does two jobs:
 *   1. Serves the app in /public
 *   2. Stores courses, assignments and reviews in data/db.json
 *      (created from data/seed.json on first run)
 *   3. Stores files students hand in (PDF or Word, up to 10 MB) in
 *      data/uploads, kept apart from db.json so saves stay small
 *   4. Runs AI evaluation through Google Gemini (see ai-eval.js). The API
 *      key stays here, in .env, and never reaches the browser.
 *
 * Students attach their AI logs before hand-in, so teachers no longer
 * import share links here; the logs arrive with the submission.
 *
 * Needs Node 22 or newer. No npm install is needed to run it.
 */
'use strict';
// Settings from .env (e.g. GEMINI_API_KEY). Node's built-in loader is used, so
// `npm install` is not needed just to run the app. A missing .env is fine:
// everything works except AI evaluation.
try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
  else require('dotenv').config();
} catch (e) { /* no .env file, or dotenv not installed */ }
const http = require('http');
const https = require('https');
const aiEval = require('./ai-eval');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const SEED_FILE = path.join(ROOT, 'data', 'seed.json');
const MAX_BODY = 5 * 1024 * 1024;
// Every course, submission and pasted chat is saved together, so saves get a bigger allowance.
const MAX_STATE = 20 * 1024 * 1024;
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const MAX_FILE = 10 * 1024 * 1024;
// Files arrive as base64 inside JSON, which is a third larger than the file itself.
const MAX_FILE_BODY = Math.ceil(MAX_FILE / 3) * 4 + 64 * 1024;
const FILE_TYPES = { '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const FILE_ID = /^f-[a-z0-9]{6,20}\.(pdf|docx?)$/;
const BACKEND_URL = String(process.env.BACKEND_URL || '').replace(/\/$/, '');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

/* ---------------- storage ---------------- */
function readDb() {
  if (!fs.existsSync(DB_FILE)) fs.copyFileSync(SEED_FILE, DB_FILE);
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function writeDb(data) {
  data.updatedAt = new Date().toISOString();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic replace, so a crash never leaves half a file
  return data.updatedAt;
}

/* ---------------- helpers ---------------- */
function send(res, status, body, type) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': type || (isJson ? MIME['.json'] : 'text/plain; charset=utf-8'), 'Cache-Control': 'no-store' });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let over = false;
    const chunks = [];
    const tooLarge = () => Object.assign(new Error('Request is larger than ' + Math.floor(limit / 1048576) + ' MB.'), { status: 413 });
    req.on('data', (c) => {
      size += c.length;
      // Too large: keep reading without storing, so the browser gets a clear answer instead of a dropped connection.
      if (over) { if (size > limit * 4) req.destroy(); return; }
      if (size > limit) { over = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('close', () => { if (over) reject(tooLarge()); });
    req.on('end', () => {
      if (over) return reject(tooLarge());
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('Body is not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

/* ---------------- routes ---------------- */
async function api(req, res, pathname) {
  try {
    if (req.method === 'GET' && pathname === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && pathname === '/api/state') return send(res, 200, readDb());
    if (req.method === 'PUT' && pathname === '/api/state') {
      const body = await readBody(req, MAX_STATE);
      if (!body || !['courses', 'assignments', 'submissions', 'students'].every((k) => Array.isArray(body[k]))) return send(res, 400, { error: 'State must include courses, assignments, submissions and students.' });
      return send(res, 200, { updatedAt: writeDb(body) });
    }
    // AI evaluation (Gemini). The browser sends the text; the key stays on the server.
    if (req.method === 'GET' && pathname === '/api/ai/status') return send(res, 200, aiEval.status());
    if (req.method === 'POST' && pathname === '/api/ai/evaluate') {
      const body = await readBody(req);
      try { return send(res, 200, await aiEval.evaluate(body)); }
      catch (e) { return send(res, e.status || 500, { error: e.message }); }
    }
    // Student hand-in files. The browser sends { name, data } with data as base64.
    if (req.method === 'POST' && pathname === '/api/files') {
      const body = await readBody(req, MAX_FILE_BODY);
      const ext = path.extname(String(body.name || '')).toLowerCase();
      if (!FILE_TYPES[ext]) return send(res, 400, { error: 'Only PDF or Word files can be handed in.' });
      const data = Buffer.from(String(body.data || ''), 'base64');
      if (!data.length) return send(res, 400, { error: 'The file is empty.' });
      if (data.length > MAX_FILE) return send(res, 400, { error: 'Files must be 10 MB or smaller.' });
      const id = 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ext;
      fs.mkdirSync(UPLOADS, { recursive: true });
      fs.writeFileSync(path.join(UPLOADS, id), data);
      return send(res, 200, { id, size: data.length });
    }
    if (req.method === 'GET' && pathname.startsWith('/api/files/')) {
      const id = pathname.slice('/api/files/'.length);
      if (!FILE_ID.test(id)) return send(res, 400, { error: 'Not a valid file id.' });
      const file = path.join(UPLOADS, id);
      if (!fs.existsSync(file)) return send(res, 404, { error: 'That file is no longer stored.' });
      return send(res, 200, fs.readFileSync(file), FILE_TYPES[path.extname(id)]);
    }
    if (req.method === 'POST' && pathname === '/api/reset') {
      fs.copyFileSync(SEED_FILE, DB_FILE);
      fs.rmSync(UPLOADS, { recursive: true, force: true });
      return send(res, 200, readDb());
    }
    return send(res, 404, { error: 'No such API route.' });
  } catch (e) {
    return send(res, e.status || 500, { error: e.message });
  }
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

function proxyBackend(req, res) {
  if (!BACKEND_URL) return send(res, 503, { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'The Lane2 backend is not configured.' } });
  let target;
  try { target = new URL(req.url, BACKEND_URL); }
  catch (e) { return send(res, 500, { error: { code: 'BACKEND_URL_INVALID', message: 'The Lane2 backend URL is invalid.' } }); }
  const transport = target.protocol === 'https:' ? https : http;
  const headers = Object.assign({}, req.headers, { host: target.host });
  const upstream = transport.request(target, { method: req.method, headers }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', () => send(res, 502, { error: { code: 'BACKEND_UNREACHABLE', message: 'The Lane2 backend is not running. Start it with npm run dev:supabase.' } }));
  req.pipe(upstream);
}

function runtimeConfig(res) {
  const body = 'window.LANE2_CONFIG = Object.freeze(' + JSON.stringify({ backendEnabled: !!BACKEND_URL }) + ');';
  send(res, 200, body, 'text/javascript; charset=utf-8');
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/js/runtime-config.js') return runtimeConfig(res);
  if (pathname.startsWith('/api/v1/')) return proxyBackend(req, res);
  if (pathname.startsWith('/api/')) return api(req, res, pathname);
  return serveStatic(res, pathname);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('Lane2 teaching workspace (merged prototype)');
    console.log('Open http://localhost:' + PORT + ' in your browser. Press Ctrl+C to stop.');
    if (BACKEND_URL) console.log('Production backend connected through ' + BACKEND_URL);
  });
}

module.exports = { server };
