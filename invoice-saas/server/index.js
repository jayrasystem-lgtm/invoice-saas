require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');
const { generateTenantId, generateLicenseKey } = require('./ids');

const app = express();
app.use(express.json({ limit: '15mb' })); // logo/ttd base64 bisa cukup besar
app.set('trust proxy', 1);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ganti-password-ini';
const DATA_KEYS = new Set(['settings', 'contacts', 'products', 'invoices']);

/* ============================= HELPERS ============================= */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isTenantActive(tenant) {
  if (!tenant) return false;
  if (tenant.status !== 'active') return false;
  if (tenant.paid_until && tenant.paid_until < todayISO()) return false;
  return true;
}

/* ============================= AUTH MIDDLEWARE (tenant / klien) ============================= */
function requireTenant(req, res, next) {
  const key = req.header('X-License-Key') || req.query.key;
  if (!key) return res.status(401).json({ error: 'NO_LICENSE_KEY', message: 'License key tidak ditemukan.' });

  const tenant = db.getTenantByKey(key);
  if (!tenant) return res.status(401).json({ error: 'INVALID_LICENSE_KEY', message: 'License key tidak valid.' });

  if (!isTenantActive(tenant)) {
    return res.status(403).json({
      error: 'SUBSCRIPTION_INACTIVE',
      message: tenant.status === 'suspended'
        ? 'Akses dinonaktifkan oleh admin.'
        : 'Masa langganan sudah berakhir.',
      status: tenant.status,
      paidUntil: tenant.paid_until,
    });
  }

  req.tenant = tenant;
  next();
}

/* ============================= AUTH MIDDLEWARE (admin) ============================= */
function requireAdmin(req, res, next) {
  const header = req.header('Authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : (req.query.adminPassword || '');
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Password admin salah.' });
  }
  next();
}

/* ============================= PUBLIC: cek status lisensi ============================= */
app.get('/api/verify', (req, res) => {
  const key = req.header('X-License-Key') || req.query.key;
  if (!key) return res.status(400).json({ error: 'NO_LICENSE_KEY' });
  const tenant = db.getTenantByKey(key);
  if (!tenant) return res.status(401).json({ error: 'INVALID_LICENSE_KEY', message: 'License key tidak valid.' });
  const active = isTenantActive(tenant);
  res.json({
    active,
    name: tenant.name,
    status: tenant.status,
    paidUntil: tenant.paid_until,
    message: active ? null : (tenant.status === 'suspended' ? 'Akses dinonaktifkan oleh admin.' : 'Masa langganan sudah berakhir.'),
  });
});

/* ============================= TENANT DATA API (dipakai oleh app invoice) ============================= */
app.get('/api/data/:key', requireTenant, (req, res) => {
  const { key } = req.params;
  if (!DATA_KEYS.has(key)) return res.status(400).json({ error: 'INVALID_KEY' });
  const value = db.getTenantDataValue(req.tenant.id, key);
  res.json({ key, value });
});

app.put('/api/data/:key', requireTenant, async (req, res) => {
  const { key } = req.params;
  if (!DATA_KEYS.has(key)) return res.status(400).json({ error: 'INVALID_KEY' });
  await db.setTenantDataValue(req.tenant.id, key, req.body.value ?? null);
  res.json({ ok: true });
});

// Ambil semua data tenant sekaligus (lebih efisien saat load pertama / sinkron berkala)
app.get('/api/data', requireTenant, (req, res) => {
  res.json(db.getAllTenantData(req.tenant.id));
});

/* ============================= ADMIN API (dipakai Anda sebagai pemilik) ============================= */
app.get('/api/admin/tenants', requireAdmin, (req, res) => {
  res.json(db.listTenants());
});

app.post('/api/admin/tenants', requireAdmin, async (req, res) => {
  const { name, paidUntil, note } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED' });
  const tenant = {
    id: generateTenantId(),
    name: String(name).trim(),
    license_key: generateLicenseKey(),
    status: 'active',
    paid_until: paidUntil || null,
    note: note || '',
    created_at: new Date().toISOString(),
  };
  await db.insertTenant(tenant);
  res.json(tenant);
});

app.patch('/api/admin/tenants/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const tenant = db.getTenantById(id);
  if (!tenant) return res.status(404).json({ error: 'NOT_FOUND' });

  const fields = {};
  if (req.body.status !== undefined) {
    if (!['active', 'suspended'].includes(req.body.status)) return res.status(400).json({ error: 'INVALID_STATUS' });
    fields.status = req.body.status;
  }
  if (req.body.paidUntil !== undefined) fields.paid_until = req.body.paidUntil || null;
  if (req.body.name !== undefined) fields.name = String(req.body.name).trim();
  if (req.body.note !== undefined) fields.note = req.body.note;
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'NO_FIELDS' });

  const updated = await db.updateTenant(id, fields);
  res.json(updated);
});

app.post('/api/admin/tenants/:id/regenerate-key', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const tenant = db.getTenantById(id);
  if (!tenant) return res.status(404).json({ error: 'NOT_FOUND' });
  const updated = await db.updateTenant(id, { license_key: generateLicenseKey() });
  res.json(updated);
});

app.delete('/api/admin/tenants/:id', requireAdmin, async (req, res) => {
  await db.deleteTenant(req.params.id);
  res.json({ ok: true });
});

/* ============================= STATIC FILES ============================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Invoice SaaS server jalan di port ${PORT}`));
}

module.exports = app;
