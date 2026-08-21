// Penyimpanan sederhana berbasis file JSON di disk. Sengaja TIDAK memakai database
// yang butuh kompilasi native (seperti better-sqlite3), supaya `npm install` dijamin
// berhasil di hosting gratis mana pun tanpa risiko gagal build.
//
// Struktur:
//   <DATA_DIR>/tenants.json                  -> daftar semua klien
//   <DATA_DIR>/tenant-data/<tenantId>.json    -> data invoice/kontak/produk/pengaturan tiap klien

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TENANTS_FILE = path.join(DATA_DIR, 'tenants.json');
const TENANT_DATA_DIR = path.join(DATA_DIR, 'tenant-data');

fs.mkdirSync(TENANT_DATA_DIR, { recursive: true });
if (!fs.existsSync(TENANTS_FILE)) fs.writeFileSync(TENANTS_FILE, '[]', 'utf8');

// --- Antrean tulis sederhana per file, supaya dua penulisan bersamaan ke file yang sama
//     tidak saling menimpa / merusak isi file (cukup untuk skala jumlah klien UMKM). ---
const writeQueues = new Map();
function queueWrite(filePath, fn) {
  const prev = writeQueues.get(filePath) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
  });
  writeQueues.set(filePath, next);
  return next;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function atomicWriteJson(filePath, data) {
  const tmpPath = filePath + '.tmp' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
  fs.renameSync(tmpPath, filePath); // rename bersifat atomik di filesystem yang sama
}

function writeTenants(tenants) {
  return queueWrite(TENANTS_FILE, () => atomicWriteJson(TENANTS_FILE, tenants));
}

/* ============================= TENANTS ============================= */
function listTenants() {
  return readJson(TENANTS_FILE, []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

function getTenantById(id) {
  return listTenants().find(t => t.id === id) || null;
}

function getTenantByKey(licenseKey) {
  return listTenants().find(t => t.license_key === licenseKey) || null;
}

async function insertTenant(tenant) {
  const tenants = listTenants();
  tenants.push(tenant);
  await writeTenants(tenants);
  return tenant;
}

async function updateTenant(id, fields) {
  const tenants = listTenants();
  const idx = tenants.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tenants[idx] = { ...tenants[idx], ...fields };
  await writeTenants(tenants);
  return tenants[idx];
}

async function deleteTenant(id) {
  const tenants = listTenants().filter(t => t.id !== id);
  await writeTenants(tenants);
  const dataFile = tenantDataFile(id);
  if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
}

/* ============================= TENANT DATA (settings/contacts/products/invoices) ============================= */
function tenantDataFile(tenantId) {
  return path.join(TENANT_DATA_DIR, tenantId + '.json');
}

function getTenantDataValue(tenantId, key) {
  const all = readJson(tenantDataFile(tenantId), {});
  return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
}

function getAllTenantData(tenantId) {
  return readJson(tenantDataFile(tenantId), {});
}

async function setTenantDataValue(tenantId, key, value) {
  const filePath = tenantDataFile(tenantId);
  return queueWrite(filePath, () => {
    const all = readJson(filePath, {});
    all[key] = value;
    atomicWriteJson(filePath, all);
  });
}

module.exports = {
  listTenants, getTenantById, getTenantByKey, insertTenant, updateTenant, deleteTenant,
  getTenantDataValue, getAllTenantData, setTenantDataValue,
};
