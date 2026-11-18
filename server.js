'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const MAX_BODY = 16 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;
const rateBuckets = new Map();

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); }
  catch (error) { console.error(`Could not read ${file}:`, error.message); return fallback; }
}
function writeJsonAtomic(file, value) {
  const target = path.join(DATA, file);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
}
const scholarships = readJson('scholarships.json', []);
const portals = readJson('portals.json', []);

function send(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function cleanText(value, max = 500) {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''; let tooLarge = false;
    req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > MAX_BODY) tooLarge = true; });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function rateLimit(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const now = Date.now(); const current = rateBuckets.get(ip);
  if (!current || now - current.start > WINDOW_MS) rateBuckets.set(ip, { start: now, count: 1 });
  else current.count++;
  if (rateBuckets.get(ip).count > MAX_REQUESTS) { send(res, 429, { error: 'Too many requests. Please try again shortly.' }); return false; }
  return true;
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function serveStatic(req, res, pathname) {
  let requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const resolved = path.resolve(PUBLIC, `.${requested}`);
  if (!resolved.startsWith(PUBLIC + path.sep) && resolved !== path.join(PUBLIC, 'index.html')) return send(res, 403, { error: 'Forbidden.' });
  fs.readFile(resolved, (error, content) => {
    if (error) return send(res, 404, { error: 'Not found.' });
    const ext = path.extname(resolved).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  if (pathname.startsWith('/api/') && !rateLimit(req, res)) return;
  if (req.method === 'GET' && pathname === '/api/health') return send(res, 200, { status: 'ok', service: 'ScholarSetu API', timestamp: new Date().toISOString() });
  if (req.method === 'GET' && pathname === '/api/scholarships') {
    const state = cleanText(url.searchParams.get('state'), 80).toLowerCase();
    const category = cleanText(url.searchParams.get('category'), 40).toLowerCase();
    const level = cleanText(url.searchParams.get('level'), 40).toLowerCase();
    let results = scholarships;
    if (category) results = results.filter(item => Array.isArray(item.cat) && item.cat.map(x => x.toLowerCase()).includes(category));
    if (level) results = results.filter(item => Array.isArray(item.lvl) && item.lvl.map(x => x.toLowerCase()).includes(level));
    // State is accepted for future state-specific scheme records; current dataset is central schemes.
    return send(res, 200, { count: results.length, academicYear: '2026–27', dataReviewed: '16 November 2026', stateFilterApplied: false, items: results });
  }
  if (req.method === 'GET' && pathname === '/api/portals') {
    const q = cleanText(url.searchParams.get('q'), 100).toLowerCase();
    const results = q ? portals.filter(p => `${p.state} ${p.name}`.toLowerCase().includes(q)) : portals;
    return send(res, 200, { count: results.length, items: results });
  }
  if (req.method === 'POST' && pathname === '/api/feedback') {
    try {
      const input = await readBody(req);
      const message = cleanText(input.message, 2000);
      const type = cleanText(input.type || 'general', 40);
      if (message.length < 5) return send(res, 400, { error: 'Feedback must contain at least 5 characters.' });
      const feedback = readJson('feedback.json', []);
      const item = { id: crypto.randomUUID(), type, message, createdAt: new Date().toISOString(), status: 'new' };
      feedback.push(item);
      writeJsonAtomic('feedback.json', feedback);
      return send(res, 201, { message: 'Thank you. Your feedback has been received.', id: item.id });
    } catch (error) { return send(res, error.status || 500, { error: error.status ? error.message : 'Could not save feedback.' }); }
  }
  if (req.method === 'GET' && pathname === '/api/admin/feedback') {
    const token = process.env.ADMIN_TOKEN;
    if (!token) return send(res, 503, { error: 'Admin access is not configured.' });
    if (!safeEqual(req.headers.authorization?.replace(/^Bearer\s+/i, '') || '', token)) return send(res, 401, { error: 'Unauthorized.' });
    return send(res, 200, { count: readJson('feedback.json', []).length, items: readJson('feedback.json', []) });
  }
  if (pathname.startsWith('/api/')) return send(res, 404, { error: 'API endpoint not found.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => console.log(`ScholarSetu running at http://${HOST}:${PORT}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
