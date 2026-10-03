import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import db from '../db/database.js';
import { UPLOADS_DIR, SCANS_DIR, INVOICES_DIR } from '../middleware/upload.js';

// GET /api/admin/analytics
export function getAnalytics(req, res) {
  const totalUsers    = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user'").get().c;
  const approvedUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user' AND status='approved'").get().c;
  const pendingUsers  = db.prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('user','accountant') AND status='pending'").get().c;
  const totalEwbs     = db.prepare("SELECT COUNT(*) as c FROM ewb_logs").get().c;
  const todayEwbs     = db.prepare("SELECT COUNT(*) as c FROM ewb_logs WHERE date(created_at)=date('now')").get().c;
  const totalRevenue  = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM payment_orders WHERE status='paid'").get().s;
  const totalCharged  = db.prepare("SELECT COALESCE(SUM(ABS(amount)),0) as s FROM wallet_transactions WHERE type='debit_ewb'").get().s;

  const recentEwbs = db.prepare(`
    SELECT el.*, u.app_username, u.trade_name FROM ewb_logs el
    JOIN users u ON el.user_id = u.id
    ORDER BY el.created_at DESC LIMIT 10
  `).all();

  const topUsers = db.prepare(`
    SELECT u.id, u.app_username, u.trade_name, u.wallet_balance,
           COUNT(el.id) as ewb_count
    FROM users u LEFT JOIN ewb_logs el ON u.id = el.user_id
    WHERE u.role='user'
    GROUP BY u.id ORDER BY ewb_count DESC LIMIT 10
  `).all();

  res.json({ success: true, analytics: {
    totalUsers, approvedUsers, pendingUsers, totalEwbs, todayEwbs,
    totalRevenue, totalCharged, recentEwbs, topUsers
  }});
}

// GET /api/admin/users
export function listUsers(req, res) {
  const { role, status, search } = req.query;
  let q = `SELECT id, app_username, gstin, trade_name, full_name, mobile, role, status, wallet_balance,
                  ewb_username, place, pincode, state_code, free_ewb, created_at,
                  ewb_generation_free, cancel_free, extend_free,
                  CASE WHEN ewb_password_enc IS NOT NULL AND ewb_password_enc != '' THEN 1 ELSE 0 END AS has_ewb_password
           FROM users WHERE 1=1`;
  const params = [];
  if (role)   { q += ' AND role = ?';   params.push(role); }
  if (status) { q += ' AND status = ?'; params.push(status); }
  if (search) {
    q += ' AND (app_username LIKE ? OR gstin LIKE ? OR trade_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  q += ' ORDER BY created_at DESC';
  const users = db.prepare(q).all(...params);
  res.json({ success: true, users });
}

// GET /api/admin/users/:id/details
export function getUserDetails(req, res) {
  const user = db.prepare(`
    SELECT id, app_username, gstin, trade_name, role, status, wallet_balance,
           ewb_username, addr1, addr2, place, pincode, state_code, mobile, full_name,
           free_ewb, free_until, created_at, ewb_generation_free, cancel_free, extend_free,
           CASE WHEN ewb_password_enc IS NOT NULL AND ewb_password_enc != '' THEN 1 ELSE 0 END AS has_ewb_password
    FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const ewbs = db.prepare('SELECT * FROM ewb_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
  const txns = db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.id);

  // Attach receipts to each credit_admin transaction
  const creditTxnIds = txns.filter(t => t.type === 'credit_admin').map(t => t.id);
  let receiptsMap = {};
  if (creditTxnIds.length) {
    const placeholders = creditTxnIds.map(() => '?').join(',');
    const recs = db.prepare(`SELECT * FROM credit_receipts WHERE txn_id IN (${placeholders})`).all(...creditTxnIds);
    recs.forEach(r => { receiptsMap[r.txn_id] = receiptsMap[r.txn_id] || []; receiptsMap[r.txn_id].push(r); });
  }
  const transactions = txns.map(t => ({ ...t, receipts: receiptsMap[t.id] || [] }));

  res.json({ success: true, user, ewbs, transactions });
}

// PUT /api/admin/users/:id/details  { trade_name, addr1, addr2, place, pincode, state_code, mobile, full_name }
export function updateUserDetails(req, res) {
  try {
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const allowed = ['trade_name', 'addr1', 'addr2', 'place', 'pincode', 'state_code', 'mobile', 'full_name'];
    const updates = [];
    const values  = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);

    // Also sync to user_gstins primary entry if this is a business user
    if (user.role === 'user') {
      const syncFields = ['trade_name', 'addr1', 'addr2', 'place', 'pincode', 'state_code'];
      const syncUpdates = [];
      const syncValues  = [];
      for (const field of syncFields) {
        if (req.body[field] !== undefined) {
          syncUpdates.push(`${field} = ?`);
          syncValues.push(req.body[field]);
        }
      }
      if (syncUpdates.length > 0) {
        syncValues.push(req.params.id);
        db.prepare(`UPDATE user_gstins SET ${syncUpdates.join(', ')} WHERE user_id = ? AND is_primary = 1`).run(...syncValues);
      }
    }

    const updated = db.prepare('SELECT id, app_username, trade_name, addr1, addr2, place, pincode, state_code, mobile, full_name FROM users WHERE id = ?').get(req.params.id);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /api/admin/users/:id/status  { status, notes }
export function updateUserStatus(req, res) {
  const { status, notes } = req.body;
  const validStatuses = ['approved', 'pending', 'suspended', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
  const existing = db.prepare('SELECT id FROM business_approvals WHERE user_id = ?').get(req.params.id);
  if (existing) {
    db.prepare(`UPDATE business_approvals SET status=?, reviewed_by=?, notes=?, reviewed_at=CURRENT_TIMESTAMP WHERE user_id=?`)
      .run(status, req.user.id, notes || '', req.params.id);
  } else {
    db.prepare(`INSERT INTO business_approvals (user_id, reviewed_by, status, notes, reviewed_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)`)
      .run(req.params.id, req.user.id, status, notes || '');
  }

  // Insert notification for the user
  const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
  const isAccountant = targetUser?.role === 'accountant';
  if (status === 'approved') {
    const msg = isAccountant
      ? 'Your accountant account has been approved. You can now request access to business GSTINs.'
      : 'Your business account has been approved. You can now generate E-Waybills.';
    db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'approval', 'Account Approved', ?)`)
      .run(req.params.id, msg);
  } else if (status === 'rejected') {
    db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'rejection', 'Account Rejected', 'Your registration was not approved. Contact support for details.')`)
      .run(req.params.id);
  } else if (status === 'suspended') {
    db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'suspension', 'Account Suspended', 'Your account has been suspended. Contact admin for assistance.')`)
      .run(req.params.id);
  }

  res.json({ success: true });
}

