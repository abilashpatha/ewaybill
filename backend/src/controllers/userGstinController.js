import db from '../db/database.js';
import { encryptText } from '../utils/crypto.js';

// GET /api/user/gstins
export function getUserGstins(req, res) {
  const rows = db.prepare(`
    SELECT id, gstin, trade_name, addr1, addr2, place, pincode, state_code,
           ewb_username, is_primary, status, notes, created_at, reviewed_at
    FROM user_gstins WHERE user_id = ? ORDER BY is_primary DESC, created_at ASC
  `).all(req.user.id);
  res.json({ success: true, gstins: rows });
}

// POST /api/user/gstins  — full details required
export function addUserGstin(req, res) {
  const { tradeName, addr1, addr2, place, pincode, stateCode, ewbUsername, ewbPassword } = req.body;
  const gstin = (req.body.gstin || '').trim().toUpperCase();

  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))
    return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
  if (!tradeName?.trim()) return res.status(400).json({ success: false, error: 'Business / Trade Name is required' });
  if (!addr1?.trim()) return res.status(400).json({ success: false, error: 'Address is required' });
  if (!place?.trim()) return res.status(400).json({ success: false, error: 'City / Place is required' });
  if (!pincode?.trim() || !/^[0-9]{6}$/.test(pincode.trim()))
    return res.status(400).json({ success: false, error: 'Valid 6-digit pincode is required' });

  const existing = db.prepare('SELECT id, status FROM user_gstins WHERE user_id=? AND gstin=?').get(req.user.id, gstin);
  if (existing) return res.status(400).json({ success: false, error: `GSTIN already ${existing.status === 'approved' ? 'active' : 'pending approval'}` });

  const ewbPassEnc = ewbPassword ? encryptText(ewbPassword) : '';
  db.prepare(`
    INSERT INTO user_gstins (user_id, gstin, trade_name, addr1, addr2, place, pincode, state_code, ewb_username, ewb_password_enc, is_primary, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,'pending')
  `).run(req.user.id, gstin, tradeName.trim(), addr1.trim(), addr2?.trim() || '', place.trim(), pincode.trim(), stateCode || '29', ewbUsername?.trim() || '', ewbPassEnc);

  res.json({ success: true, message: 'GSTIN submitted for admin approval' });
}

// PUT /api/user/gstins/:id  — approved: only EWB password; pending: all fields
export function updateUserGstin(req, res) {
  const row = db.prepare('SELECT * FROM user_gstins WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ success: false, error: 'GSTIN not found' });

  if (row.status === 'approved') {
    // Only EWB username and password allowed once approved
    const { ewbUsername, ewbPassword } = req.body;
    if (ewbUsername === undefined && !ewbPassword)
      return res.status(400).json({ success: false, error: 'Only EWB portal credentials can be updated for approved GSTINs' });
    if (ewbUsername !== undefined && !ewbUsername.trim())
      return res.status(400).json({ success: false, error: 'EWB Portal Username is required' });
    const updates = [], values = [];
    if (ewbUsername !== undefined) { updates.push('ewb_username=?'); values.push(ewbUsername.trim()); }
    if (ewbPassword)               { updates.push('ewb_password_enc=?'); values.push(encryptText(ewbPassword)); }
    values.push(row.id);
    db.prepare(`UPDATE user_gstins SET ${updates.join(', ')} WHERE id=?`).run(...values);
    return res.json({ success: true, message: 'EWB credentials updated' });
  }

  // Pending — allow updating all details
  const { tradeName, addr1, addr2, place, pincode, stateCode, ewbUsername, ewbPassword } = req.body;
  const updates = [], values = [];
  if (tradeName !== undefined) { updates.push('trade_name=?'); values.push(tradeName.trim()); }
  if (addr1 !== undefined)     { updates.push('addr1=?');      values.push(addr1.trim()); }
  if (addr2 !== undefined)     { updates.push('addr2=?');      values.push(addr2?.trim() || ''); }
  if (place !== undefined)     { updates.push('place=?');      values.push(place.trim()); }
  if (pincode !== undefined)   { updates.push('pincode=?');    values.push(pincode.trim()); }
  if (stateCode !== undefined) { updates.push('state_code=?'); values.push(stateCode); }
  if (ewbUsername !== undefined) { updates.push('ewb_username=?'); values.push(ewbUsername.trim()); }
  if (ewbPassword)               { updates.push('ewb_password_enc=?'); values.push(encryptText(ewbPassword)); }
  if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
  values.push(row.id);
  db.prepare(`UPDATE user_gstins SET ${updates.join(', ')} WHERE id=?`).run(...values);
  const updated = db.prepare('SELECT id, gstin, trade_name, addr1, addr2, place, pincode, state_code, ewb_username, is_primary, status, notes, created_at FROM user_gstins WHERE id=?').get(row.id);
  res.json({ success: true, gstin: updated });
}

// DELETE /api/user/gstins/:id
export function removeUserGstin(req, res) {
  const row = db.prepare('SELECT * FROM user_gstins WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ success: false, error: 'GSTIN not found' });
  if (row.is_primary) return res.status(400).json({ success: false, error: 'Cannot remove your primary GSTIN' });
  db.prepare('DELETE FROM user_gstins WHERE id=?').run(req.params.id);
  res.json({ success: true });
}

// PUT /api/user/gstins/:id/set-primary
export function setPrimaryGstin(req, res) {
  const row = db.prepare('SELECT * FROM user_gstins WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ success: false, error: 'GSTIN not found' });
  if (row.status !== 'approved') return res.status(400).json({ success: false, error: 'Only approved GSTINs can be set as primary' });
  db.transaction(() => {
    db.prepare('UPDATE user_gstins SET is_primary=0 WHERE user_id=?').run(req.user.id);
    db.prepare('UPDATE user_gstins SET is_primary=1 WHERE id=?').run(req.params.id);
  })();
  res.json({ success: true });
}
