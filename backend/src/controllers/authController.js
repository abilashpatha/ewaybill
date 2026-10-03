import bcrypt from 'bcryptjs';
import db from '../db/database.js';
import { generateToken } from '../middleware/auth.js';
import { encryptText, decryptText } from '../utils/crypto.js';
import { upsertGstinCache } from '../services/gstinCacheService.js';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// POST /api/auth/register
export async function register(req, res) {
  try {
    const { appUsername, appPassword, gstin, tradeName, addr1, addr2, place, pincode, stateCode, ewbUsername, ewbPassword, mobile } = req.body;

    if (!appUsername?.trim()) return res.status(400).json({ success: false, error: 'Username is required' });
    if (!appPassword || appPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    if (!gstin?.trim() || !GSTIN_RE.test(gstin.trim().toUpperCase())) return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
    if (!tradeName?.trim()) return res.status(400).json({ success: false, error: 'Trade name is required' });
    if (!addr1?.trim()) return res.status(400).json({ success: false, error: 'Address is required' });
    if (!place?.trim()) return res.status(400).json({ success: false, error: 'City / Place is required' });
    if (!pincode?.trim() || !/^[0-9]{6}$/.test(pincode.trim())) return res.status(400).json({ success: false, error: 'Valid 6-digit pincode is required' });
    if (!mobile?.trim() || !/^[6-9][0-9]{9}$/.test(mobile.trim())) return res.status(400).json({ success: false, error: 'Valid 10-digit mobile number is required' });

    const existing = db.prepare('SELECT id FROM users WHERE app_username = ? OR gstin = ?')
      .get(appUsername.trim().toLowerCase(), gstin.trim().toUpperCase());
    if (existing) return res.status(409).json({ success: false, error: 'Username or GSTIN already registered' });

    const passwordHash = await bcrypt.hash(appPassword, 10);
    const ewbPassEnc = encryptText(ewbPassword || '');

    const result = db.prepare(`
      INSERT INTO users (app_username, password_hash, gstin, trade_name, addr1, addr2, place, pincode, state_code, ewb_username, ewb_password_enc, mobile, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 'pending')
    `).run(
      appUsername.trim().toLowerCase(),
      passwordHash,
      gstin.trim().toUpperCase(),
      tradeName.trim(),
      addr1 || '', addr2 || '',
      place || '', pincode || '',
      stateCode || '29',
      ewbUsername || '',
      ewbPassEnc,
      mobile.trim()
    );

    // Record in business_approvals so admin can track the review
    try {
      db.prepare(`
        INSERT INTO business_approvals (user_id, status) VALUES (?, 'pending')
      `).run(result.lastInsertRowid);
    } catch {}

    const token = generateToken(result.lastInsertRowid);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    // Seed this business's GSTIN into the local cache so future lookups are instant
    try {
      upsertGstinCache(gstin.trim().toUpperCase(), {
        tradeName: tradeName.trim(), addr1: addr1 || '', addr2: addr2 || '',
        place: place || '', pincode: pincode || '', stateCode: stateCode || '29',
      }, 'user');
    } catch {}

    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('[AUTH] register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/auth/register-accountant
export async function registerAccountant(req, res) {
  try {
    const { appUsername, appPassword, fullName, mobile } = req.body;

    if (!appUsername?.trim()) return res.status(400).json({ success: false, error: 'Username is required' });
    if (!appPassword || appPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    if (!fullName?.trim()) return res.status(400).json({ success: false, error: 'Full name is required' });
    if (!mobile?.trim() || !/^[6-9][0-9]{9}$/.test(mobile.trim())) return res.status(400).json({ success: false, error: 'Valid 10-digit mobile number is required' });

    const existing = db.prepare('SELECT id FROM users WHERE app_username = ?').get(appUsername.trim().toLowerCase());
    if (existing) return res.status(409).json({ success: false, error: 'Username already registered' });

    const passwordHash = await bcrypt.hash(appPassword, 10);

    const result = db.prepare(`
      INSERT INTO users (app_username, password_hash, gstin, trade_name, full_name, mobile, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'accountant', 'pending')
    `).run(
      appUsername.trim().toLowerCase(),
      passwordHash,
      'ACC-' + appUsername.trim().toLowerCase(),
      fullName.trim(),
      fullName.trim(),
      mobile.trim()
    );

    try {
      db.prepare(`INSERT INTO business_approvals (user_id, status) VALUES (?, 'pending')`).run(result.lastInsertRowid);
    } catch {}

    const token = generateToken(result.lastInsertRowid);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('[AUTH] registerAccountant error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { appUsername, appPassword } = req.body;
    if (!appUsername || !appPassword) return res.status(400).json({ success: false, error: 'Username and password required' });

    const user = db.prepare('SELECT * FROM users WHERE app_username = ?').get(appUsername.trim().toLowerCase());
    if (!user) return res.status(401).json({ success: false, error: 'Invalid username or password' });

    const valid = await bcrypt.compare(appPassword, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid username or password' });

    const token = generateToken(user.id);
    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('[AUTH] login error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/auth/me
export function getMe(req, res) {
  res.json({ success: true, user: safeUser(req.user) });
}

// PUT /api/auth/update-ewb-password
export async function updateEwbPassword(req, res) {
  try {
    const { ewbPassword } = req.body;
    if (!ewbPassword) return res.status(400).json({ success: false, error: 'New EWB password is required' });

    const ewbPassEnc = encryptText(ewbPassword);
    db.prepare('UPDATE users SET ewb_password_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(ewbPassEnc, req.user.id);
    // Mirror to user_gstins (EWB code reads from there first)
    db.prepare('UPDATE user_gstins SET ewb_password_enc = ? WHERE user_id = ?')
      .run(ewbPassEnc, req.user.id);

    res.json({ success: true, message: 'EWB portal password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /api/auth/update-profile
export async function updateProfile(req, res) {
  try {
    const { gstin, tradeName, addr1, addr2, place, pincode, stateCode, ewbUsername, ewbPassword, appPassword, mobile, fullName } = req.body;

    const updates = [];
    const values = [];

    if (gstin) {
      const g = gstin.trim().toUpperCase();
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g))
        return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
      updates.push('gstin = ?'); values.push(g);
    }
    if (tradeName !== undefined) { updates.push('trade_name = ?'); values.push(tradeName.trim()); }
    if (addr1 !== undefined) { updates.push('addr1 = ?'); values.push(addr1); }
    if (addr2 !== undefined) { updates.push('addr2 = ?'); values.push(addr2); }
    if (place) { updates.push('place = ?'); values.push(place.trim()); }
    if (pincode) { updates.push('pincode = ?'); values.push(pincode); }
    if (stateCode) { updates.push('state_code = ?'); values.push(stateCode); }
    if (ewbUsername !== undefined) { updates.push('ewb_username = ?'); values.push(ewbUsername); }
    if (ewbPassword) { updates.push('ewb_password_enc = ?'); values.push(encryptText(ewbPassword)); }
    if (mobile !== undefined) {
      if (mobile.trim() && !/^[6-9][0-9]{9}$/.test(mobile.trim()))
        return res.status(400).json({ success: false, error: 'Valid 10-digit mobile number is required' });
      updates.push('mobile = ?'); values.push(mobile.trim());
    }
    if (appPassword) {
      if (appPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      updates.push('password_hash = ?'); values.push(await bcrypt.hash(appPassword, 10));
    }
    if (fullName !== undefined) { updates.push('full_name = ?'); values.push(fullName.trim()); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Mirror NIC creds to user_gstins (EWB code reads from there first)
    try {
      if (ewbUsername !== undefined)
        db.prepare('UPDATE user_gstins SET ewb_username = ? WHERE user_id = ?').run(ewbUsername, req.user.id);
      if (ewbPassword)
        db.prepare('UPDATE user_gstins SET ewb_password_enc = ? WHERE user_id = ?').run(encryptText(ewbPassword), req.user.id);
    } catch (e) { console.error('[updateProfile] failed mirroring to user_gstins:', e.message); }

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    // Keep GSTIN cache in sync whenever profile is updated
    try {
      upsertGstinCache(updated.gstin, {
        tradeName: updated.trade_name, addr1: updated.addr1, addr2: updated.addr2,
        place: updated.place, pincode: updated.pincode, stateCode: updated.state_code,
      }, 'user');
    } catch {}

    res.json({ success: true, user: safeUser(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Strip sensitive fields for client response
function safeUser(user) {
  const { password_hash, ewb_password_enc, ...safe } = user;
  return safe;
}

// PUT /api/admin/users/:id/credentials  (super_admin only)
// Updates gstin, ewb_username, ewb_password for any user
export async function adminUpdateUserCredentials(req, res) {
  try {
    const { gstin, ewbUsername, ewbPassword } = req.body;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const updates = [], values = [];

    if (gstin !== undefined && gstin !== null) {
      const g = String(gstin).trim().toUpperCase();
      if (g && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g))
        return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
      updates.push('gstin = ?'); values.push(g);
    }
    if (ewbUsername !== undefined) { updates.push('ewb_username = ?'); values.push(ewbUsername); }
    if (ewbPassword)               { updates.push('ewb_password_enc = ?'); values.push(encryptText(ewbPassword)); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields provided' });
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // ALSO mirror to user_gstins rows — EWB code reads from user_gstins first.
    // Update all approved GSTIN rows for this user (or just the matching gstin if provided).
    try {
      const ugUpdates = [], ugValues = [];
      if (ewbUsername !== undefined) { ugUpdates.push('ewb_username = ?');     ugValues.push(ewbUsername); }
      if (ewbPassword)               { ugUpdates.push('ewb_password_enc = ?'); ugValues.push(encryptText(ewbPassword)); }
      if (ugUpdates.length > 0) {
        if (gstin) {
          ugValues.push(req.params.id, String(gstin).trim().toUpperCase());
          db.prepare(`UPDATE user_gstins SET ${ugUpdates.join(', ')} WHERE user_id = ? AND gstin = ?`).run(...ugValues);
        } else {
          ugValues.push(req.params.id);
          db.prepare(`UPDATE user_gstins SET ${ugUpdates.join(', ')} WHERE user_id = ?`).run(...ugValues);
        }
      }
    } catch (e) { console.error('[admin creds] failed mirroring to user_gstins:', e.message); }

    const updated = db.prepare('SELECT id, app_username, gstin, trade_name, ewb_username FROM users WHERE id = ?').get(req.params.id);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Internal helper: get EWB credentials for a user.
// Prefers user_gstins row (per-GSTIN credentials) over the users-table fallback,
// matching the same precedence used for accountant access in ewayController.
export function getUserEwbCredentials(user) {
  let ug = null;
  if (user?.id && user?.gstin) {
    ug = db.prepare(
      "SELECT ewb_username, ewb_password_enc FROM user_gstins WHERE user_id = ? AND gstin = ? AND status = 'approved'"
    ).get(user.id, user.gstin);
  }
  return {
    gstin: user.gstin,
    ewbUsername: ug?.ewb_username        || user.ewb_username        || '',
    ewbPassword: decryptText(ug?.ewb_password_enc || user.ewb_password_enc || ''),
  };
}

// GET /api/auth/notifications — return unread notifications for current user
export function getNotifications(req, res) {
  try {
    const notifications = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.user.id);
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /api/auth/notifications/:id/read — mark a notification as read
export function markNotificationRead(req, res) {
  try {
    const notif = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!notif) return res.status(404).json({ success: false, error: 'Notification not found' });
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /api/auth/notifications/read-all — mark all notifications as read for current user
export function markAllNotificationsRead(req, res) {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
