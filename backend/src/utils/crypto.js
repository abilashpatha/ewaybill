// NIC passwords are stored as PLAIN TEXT in the `ewb_password_enc` column
// (column name kept for backward compatibility — no encryption is performed).
// These helpers are passthroughs so the rest of the codebase can keep calling
// encryptText/decryptText without changes. Any legacy AES ciphertext that may
// still exist in the DB (format "ivHex:ctHex") is auto-cleared on read.

const LEGACY_CIPHERTEXT = /^[0-9a-f]{32}:[0-9a-f]+$/i;

export function encryptText(text) {
  if (!text) return '';
  return String(text);
}

export function decryptText(data) {
  if (!data) return '';
  if (LEGACY_CIPHERTEXT.test(data)) return ''; // legacy encrypted leftover — force re-entry
  return String(data);
}
