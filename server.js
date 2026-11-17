#!/usr/bin/env node
/**
 * AMINOGEN concept server — static files + two endpoints.
 *
 *   POST /api/intake   medical intake (care programme)  -> data/intake.jsonl
 *   POST /api/order    shop order                       -> data/orders.jsonl
 *   GET  /api/health   liveness
 *
 * No accounts, no sessions, no patient cabinet: the client gets a reference
 * number and staff read submissions from the JSONL files (or `--dump`).
 *
 * Zero dependencies. Node 18+.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomInt } = require('node:crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 32 * 1024;

/* prices live on the server so the client cannot invent them */
const PRODUCTS = {
  'tir-15': { name: 'Tirzepatide', dose: '15 mg', price: 3590 },
  'tir-20': { name: 'Tirzepatide', dose: '20 mg', price: 4490 },
  'tir-40': { name: 'Tirzepatide', dose: '40 mg', price: 7190 },
  'ret-10': { name: 'Retatrutide', dose: '10 mg', price: 3990 },
  'ret-20': { name: 'Retatrutide', dose: '20 mg', price: 6290 },
  'ret-40': { name: 'Retatrutide', dose: '40 mg', price: 10790 },
  'mot-40': { name: 'Mots-C', dose: '40 mg', price: 5390 }
};
const FREE_SHIPPING = 5000;
const SHIPPING = 200;

const PLANS = {
  monthly: { label: 'Щомісячно', price: 8500 },
  '3m': { label: '3 місяці передоплатою', price: 7600 },
  '6m': { label: '6 місяців передоплатою', price: 6700 }
};

/* ---------------- helpers ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...extra });
  res.end(buf);
}

function json(res, status, obj) {
  send(res, status, JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

async function appendRecord(file, record) {
  await fsp.mkdir(DATA, { recursive: true, mode: 0o700 });
  const full = path.join(DATA, file);
  await fsp.appendFile(full, JSON.stringify(record) + '\n', { mode: 0o600 });
  try { await fsp.chmod(full, 0o600); } catch (e) { /* best effort */ }
}

const ref = (prefix) => `${prefix}-${new Date().getFullYear()}-${randomInt(1000, 9999)}`;
const s = (v) => (typeof v === 'string' ? v.trim() : '');

/* ---------------- validation ---------------- */
function validateIntake(b) {
  const errors = [];
  if (!['lose', 'maintain', 'unsure'].includes(s(b.goal))) errors.push('goal');
  const age = Number(b.age);
  const height = Number(b.height);
  const weight = Number(b.weight);
  if (!Number.isFinite(age) || age < 18 || age > 100) errors.push('age');
  if (!Number.isFinite(height) || height < 120 || height > 230) errors.push('height');
  if (!Number.isFinite(weight) || weight < 35 || weight > 300) errors.push('weight');
  if (!Array.isArray(b.conditions) || b.conditions.length === 0) errors.push('conditions');
  if (!s(b.meds)) errors.push('meds');
  if (!s(b.first) || !s(b.last)) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s(b.email))) errors.push('email');
  if (s(b.phone).replace(/\D/g, '').length < 6) errors.push('phone');
  if (!Array.isArray(b.consents) || b.consents.length < 4) errors.push('consents');
  const plan = PLANS[s(b.plan)] ? s(b.plan) : '3m';
  return { errors, plan };
}

function validateOrder(b) {
  const errors = [];
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) errors.push('items');

  const lines = [];
  for (const it of items) {
    const p = PRODUCTS[it && it.id];
    const qty = Math.floor(Number(it && it.qty));
    if (!p) { errors.push('unknown item'); continue; }
    if (!Number.isFinite(qty) || qty < 1 || qty > 100) { errors.push('quantity'); continue; }
    lines.push({ id: it.id, name: p.name, dose: p.dose, qty, unit: p.price, total: p.price * qty });
  }

  const c = b.customer || {};
  if (!s(c.first) || !s(c.last)) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s(c.email))) errors.push('email');
  if (!s(c.phone)) errors.push('phone');
  if (!s(c.country) || !s(c.city) || !s(c.zip) || !s(c.address)) errors.push('address');

  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const shipping = subtotal >= FREE_SHIPPING ? 0 : SHIPPING;
  return { errors, lines, subtotal, shipping, total: subtotal + shipping };
}