// PUT /api/admin/users/:id/free-ewb  { free: true|false }
export function toggleFreeEwb(req, res) {
  const { free } = req.body;
  if (typeof free !== 'boolean') {
    return res.status(400).json({ success: false, error: 'free must be true or false' });
  }
  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  if (user.role !== 'user') return res.status(400).json({ success: false, error: 'Only business accounts can be marked free' });
  db.prepare('UPDATE users SET free_ewb = ? WHERE id = ?').run(free ? 1 : 0, req.params.id);
  res.json({ success: true, free_ewb: free ? 1 : 0 });
}

// PUT /api/admin/users/:id/free-until  { free_until: "YYYY-MM-DD" | null }
export function setFreeUntil(req, res) {
  const { free_until } = req.body;
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  if (user.role !== 'user') return res.status(400).json({ success: false, error: 'Only business accounts can have free period' });

  let dateVal = null;
  if (free_until) {
    const d = new Date(free_until);
    if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid date format' });
    // Set to end of that day (23:59:59)
    d.setHours(23, 59, 59, 999);
    dateVal = d.toISOString();
  }

  db.prepare('UPDATE users SET free_until = ? WHERE id = ?').run(dateVal, req.params.id);
  res.json({ success: true, free_until: dateVal });
}

// GET /api/admin/gstin-requests?status=pending
export function listGstinRequests(req, res) {
  const status = req.query.status || 'pending';
  const rows = db.prepare(`
    SELECT ug.id, ug.gstin, ug.trade_name, ug.status, ug.notes, ug.created_at, ug.reviewed_at,
           u.id as user_id, u.app_username, u.trade_name as user_trade_name
    FROM user_gstins ug JOIN users u ON u.id = ug.user_id
    WHERE ug.status = ? AND ug.is_primary = 0
    ORDER BY ug.created_at ASC
  `).all(status);
  res.json({ success: true, requests: rows });
}

// PUT /api/admin/gstin-requests/:id  { status, notes, trade_name, addr1, addr2, place, pincode, state_code }
export function updateGstinRequestStatus(req, res) {
  const { status, notes, trade_name, addr1, addr2, place, pincode, state_code } = req.body;
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ success: false, error: 'status must be approved or rejected' });
  const row = db.prepare('SELECT * FROM user_gstins WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Request not found' });
  db.prepare(`
    UPDATE user_gstins SET status=?, notes=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP,
      trade_name=COALESCE(NULLIF(?,''),trade_name),
      addr1=COALESCE(NULLIF(?,''),addr1), addr2=COALESCE(NULLIF(?,''),addr2),
      place=COALESCE(NULLIF(?,''),place), pincode=COALESCE(NULLIF(?,''),pincode),
      state_code=COALESCE(NULLIF(?,''),state_code)
    WHERE id=?
  `).run(status, notes||'', req.user.id, trade_name||'', addr1||'', addr2||'', place||'', pincode||'', state_code||'', req.params.id);
  res.json({ success: true });
}

