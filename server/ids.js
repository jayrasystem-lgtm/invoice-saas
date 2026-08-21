const { customAlphabet } = require('nanoid');

const idAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const genId = customAlphabet(idAlphabet, 12);

// License key: mudah dibaca & diketik manual oleh klien, format XXXX-XXXX-XXXX
const keyAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I yang membingungkan
const genKeyPart = customAlphabet(keyAlphabet, 4);

function generateTenantId() {
  return 't_' + genId();
}

function generateLicenseKey() {
  return `${genKeyPart()}-${genKeyPart()}-${genKeyPart()}`;
}

module.exports = { generateTenantId, generateLicenseKey };
