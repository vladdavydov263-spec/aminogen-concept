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
const { randomInt, randomBytes } = require('node:crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 32 * 1024;

/* ---- internal CRM (no patient cabinet, staff-only) ---- */
const CRM_TOKEN = process.env.CRM_TOKEN || randomBytes(9).toString('hex');
const LEADS_FILE = 'intake.jsonl';
const ORDERS_FILE = 'orders.jsonl';
const STATUS_FILE = 'status.json';
const STATUSES = ['new', 'reviewing', 'approved', 'declined', 'shipped', 'done'];

/* optional integrations */
const CRM_WEBHOOK = process.env.CRM_WEBHOOK_URL || '';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';

/* prices live on the server so the client cannot invent them */
const PRODUCTS = {
  'tir-15': { name: 'Tirzepatide', dose: '15 mg', price: 3590 },
  'tir-20': { name: 'Tirzepatide', dose: '20 mg', price: 4490 },
  'tir-40': { name: 'Tirzepatide', dose: '40 mg', price: 7190 },
  'ret-10': { name: 'Retatrutide', dose: '10 mg', price: 3990 },
  'ret-20': { name: 'Retatrutide', dose: '20 mg', price: 6290 },
  'ret-40': { name: 'Retatrutide', dose: '40 mg', price: 10790 },
  'mot-40': { name: 'Mots-C', dose: '40 mg', price: 5390 },
  'bac-10': { name: 'Бактеріостатична вода', dose: '2.5 мл × 10', price: 690 }
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

/* ---------------- CRM storage ---------------- */
async function readJsonl(file) {
  const full = path.join(DATA, file);
  try {
    const raw = await fsp.readFile(full, 'utf8');
    return raw.trim().split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

async function readStatuses() {
  try { return JSON.parse(await fsp.readFile(path.join(DATA, STATUS_FILE), 'utf8')); }
  catch (e) { return {}; }
}

async function writeStatuses(obj) {
  await fsp.mkdir(DATA, { recursive: true, mode: 0o700 });
  const file = path.join(DATA, STATUS_FILE);
  await fsp.writeFile(file, JSON.stringify(obj, null, 2), { mode: 0o600 });
  try { await fsp.chmod(file, 0o600); } catch (e) {}
}

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function crmAuth(url, req) {
  const token = url.searchParams.get('token') || req.headers['x-crm-token'];
  return token === CRM_TOKEN;
}

async function notify(record, kind) {
  const text = kind === 'lead'
    ? `Нова анкета ${record.ref}: ${record.first} ${record.last}, ${record.country}, BMI ${record.bmi}, план ${record.planLabel}`
    : `Нове замовлення ${record.ref}: ${record.total} ₴, ${record.customer.email}`;

  if (CRM_WEBHOOK) {
    fetch(CRM_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, record }) }).catch(() => {});
  }
  if (TG_TOKEN && TG_CHAT) {
    fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text })
    }).catch(() => {});
  }
}