// POST /api/admin/users/:id/credit  (multipart/form-data: amount, note, receipts[])
export function creditWallet(req, res) {
  const rupees = parseInt(req.body.amount);
  const note = req.body.note || 'Admin credit';

  const cleanupFiles = () => {
    (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
  };

  if (!rupees || rupees <= 0) {
    cleanupFiles();
    return res.status(400).json({ success: false, error: 'Invalid amount' });
  }

  const paise = rupees * 100;
  let txnId;
  const doTxn = db.transaction(() => {
    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.params.id);
    if (!user) throw new Error('User not found');
    const newBalance = user.wallet_balance + paise;
    db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, req.params.id);
    const result = db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, ref_id)
      VALUES (?, 'credit_admin', ?, ?, ?, ?)`)
      .run(req.params.id, paise, newBalance, note, `admin_${req.user.id}`);
    txnId = result.lastInsertRowid;
    return newBalance;
  });

  try {
    const bal = doTxn();
    // Save receipt file records
    if (req.files?.length && txnId) {
      const insertReceipt = db.prepare(
        `INSERT INTO credit_receipts (txn_id, filename, orig_name, mime_type) VALUES (?,?,?,?)`
      );
      req.files.forEach(f => insertReceipt.run(txnId, f.filename, f.originalname, f.mimetype));
    }
    res.json({ success: true, balance: bal, txnId, receiptCount: req.files?.length || 0 });
  } catch (err) {
    cleanupFiles();
    res.status(400).json({ success: false, error: err.message });
  }
}

// GET /api/admin/receipts/:filename  — serve receipt file (auth required via route)
export function serveReceipt(req, res) {
  const filename = req.params.filename;
  // Prevent directory traversal
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }
  const filepath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ success: false, error: 'File not found' });
  res.sendFile(filepath);
}

// POST /api/admin/transactions/:txnId/receipts  — add receipts to an existing credit transaction
export function addTransactionReceipts(req, res) {
  const { txnId } = req.params;
  const txn = db.prepare(`SELECT * FROM wallet_transactions WHERE id = ? AND type = 'credit_admin'`).get(txnId);
  if (!txn) {
    (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    return res.status(404).json({ success: false, error: 'Credit transaction not found' });
  }
  if (!req.files?.length) {
    return res.status(400).json({ success: false, error: 'No files uploaded' });
  }
  const insert = db.prepare(`INSERT INTO credit_receipts (txn_id, filename, orig_name, mime_type) VALUES (?,?,?,?)`);
  req.files.forEach(f => insert.run(txnId, f.filename, f.originalname, f.mimetype));
  res.json({ success: true, added: req.files.length });
}

// POST /api/admin/users/:id/debit  { amount (₹), note }
export function debitWallet(req, res) {
  const rupees = parseFloat(req.body.amount);
  const note   = (req.body.note || '').trim() || 'Admin adjustment';

  if (!rupees || rupees <= 0) {
    return res.status(400).json({ success: false, error: 'Enter a valid amount to debit' });
  }

  const paise = Math.round(rupees * 100);

  const doTxn = db.transaction(() => {
    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.params.id);
    if (!user) throw new Error('User not found');
    if (user.wallet_balance < paise) throw new Error('Insufficient wallet balance to debit');
    const newBalance = user.wallet_balance - paise;
    db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, req.params.id);
    db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, ref_id)
      VALUES (?, 'debit_admin', ?, ?, ?, ?)`)
      .run(req.params.id, -paise, newBalance, note, `admin_${req.user.id}`);
    return newBalance;
  });

  try {
    const bal = doTxn();
    res.json({ success: true, balance: bal });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

// GET /api/admin/settings
export function getSettings(req, res) {
  const rows = db.prepare('SELECT key, value, updated_at FROM app_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = { value: r.value, updated_at: r.updated_at }; });
  res.json({ success: true, settings });
}

// PUT /api/admin/settings  { key, value }
export function updateSettings(req, res) {
  const { key, value } = req.body;
  if (!key || value === undefined || value === null) {
    return res.status(400).json({ success: false, error: 'key and value are required' });
  }

  const upsert = (k, v) => db.prepare(`INSERT INTO app_settings (key, value, updated_by, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .run(k, String(v), req.user.id);

  if (key === 'ewb_charge_paise') {
    const paise = parseInt(value);
    if (isNaN(paise) || paise < 0 || paise > 1000000)
      return res.status(400).json({ success: false, error: 'Charge must be between ₹0 and ₹10,000' });
    upsert(key, paise);
    return res.json({ success: true, key, value: String(paise) });
  }

  if (key === 'ewb_charge_gst_rate') {
    const rate = parseFloat(value);
    if (isNaN(rate) || rate < 0 || rate > 100)
      return res.status(400).json({ success: false, error: 'GST rate must be between 0% and 100%' });
    upsert(key, rate);
    return res.json({ success: true, key, value: String(rate) });
  }

  if (key === 'cancel_charge_paise') {
    const paise = parseInt(value);
    if (isNaN(paise) || paise < 0 || paise > 1000000)
      return res.status(400).json({ success: false, error: 'Charge must be between ₹0 and ₹10,000' });
    upsert(key, paise);
    return res.json({ success: true, key, value: String(paise) });
  }

  if (key === 'cancel_charge_gst_rate') {
    const rate = parseFloat(value);
    if (isNaN(rate) || rate < 0 || rate > 100)
      return res.status(400).json({ success: false, error: 'GST rate must be between 0% and 100%' });
    upsert(key, rate);
    return res.json({ success: true, key, value: String(rate) });
  }

  if (key === 'ewb_generation_free' || key === 'cancel_free' || key === 'extend_free') {
    const v = value === true || value === 'true' || value === '1' ? '1' : '0';
    upsert(key, v);
    return res.json({ success: true, key, value: v });
  }

  if (key === 'extend_charge_paise') {
    const paise = parseInt(value);
    if (isNaN(paise) || paise < 0 || paise > 1000000)
      return res.status(400).json({ success: false, error: 'Charge must be between ₹0 and ₹10,000' });
    upsert(key, paise);
    return res.json({ success: true, key, value: String(paise) });
  }

  if (key === 'extend_charge_gst_rate') {
    const rate = parseFloat(value);
    if (isNaN(rate) || rate < 0 || rate > 100)
      return res.status(400).json({ success: false, error: 'GST rate must be between 0% and 100%' });
    upsert(key, rate);
    return res.json({ success: true, key, value: String(rate) });
  }

  if (key === 'subscription_monthly_paise') {
    const paise = parseInt(value);
    if (isNaN(paise) || paise < 0 || paise > 100000000)
      return res.status(400).json({ success: false, error: 'Invalid subscription price' });
    upsert(key, paise);
    return res.json({ success: true, key, value: String(paise) });
  }

  if (key === 'ocr_charge_paise') {
    const paise = parseInt(value);
    if (isNaN(paise) || paise < 0 || paise > 1000000)
      return res.status(400).json({ success: false, error: 'Charge must be between ₹0 and ₹10,000' });
    upsert(key, paise);
    return res.json({ success: true, key, value: String(paise) });
  }

  if (key === 'distance_charge_paise') {
    const paise = parseInt(value);
    if (isNaN(paise) || paise < 0 || paise > 1000000)
      return res.status(400).json({ success: false, error: 'Charge must be between ₹0 and ₹10,000' });
    upsert(key, paise);
    return res.json({ success: true, key, value: String(paise) });
  }

  if (key === 'company_name') {
    const v = String(value).trim();
    if (!v) return res.status(400).json({ success: false, error: 'Company name cannot be empty' });
    upsert(key, v);
    return res.json({ success: true, key, value: v });
  }

  if (key === 'company_gstin') {
    const v = String(value).trim().toUpperCase();
    if (v && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v))
      return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
    upsert(key, v);
    return res.json({ success: true, key, value: v });
  }

  if (key === 'company_state_code') {
    const v = String(value).trim();
    if (!/^\d{1,2}$/.test(v)) return res.status(400).json({ success: false, error: 'Invalid state code' });
    upsert(key, v.padStart(2, '0'));
    return res.json({ success: true, key, value: v.padStart(2, '0') });
  }

  if (key === 'company_sac_code') {
    const v = String(value).trim();
    if (!/^\d{4,8}$/.test(v)) return res.status(400).json({ success: false, error: 'SAC code must be 4-8 digits' });
    upsert(key, v);
    return res.json({ success: true, key, value: v });
  }

  res.status(400).json({ success: false, error: 'Unknown setting key' });
}

// PUT /api/admin/users/:id/feature-flags  { ewb_generation_free, cancel_free, extend_free }
export function updateUserFeatureFlags(req, res) {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  const { ewb_generation_free, cancel_free, extend_free } = req.body;
  const toFlag = (v) => (v === true || v === 'true' || v === 1 || v === '1') ? 1 : 0;
  db.prepare(
    'UPDATE users SET ewb_generation_free = ?, cancel_free = ?, extend_free = ? WHERE id = ?'
  ).run(toFlag(ewb_generation_free), toFlag(cancel_free), toFlag(extend_free), req.params.id);
  res.json({ success: true });
}

// POST /api/admin/create-employee  { appUsername, appPassword, tradeName }
export async function createEmployee(req, res) {
  try {
    const { appUsername, appPassword, tradeName } = req.body;
    if (!appUsername || !appPassword || !tradeName) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }
    const hash = await bcrypt.hash(appPassword, 10);
    const empGstin = ('EMP' + Date.now()).slice(0, 15).padEnd(15, '0');
    db.prepare(`
      INSERT INTO users (app_username, password_hash, gstin, trade_name, role, status)
      VALUES (?, ?, ?, ?, 'employee', 'approved')
    `).run(appUsername.trim().toLowerCase(), hash, empGstin, tradeName.trim());
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ success: false, error: 'Username already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/pending-approvals  (employees + admins)
export function getPendingApprovals(req, res) {
  const users = db.prepare(`
    SELECT u.id, u.app_username, u.gstin, u.trade_name, u.full_name, u.mobile, u.role, u.created_at, u.status,
           ba.notes, ba.reviewed_at
    FROM users u LEFT JOIN business_approvals ba ON u.id = ba.user_id
    WHERE u.status = 'pending' AND u.role IN ('user', 'accountant')
    ORDER BY u.created_at ASC
  `).all();
  res.json({ success: true, users });
}

// GET /api/admin/all-transactions  ?type=&date_from=&date_to=&search=&sort=&dir=
export function getAllTransactions(req, res) {
  const { type, date_from, date_to, search, sort = 'created_at', dir = 'desc' } = req.query;
  const validSorts = { created_at: 'wt.created_at', amount: 'wt.amount', trade_name: 'u.trade_name' };
  const sortCol = validSorts[sort] || 'wt.created_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  let where = '1=1';
  const params = [];
  if (type)      { where += ' AND wt.type = ?'; params.push(type); }
  if (date_from) { where += ' AND date(wt.created_at) >= date(?)'; params.push(date_from); }
  if (date_to)   { where += ' AND date(wt.created_at) <= date(?)'; params.push(date_to); }
  if (search) {
    where += ' AND (u.trade_name LIKE ? OR u.app_username LIKE ? OR u.gstin LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const txns = db.prepare(`
    SELECT wt.*, u.app_username, u.trade_name, u.place, u.state_code,
           el.invoice_filename, el.scan_filename, el.gst_rate, el.gst_amount, el.total_charge as ewb_total_charge
    FROM wallet_transactions wt
    JOIN users u ON wt.user_id = u.id
    LEFT JOIN ewb_logs el ON el.ewb_no = wt.ref_id AND wt.type = 'debit_ewb'
    WHERE ${where}
    ORDER BY ${sortCol} ${sortDir} LIMIT 500
  `).all(...params);

  const creditTxnIds = txns.filter(t => t.type === 'credit_admin').map(t => t.id);
  let receiptsMap = {};
  if (creditTxnIds.length) {
    const placeholders = creditTxnIds.map(() => '?').join(',');
    const recs = db.prepare(`SELECT * FROM credit_receipts WHERE txn_id IN (${placeholders})`).all(...creditTxnIds);
    recs.forEach(r => { receiptsMap[r.txn_id] = receiptsMap[r.txn_id] || []; receiptsMap[r.txn_id].push(r); });
  }
  const transactions = txns.map(t => ({ ...t, receipts: receiptsMap[t.id] || [] }));
  res.json({ success: true, transactions });
}

// GET /api/admin/ewb-list  ?search=&from_state=&to_state=&date_from=&date_to=&sort=&dir=&page=&limit=
export function getEwbList(req, res) {
  const { search, from_state, to_state, date_from, date_to,
          sort = 'created_at', dir = 'desc', page = 1, limit = 50 } = req.query;
  const validSorts = { created_at: 'el.created_at', ewb_no: 'el.ewb_no',
                       taxable_amt: 'el.taxable_amt', charge: 'el.charge', trade_name: 'u.trade_name' };
  const sortCol = validSorts[sort] || 'el.created_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  let where = '1=1';
  const params = [];
  if (search) {
    where += ' AND (el.ewb_no LIKE ? OR el.doc_no LIKE ? OR u.trade_name LIKE ? OR u.app_username LIKE ? OR el.from_gstin LIKE ? OR el.to_gstin LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }
  if (from_state) { where += ' AND SUBSTR(el.from_gstin, 1, 2) = ?'; params.push(from_state); }
  if (to_state)   { where += ' AND SUBSTR(el.to_gstin,   1, 2) = ?'; params.push(to_state); }
  if (date_from)  { where += ' AND date(el.created_at) >= date(?)'; params.push(date_from); }
  if (date_to)    { where += ' AND date(el.created_at) <= date(?)'; params.push(date_to); }

  const total = db.prepare(
    `SELECT COUNT(*) as c FROM ewb_logs el JOIN users u ON el.user_id = u.id WHERE ${where}`
  ).get(...params).c;

  const ewbs = db.prepare(`
    SELECT el.id, el.ewb_no, el.doc_no, el.from_gstin, el.to_gstin,
           el.taxable_amt, el.charge, el.mode, el.created_at,
           el.gst_rate, el.gst_amount, el.total_charge, el.invoice_filename, el.scan_filename,
           u.id as user_id, u.app_username, u.trade_name, u.place, u.state_code
    FROM ewb_logs el JOIN users u ON el.user_id = u.id
    WHERE ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  res.json({ success: true, ewbs, total, page: pageNum, limit: limitNum });
}

// GET /api/admin/reports  ?type=ewb|transaction&groupBy=user_state|source_state|dest_state|city&date_from=&date_to=
export function getReports(req, res) {
  const { type = 'ewb', groupBy = 'user_state', date_from, date_to } = req.query;
  const dfWhere = [], dfParams = [];
  if (date_from) { dfWhere.push('date(??created_at) >= date(?)'); dfParams.push(date_from); }
  if (date_to)   { dfWhere.push('date(??created_at) <= date(?)'); dfParams.push(date_to); }

  const ewbDateWhere  = (dfWhere.map(c => c.replace(/\?\?/g, 'el.')).join(' AND ') || '1=1');
  const txnDateWhere  = (dfWhere.map(c => c.replace(/\?\?/g, 'wt.')).join(' AND ') || '1=1');
  const rawDateWhere  = (dfWhere.map(c => c.replace(/\?\?/g, '')).join(' AND ')    || '1=1');

  let data = [];
  if (type === 'ewb') {
    if (groupBy === 'user_state') {
      data = db.prepare(`
        SELECT u.state_code as group_key, COUNT(el.id) as count,
               COALESCE(SUM(el.taxable_amt), 0) as total_taxable,
               COALESCE(SUM(el.charge), 0) as total_charge
        FROM ewb_logs el JOIN users u ON el.user_id = u.id
        WHERE ${ewbDateWhere} GROUP BY u.state_code ORDER BY count DESC
      `).all(...dfParams);
    } else if (groupBy === 'source_state') {
      data = db.prepare(`
        SELECT SUBSTR(from_gstin,1,2) as group_key, COUNT(*) as count,
               COALESCE(SUM(taxable_amt),0) as total_taxable,
               COALESCE(SUM(charge),0) as total_charge
        FROM ewb_logs WHERE ${rawDateWhere} AND LENGTH(from_gstin) >= 2
        GROUP BY SUBSTR(from_gstin,1,2) ORDER BY count DESC
      `).all(...dfParams);
    } else if (groupBy === 'dest_state') {
      data = db.prepare(`
        SELECT SUBSTR(to_gstin,1,2) as group_key, COUNT(*) as count,
               COALESCE(SUM(taxable_amt),0) as total_taxable,
               COALESCE(SUM(charge),0) as total_charge
        FROM ewb_logs WHERE ${rawDateWhere} AND LENGTH(to_gstin) >= 2
        GROUP BY SUBSTR(to_gstin,1,2) ORDER BY count DESC
      `).all(...dfParams);
    } else if (groupBy === 'city') {
      data = db.prepare(`
        SELECT u.place as group_key, COUNT(el.id) as count,
               COALESCE(SUM(el.taxable_amt),0) as total_taxable,
               COALESCE(SUM(el.charge),0) as total_charge
        FROM ewb_logs el JOIN users u ON el.user_id = u.id
        WHERE ${ewbDateWhere} AND TRIM(u.place) != ''
        GROUP BY u.place ORDER BY count DESC
      `).all(...dfParams);
    }
  } else if (type === 'transaction') {
    if (groupBy === 'user_state') {
      data = db.prepare(`
        SELECT u.state_code as group_key, COUNT(wt.id) as count,
               COALESCE(SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END),0) as total_credit,
               COALESCE(SUM(CASE WHEN wt.amount < 0 THEN ABS(wt.amount) ELSE 0 END),0) as total_debit
        FROM wallet_transactions wt JOIN users u ON wt.user_id = u.id
        WHERE ${txnDateWhere} GROUP BY u.state_code ORDER BY count DESC
      `).all(...dfParams);
    } else if (groupBy === 'city') {
      data = db.prepare(`
        SELECT u.place as group_key, COUNT(wt.id) as count,
               COALESCE(SUM(CASE WHEN wt.amount > 0 THEN wt.amount ELSE 0 END),0) as total_credit,
               COALESCE(SUM(CASE WHEN wt.amount < 0 THEN ABS(wt.amount) ELSE 0 END),0) as total_debit
        FROM wallet_transactions wt JOIN users u ON wt.user_id = u.id
        WHERE ${txnDateWhere} AND TRIM(u.place) != ''
        GROUP BY u.place ORDER BY count DESC
      `).all(...dfParams);
    }
  }
  res.json({ success: true, data, type, groupBy });
}

// GET /api/admin/employees/:id/permissions
export function getEmployeePermissions(req, res) {
  const emp = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'employee'").get(req.params.id);
  if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });
  const perms = db.prepare('SELECT permission FROM employee_permissions WHERE employee_id = ?').all(req.params.id);
  res.json({ success: true, permissions: perms.map(p => p.permission) });
}

// PUT /api/admin/employees/:id/permissions  { permissions: ['view_reports', ...] }
export function updateEmployeePermissions(req, res) {
  const VALID_PERMS = ['manage_approvals', 'view_all_transactions', 'view_ewb_list', 'view_reports', 'view_user_list'];
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) return res.status(400).json({ success: false, error: 'permissions must be an array' });
  const invalid = permissions.filter(p => !VALID_PERMS.includes(p));
  if (invalid.length) return res.status(400).json({ success: false, error: `Invalid: ${invalid.join(', ')}` });
  const emp = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'employee'").get(req.params.id);
  if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });
  db.transaction(() => {
    db.prepare('DELETE FROM employee_permissions WHERE employee_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO employee_permissions (employee_id, permission, granted_by) VALUES (?,?,?)');
    permissions.forEach(p => ins.run(req.params.id, p, req.user.id));
  })();
  res.json({ success: true, permissions });
}