/* ---------------- API ---------------- */
async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
  }

  if (req.method === 'POST' && url.pathname === '/api/intake') {
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, e.message === 'payload too large' ? 413 : 400, { ok: false, error: e.message }); }

    const { errors, plan } = validateIntake(body);
    if (errors.length) return json(res, 422, { ok: false, error: 'validation_failed', fields: [...new Set(errors)] });

    const record = {
      ref: ref('MC'),
      createdAt: new Date().toISOString(),
      goal: s(body.goal),
      age: Number(body.age),
      height: Number(body.height),
      weight: Number(body.weight),
      bmi: Number((Number(body.weight) / Math.pow(Number(body.height) / 100, 2)).toFixed(1)),
      conditions: body.conditions.map(s).slice(0, 20),
      meds: s(body.meds).slice(0, 500),
      allergies: s(body.allergies).slice(0, 500),
      first: s(body.first).slice(0, 80),
      last: s(body.last).slice(0, 80),
      email: s(body.email).slice(0, 160),
      phone: s(body.phone).slice(0, 40),
      country: s(body.country).slice(0, 80),
      plan,
      planLabel: PLANS[plan].label,
      planPrice: PLANS[plan].price,
      consents: body.consents.map(s).slice(0, 10),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 200)
    };

    await appendRecord('intake.jsonl', record);
    console.log(`[intake] ${record.ref} ${record.country} bmi=${record.bmi} plan=${plan}`);
    return json(res, 201, { ok: true, ref: record.ref, plan: record.planLabel, price: `${record.planPrice} ₴/місяць` });
  }

  if (req.method === 'POST' && url.pathname === '/api/order') {
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, e.message === 'payload too large' ? 413 : 400, { ok: false, error: e.message }); }

    const { errors, lines, subtotal, shipping, total } = validateOrder(body);
    if (errors.length) return json(res, 422, { ok: false, error: 'validation_failed', fields: [...new Set(errors)] });

    const c = body.customer;
    const record = {
      ref: ref('ORD'),
      createdAt: new Date().toISOString(),
      items: lines,
      subtotal,
      shipping,
      total,
      payment: ['card', 'transfer'].includes(s(body.payment)) ? s(body.payment) : 'card',
      customer: {
        first: s(c.first).slice(0, 80),
        last: s(c.last).slice(0, 80),
        email: s(c.email).slice(0, 160),
        phone: s(c.phone).slice(0, 40),
        country: s(c.country).slice(0, 80),
        city: s(c.city).slice(0, 80),
        zip: s(c.zip).slice(0, 20),
        address: s(c.address).slice(0, 200),
        notes: s(c.notes).slice(0, 300)
      }
    };

    await appendRecord('orders.jsonl', record);
    console.log(`[order] ${record.ref} ${lines.length} line(s) total=€${total}`);
    return json(res, 201, { ok: true, ref: record.ref, subtotal, shipping, total });
  }

  return json(res, 404, { ok: false, error: 'not_found' });
}

/* ---------------- static ---------------- */
async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.endsWith('/')) rel += 'index.html';

  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}data${path.sep}`)) {
    return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  }

  try {
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const ext = path.extname(file).toLowerCase();
    const body = await fsp.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=60'
    });
    return res.end(body);
  } catch (e) {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
    return await serveStatic(req, res, url);
  } catch (e) {
    console.error('unhandled', e);
    return json(res, 500, { ok: false, error: 'server_error' });
  }
});

/* ---------------- CLI: read submissions without a cabinet ---------------- */
if (process.argv.includes('--dump')) {
  for (const f of ['intake.jsonl', 'orders.jsonl']) {
    const p = path.join(DATA, f);
    if (!fs.existsSync(p)) continue;
    console.log(`\n== ${f} ==`);
    for (const line of fs.readFileSync(p, 'utf8').trim().split('\n')) {
      try {
        const r = JSON.parse(line);
        console.log(f === 'intake.jsonl'
          ? `${r.ref}  ${r.createdAt}  ${r.first} ${r.last}  ${r.country}  bmi ${r.bmi}  ${r.plan}`
          : `${r.ref}  ${r.createdAt}  ${r.customer.email}  €${r.total}`);
      } catch (e) { /* skip */ }
    }
  }
  process.exit(0);
}

server.listen(PORT, HOST, () => {
  console.log(`AMINOGEN concept server → http://${HOST}:${PORT}`);
  console.log('  POST /api/intake · POST /api/order · GET /api/health');
});
