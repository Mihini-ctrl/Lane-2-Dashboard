/*
 * server.js — a small local server with no npm dependencies.
 *
 *   node server.js            then open http://localhost:3000
 *
 * It does two jobs:
 *   1. Serves the app in /public
 *   2. Stores courses, assignments and reviews in data/db.json
 *      (created from data/seed.json on first run)
 *
 * Students attach their AI logs before hand-in, so teachers no longer
 * import share links here; the logs arrive with the submission.
 *
 * Needs Node 20 or newer when used as part of this repository.
 */
'use strict';
require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const SEED_FILE = path.join(ROOT, 'data', 'seed.json');
const MAX_BODY = 5 * 1024 * 1024;
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request is larger than 5 MB.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
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
      const body = await readBody(req);
      if (!body || !['courses', 'assignments', 'submissions', 'students'].every((k) => Array.isArray(body[k]))) return send(res, 400, { error: 'State must include courses, assignments, submissions and students.' });
      return send(res, 200, { updatedAt: writeDb(body) });
    }
    if (req.method === 'POST' && pathname === '/api/reset') {
      fs.copyFileSync(SEED_FILE, DB_FILE);
      return send(res, 200, readDb());
    }
    return send(res, 404, { error: 'No such API route.' });
  } catch (e) {
    return send(res, 500, { error: e.message });
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