/* ---------------- CRM pages ---------------- */
function crmPage(leads, orders, statuses) {
  const stat = (ref, fallback) => (statuses[ref] && statuses[ref].status) || fallback;
  const all = leads.concat(orders);
  const counts = STATUSES.reduce((acc, st) => {
    acc[st] = all.filter((r) => stat(r.ref, 'new') === st).length;
    return acc;
  }, {});

  const leadRows = leads.slice().reverse().map((l) => {
    const st = stat(l.ref, 'new');
    return `<tr data-ref="${esc(l.ref)}">
      <td><code>${esc(l.ref)}</code><br><span class="tiny">${esc(l.createdAt.slice(0, 16).replace('T', ' '))}</span></td>
      <td><strong>${esc(l.first)} ${esc(l.last)}</strong><br><span class="tiny">${esc(l.email)} · ${esc(l.phone)}</span></td>
      <td>${esc(l.country)}<br><span class="tiny">${esc(l.goal)}</span></td>
      <td>${esc(l.bmi)}<br><span class="tiny">${l.height} см · ${l.weight} кг</span></td>
      <td>${esc(l.planLabel)}<br><span class="tiny">${esc(l.conditions.join(', '))}</span></td>
      <td>${statusSelect(l.ref, st)}</td>
      <td><input class="note" data-ref="${esc(l.ref)}" value="${esc((statuses[l.ref] || {}).note || '')}" placeholder="нотатка"></td>
    </tr>`;
  }).join('');

  const orderRows = orders.slice().reverse().map((o) => {
    const st = stat(o.ref, 'new');
    return `<tr data-ref="${esc(o.ref)}">
      <td><code>${esc(o.ref)}</code><br><span class="tiny">${esc(o.createdAt.slice(0, 16).replace('T', ' '))}</span></td>
      <td><strong>${esc(o.customer.first)} ${esc(o.customer.last)}</strong><br><span class="tiny">${esc(o.customer.email)} · ${esc(o.customer.phone)}</span></td>
      <td>${esc(o.customer.city)}<br><span class="tiny">${esc(o.customer.address)}</span></td>
      <td>${o.items.map((i) => `${esc(i.name)} ${esc(i.dose)} × ${i.qty}`).join('<br>')}</td>
      <td><strong>${o.total} ₴</strong><br><span class="tiny">${esc(o.payment)}</span></td>
      <td>${statusSelect(o.ref, st)}</td>
      <td><input class="note" data-ref="${esc(o.ref)}" value="${esc((statuses[o.ref] || {}).note || '')}" placeholder="нотатка"></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>CRM — AMINOGEN</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;background:#F4F7FB;color:#0A1A2F}
    header{background:#0A1A2F;color:#fff;padding:14px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    header h1{font-size:15px;margin:0;letter-spacing:.02em}
    header a{color:#9FB6D6;font-size:13px;text-decoration:none;border:1px solid rgba(255,255,255,.25);padding:6px 10px;border-radius:6px}
    .wrap{padding:20px;max-width:1500px;margin:0 auto}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:#5A6B82;margin:26px 0 10px}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #E1E8F2;border-radius:10px;overflow:hidden;font-size:13px}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #EEF2F8;vertical-align:top}
    th{background:#F8FAFD;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#5A6B82}
    tr:last-child td{border-bottom:0}
    .tiny{font-size:11px;color:#7C8CA3}
    code{font-size:12px;background:#F4F7FB;padding:1px 4px;border-radius:4px}
    select,input.note{font:inherit;font-size:12px;padding:5px 6px;border:1px solid #CBD7E6;border-radius:6px;background:#fff}
    input.note{width:150px}
    .stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
    .stat{background:#fff;border:1px solid #E1E8F2;border-radius:8px;padding:8px 12px;font-size:12px;color:#5A6B82}
    .stat strong{display:block;font-size:18px;color:#0A1A2F}
    .empty{padding:30px;text-align:center;color:#7C8CA3;background:#fff;border:1px dashed #CBD7E6;border-radius:10px}
  </style></head><body>
  <header><h1>AMINOGEN · CRM</h1>
    <a href="/crm/export?token=${esc(CRM_TOKEN)}">Експорт CSV</a>
    <a href="/crm?token=${esc(CRM_TOKEN)}">Оновити</a>
  </header>
  <div class="wrap">
    <div class="stats">
      ${STATUSES.map((st) => `<div class="stat"><strong>${counts[st]}</strong>${st}</div>`).join('')}
    </div>
    <h2>Анкети (${leads.length})</h2>
    ${leads.length ? `<table><thead><tr><th>Ref</th><th>Клієнт</th><th>Область</th><th>BMI</th><th>План / стан</th><th>Статус</th><th>Нотатка</th></tr></thead><tbody>${leadRows}</tbody></table>` : '<div class="empty">Поки немає анкет</div>'}
    <h2>Замовлення (${orders.length})</h2>
    ${orders.length ? `<table><thead><tr><th>Ref</th><th>Клієнт</th><th>Доставка</th><th>Позиції</th><th>Сума</th><th>Статус</th><th>Нотатка</th></tr></thead><tbody>${orderRows}</tbody></table>` : '<div class="empty">Поки немає замовлень</div>'}
  </div>
  <script>
    document.addEventListener('change', function (e) {
      if (!e.target.matches('select[data-ref], input.note')) return;
      var ref = e.target.getAttribute('data-ref');
      var row = e.target.closest('tr');
      var body = { ref: ref, token: ${JSON.stringify(CRM_TOKEN)} };
      if (e.target.matches('select')) body.status = e.target.value;
      if (e.target.matches('input.note')) body.note = e.target.value;
      fetch('/api/crm/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function () { row.style.background = '#EAF5EF'; setTimeout(function(){ row.style.background = ''; }, 700); })
        .catch(function () { alert('Не збереглося'); });
    });
  </script>
  </body></html>`;
}

function statusSelect(ref, current) {
  return `<select data-ref="${esc(ref)}">` + STATUSES.map((st) =>
    `<option value="${st}"${st === current ? ' selected' : ''}>${st}</option>`).join('') + '</select>';
}

function toCsv(rows) {
  return rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
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
    notify(record, 'lead');
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
    console.log(`[order] ${record.ref} ${lines.length} line(s) total=${total} UAH`);
    notify(record, 'order');
    return json(res, 201, { ok: true, ref: record.ref, subtotal, shipping, total });
  }

  if (req.method === 'GET' && url.pathname === '/api/track') {
    const ref = s(url.searchParams.get('ref')).toUpperCase();
    const email = s(url.searchParams.get('email')).toLowerCase();
    if (!ref || !email) return json(res, 422, { ok: false, error: 'ref_and_email_required' });

    const orders = await readJsonl(ORDERS_FILE);
    const order = orders.find((o) => o.ref.toUpperCase() === ref && String(o.customer.email).toLowerCase() === email);
    if (!order) return json(res, 404, { ok: false, error: 'not_found' });

    const statuses = await readStatuses();
    const st = (statuses[order.ref] || {});
    return json(res, 200, {
      ok: true,
      ref: order.ref,
      createdAt: order.createdAt,
      status: st.status || 'new',
      total: order.total,
      items: order.items.map((i) => ({ name: i.name, dose: i.dose, qty: i.qty })),
      payment: order.payment
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/crm/status') {
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: 'invalid json' }); }
    if (!crmAuth(url, req) && s(body.token) !== CRM_TOKEN) return json(res, 403, { ok: false, error: 'forbidden' });
    const id = s(body.ref);
    if (!id) return json(res, 422, { ok: false, error: 'ref required' });
    const statuses = await readStatuses();
    statuses[id] = statuses[id] || {};
    if (body.status && STATUSES.includes(s(body.status))) statuses[id].status = s(body.status);
    if (typeof body.note === 'string') statuses[id].note = s(body.note).slice(0, 300);
    statuses[id].updatedAt = new Date().toISOString();
    await writeStatuses(statuses);
    return json(res, 200, { ok: true, ref: id, status: statuses[id].status || 'new' });
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
    if (url.pathname === '/crm') {
      if (!crmAuth(url, req)) return send(res, 403, 'Forbidden: add ?token=', 'text/plain; charset=utf-8');
      const [leads, orders, statuses] = await Promise.all([readJsonl(LEADS_FILE), readJsonl(ORDERS_FILE), readStatuses()]);
      return send(res, 200, crmPage(leads, orders, statuses), 'text/html; charset=utf-8');
    }

    if (url.pathname === '/crm/export') {
      if (!crmAuth(url, req)) return send(res, 403, 'Forbidden: add ?token=', 'text/plain; charset=utf-8');
      const [leads, orders, statuses] = await Promise.all([readJsonl(LEADS_FILE), readJsonl(ORDERS_FILE), readStatuses()]);
      const rows = [['type', 'ref', 'created', 'name', 'email', 'phone', 'geo', 'bmi', 'plan', 'total', 'payment', 'status', 'note']];
      leads.forEach((l) => rows.push(['lead', l.ref, l.createdAt, l.first + ' ' + l.last, l.email, l.phone, l.country, l.bmi, l.planLabel, '', '', (statuses[l.ref] || {}).status || 'new', (statuses[l.ref] || {}).note || '']));
      orders.forEach((o) => rows.push(['order', o.ref, o.createdAt, o.customer.first + ' ' + o.customer.last, o.customer.email, o.customer.phone, o.customer.city, '', '', o.total, o.payment, (statuses[o.ref] || {}).status || 'new', (statuses[o.ref] || {}).note || '']));
      return send(res, 200, toCsv(rows), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="aminogen-crm.csv"' });
    }

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
  console.log(`  CRM: http://${HOST}:${PORT}/crm?token=${CRM_TOKEN}`);
});