// GET /api/admin/my-permissions  — employee fetches their own permissions
export function getMyPermissions(req, res) {
  if (req.user.role === 'super_admin') {
    return res.json({ success: true, permissions: ['manage_approvals','view_all_transactions','view_ewb_list','view_reports','view_user_list'] });
  }
  const perms = db.prepare('SELECT permission FROM employee_permissions WHERE employee_id = ?').all(req.user.id);
  // Default: always include manage_approvals for employees (backward compat)
  const set = new Set(['manage_approvals', ...perms.map(p => p.permission)]);
  res.json({ success: true, permissions: [...set] });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getSetting(key, fallback = '') {
  return db.prepare("SELECT value FROM app_settings WHERE key=?").get(key)?.value ?? fallback;
}

function resolvePeriod(period_type, period, date_from, date_to) {
  const pad = (n) => String(n).padStart(2, '0');

  if (period_type === 'month' && period) {
    const [y, m] = period.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const label = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${lastDay}`, label };
  }
  if (period_type === 'quarter' && period) {
    // Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar  (financial year quarters)
    const [fy, q] = period.split('-');
    const fyNum = parseInt(fy);
    const quarterRanges = {
      Q1: { sm: 4, em: 6,  sy: fyNum,     ey: fyNum },
      Q2: { sm: 7, em: 9,  sy: fyNum,     ey: fyNum },
      Q3: { sm: 10, em: 12, sy: fyNum,    ey: fyNum },
      Q4: { sm: 1, em: 3,  sy: fyNum + 1, ey: fyNum + 1 },
    };
    const r = quarterRanges[q];
    const lastDay = new Date(r.ey, r.em, 0).getDate();
    return {
      startDate: `${r.sy}-${pad(r.sm)}-01`,
      endDate:   `${r.ey}-${pad(r.em)}-${lastDay}`,
      label: `${q} FY ${fyNum}-${String(fyNum + 1).slice(2)}`,
    };
  }
  if (period_type === 'year' && period) {
    // period = '2025-26'
    const startYr = parseInt(period.split('-')[0]);
    return {
      startDate: `${startYr}-04-01`,
      endDate:   `${startYr + 1}-03-31`,
      label: `FY ${period}`,
    };
  }
  if (period_type === 'custom' && date_from && date_to) {
    return { startDate: date_from, endDate: date_to, label: `${date_from} to ${date_to}` };
  }
  // Default: current calendar month
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  const label = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${lastDay}`, label };
}

// GET /api/admin/gst-report
// ?period_type=month|quarter|year|custom  &period=2026-03|2025-Q1|2025-26
// &date_from=YYYY-MM-DD  &date_to=YYYY-MM-DD  &format=json|csv
export function getGstReport(req, res) {
  const { period_type = 'month', period, date_from, date_to, format = 'json' } = req.query;
  const { startDate, endDate, label: periodLabel } = resolvePeriod(period_type, period, date_from, date_to);

  const companyName      = getSetting('company_name',       'Kena Software Solutions');
  const companyGstin     = getSetting('company_gstin',      '');
  const companyStateCode = getSetting('company_state_code', '36');
  const sacCode          = getSetting('company_sac_code',   '998315');

  const rows = db.prepare(`
    SELECT el.id, el.ewb_no, el.doc_no,
           el.charge, el.gst_rate, el.gst_amount, el.total_charge,
           el.invoice_filename, el.created_at,
           u.trade_name, u.gstin, u.place, u.state_code
    FROM ewb_logs el
    JOIN users u ON el.user_id = u.id
    WHERE date(el.created_at) >= date(?) AND date(el.created_at) <= date(?)
      AND (el.total_charge > 0 OR el.charge > 0)
    ORDER BY el.created_at ASC
  `).all(startDate, endDate);

  let srNo = 0;
  const invoices = rows.map(row => {
    srNo++;
    const basePaise  = row.charge      || 0;
    const gstRate    = row.gst_rate    || 0;
    const gstPaise   = row.gst_amount  || 0;
    const totalPaise = row.total_charge || (basePaise + gstPaise);
    const isIntra    = (row.state_code || '') === companyStateCode;
    const cgstPaise  = isIntra ? Math.round(gstPaise / 2) : 0;
    const sgstPaise  = isIntra ? gstPaise - cgstPaise    : 0;
    const igstPaise  = isIntra ? 0                        : gstPaise;

    // Derive invoice number from filename or id
    let invoiceNo = `INV/${row.id}`;
    if (row.invoice_filename) {
      const m = row.invoice_filename.match(/invoice_(\d+)/);
      if (m) invoiceNo = `INV/${m[1]}`;
    }

    const rawDate = row.created_at.split('T')[0] || row.created_at.split(' ')[0];

    return {
      srNo,
      invoiceNo,
      invoiceDate: rawDate,
      ewbNo: row.ewb_no,
      customerName: row.trade_name,
      customerGstin: row.gstin,
      customerPlace: row.place,
      customerStateCode: row.state_code,
      placeOfSupply: row.state_code,
      sacCode,
      description: 'E-Waybill Generation Service',
      basePaise,
      gstRate,
      cgstRate: isIntra ? gstRate / 2 : 0,
      sgstRate: isIntra ? gstRate / 2 : 0,
      igstRate: isIntra ? 0 : gstRate,
      cgstPaise,
      sgstPaise,
      igstPaise,
      gstPaise,
      totalPaise,
      isIntra,
    };
  });

  const sum = invoices.reduce((acc, r) => {
    acc.totalInvoices++;
    acc.totalBasePaise  += r.basePaise;
    acc.totalGstPaise   += r.gstPaise;
    acc.totalCgstPaise  += r.cgstPaise;
    acc.totalSgstPaise  += r.sgstPaise;
    acc.totalIgstPaise  += r.igstPaise;
    acc.totalPaise      += r.totalPaise;
    if (r.isIntra) acc.intraStateCount++; else acc.interStateCount++;
    return acc;
  }, { totalInvoices: 0, totalBasePaise: 0, totalGstPaise: 0,
       totalCgstPaise: 0, totalSgstPaise: 0, totalIgstPaise: 0,
       totalPaise: 0, intraStateCount: 0, interStateCount: 0 });

  // ── CSV export ────────────────────────────────────────────────────────────
  if (format === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rupee = (p) => (p / 100).toFixed(2);

    const header = [
      'Sr No','Invoice No','Invoice Date','EWB No',
      'Customer Name','Customer GSTIN','Place of Supply (State Code)',
      'SAC Code','Description',
      'Taxable Value (Rs)','GST Rate (%)','CGST Rate (%)','CGST (Rs)',
      'SGST Rate (%)','SGST (Rs)','IGST Rate (%)','IGST (Rs)',
      'Total Invoice Value (Rs)',
    ].join(',');

    const dataRows = invoices.map(r => [
      r.srNo, esc(r.invoiceNo), r.invoiceDate, r.ewbNo,
      esc(r.customerName), r.customerGstin, r.placeOfSupply,
      r.sacCode, esc(r.description),
      rupee(r.basePaise), r.gstRate, r.cgstRate, rupee(r.cgstPaise),
      r.sgstRate, rupee(r.sgstPaise), r.igstRate, rupee(r.igstPaise),
      rupee(r.totalPaise),
    ].join(','));

    const totalRow = [
      'TOTAL','','','','','','','','',
      rupee(sum.totalBasePaise), '', '', rupee(sum.totalCgstPaise),
      '', rupee(sum.totalSgstPaise), '', rupee(sum.totalIgstPaise),
      rupee(sum.totalPaise),
    ].join(',');

    const csv = [header, ...dataRows, '', totalRow].join('\r\n');
    const safeLabel = periodLabel.replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="GST_Report_${safeLabel}.csv"`);
    return res.send('\uFEFF' + csv);   // BOM for Excel compatibility
  }

  // ── JSON ──────────────────────────────────────────────────────────────────
  res.json({
    success: true,
    period: { type: period_type, label: periodLabel, startDate, endDate },
    company: { name: companyName, gstin: companyGstin, stateCode: companyStateCode, sacCode },
    invoices,
    summary: sum,
  });
}

// DELETE /api/admin/error-logs/:id  — delete a single error log entry
export function deleteErrorLog(req, res) {
  const { id } = req.params;
  const row = db.prepare('SELECT id FROM ewb_error_logs WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ success: false, error: 'Log not found' });
  db.prepare('DELETE FROM ewb_error_logs WHERE id = ?').run(id);
  res.json({ success: true });
}

// DELETE /api/admin/error-logs  — clear all error logs
export function clearErrorLogs(req, res) {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM ewb_error_logs').get();
  db.prepare('DELETE FROM ewb_error_logs').run();
  res.json({ success: true, deleted: count });
}

// GET /api/admin/error-logs  — recent GSP API errors with user context
export function getErrorLogs(req, res) {
  const page     = Math.max(1, parseInt(req.query.page  || '1'));
  const limitNum = Math.min(200, parseInt(req.query.limit || '50'));
  const offset   = (page - 1) * limitNum;
  const username = req.query.username || '';
  const action   = req.query.action   || '';

  const conds = [], params = [];
  if (username) { conds.push('e.username LIKE ?'); params.push(`%${username}%`); }
  if (action)   { conds.push('e.action = ?');      params.push(action); }
  const where = conds.length ? conds.join(' AND ') : '1=1';

  const total = db.prepare(`SELECT COUNT(*) as c FROM ewb_error_logs e WHERE ${where}`).get(...params).c;
  const logs  = db.prepare(`
    SELECT e.id, e.user_id, e.username, e.gstin, e.action,
           e.error_code, e.error_message, e.raw_response, e.request_payload, e.request_url, e.request_headers, e.request_serial, e.created_at,
           u.trade_name
    FROM ewb_error_logs e
    LEFT JOIN users u ON e.user_id = u.id
    WHERE ${where}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  res.json({ success: true, logs, total, page, limit: limitNum });
}

// GET /api/eway/scan/:filename  and  /api/eway/invoice/:filename
// (also used by admin panel via token query param for receipts)
export function serveEwayFile(req, res, fileType) {
  const filename = req.params.filename;
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }
  const dir = fileType === 'invoice' ? INVOICES_DIR : SCANS_DIR;
  const filepath = path.join(dir, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ success: false, error: 'File not found' });
  if (fileType === 'invoice') {
    // res.download sets Content-Disposition:attachment + Content-Length correctly for mobile
    res.download(filepath, filename, (err) => {
      if (err && !res.headersSent) res.status(500).json({ success: false, error: 'Download failed' });
    });
  } else {
    res.sendFile(filepath);
  }
}
