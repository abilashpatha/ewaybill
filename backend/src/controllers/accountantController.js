import db from '../db/database.js';

// POST /api/accountant/request-access
// Accountant requests access to a GSTIN (business must exist in system)
export function requestGstinAccess(req, res) {
  try {
    if (req.user.role !== 'accountant') {
      return res.status(403).json({ success: false, error: 'Only accountant accounts can request GSTIN access' });
    }
    const { gstin } = req.body;
    if (!gstin?.trim()) return res.status(400).json({ success: false, error: 'GSTIN is required' });

    const gstinUpper = gstin.trim().toUpperCase();

    // Check that the business GSTIN exists and is approved
    const businessUser = db.prepare(
      "SELECT u.id, u.trade_name, u.app_username FROM users u JOIN user_gstins ug ON ug.user_id = u.id WHERE ug.gstin = ? AND ug.status = 'approved'"
    ).get(gstinUpper) || db.prepare(
      "SELECT id, trade_name, app_username FROM users WHERE gstin = ? AND status = 'approved' AND role = 'user'"
    ).get(gstinUpper);

    if (!businessUser) return res.status(404).json({ success: false, error: 'This GSTIN is not registered or not approved in our system' });

    // Prevent duplicate
    const existing = db.prepare(
      'SELECT id, status FROM accountant_gstin_access WHERE accountant_id = ? AND gstin = ?'
    ).get(req.user.id, gstinUpper);

    if (existing) {
      if (existing.status === 'approved') return res.status(409).json({ success: false, error: 'You already have access to this GSTIN' });
      if (existing.status === 'pending') return res.status(409).json({ success: false, error: 'Access request already pending for this GSTIN' });
      // If rejected, allow re-request
      db.prepare('UPDATE accountant_gstin_access SET status=?, requested_at=CURRENT_TIMESTAMP, reviewed_at=NULL, reviewed_by=NULL, notes=? WHERE id=?')
        .run('pending', '', existing.id);
      return res.json({ success: true, message: 'Access re-requested successfully' });
    }

    db.prepare(
      'INSERT INTO accountant_gstin_access (accountant_id, gstin, business_user_id, status) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, gstinUpper, businessUser.id, 'pending');

    // Notify the business user
    try {
      db.prepare(
        "INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'accountant_request', ?, ?)"
      ).run(
        businessUser.id,
        'Accountant Access Request',
        `${req.user.trade_name || req.user.app_username} has requested access to your GSTIN ${gstinUpper}`
      );
    } catch {}

    res.json({ success: true, message: 'Access request submitted. Waiting for business owner or admin approval.' });
  } catch (err) {
    console.error('[ACCOUNTANT] requestGstinAccess:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/accountant/my-gstins
// Returns all GSTINs the accountant has requested/been granted access to
export function getMyGstins(req, res) {
  try {
    const rows = db.prepare(`
      SELECT aga.id, aga.gstin, aga.status, aga.requested_at, aga.reviewed_at, aga.notes,
             u.trade_name AS business_trade_name, u.wallet_balance,
             u.addr1 AS business_addr1, u.addr2 AS business_addr2,
             u.place AS business_place, u.pincode AS business_pincode, u.state_code AS business_state_code,
             COALESCE(ug.addr1, u.addr1)       AS addr1,
             COALESCE(ug.addr2, u.addr2)       AS addr2,
             COALESCE(ug.place, u.place)       AS place,
             COALESCE(ug.pincode, u.pincode)   AS pincode,
             COALESCE(ug.state_code, u.state_code, '29') AS state_code
      FROM accountant_gstin_access aga
      LEFT JOIN users u ON u.id = aga.business_user_id
      LEFT JOIN user_gstins ug ON ug.gstin = aga.gstin AND ug.status = 'approved'
      WHERE aga.accountant_id = ?
      ORDER BY aga.requested_at DESC
    `).all(req.user.id);
    res.json({ success: true, gstins: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/accountant/access/:id
// Accountant removes their own access request
export function removeAccess(req, res) {
  try {
    const row = db.prepare('SELECT id FROM accountant_gstin_access WHERE id = ? AND accountant_id = ?')
      .get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ success: false, error: 'Access record not found' });
    db.prepare('DELETE FROM accountant_gstin_access WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/accountant/gstin-info/:gstin
// Get GSTIN display info (trade name, address) for the accountant to preview before requesting
export function getGstinInfo(req, res) {
  try {
    const gstinUpper = req.params.gstin.trim().toUpperCase();
    const row = db.prepare(
      "SELECT ug.gstin, ug.trade_name, ug.place, ug.state_code FROM user_gstins ug WHERE ug.gstin = ? AND ug.status = 'approved'"
    ).get(gstinUpper) || db.prepare(
      "SELECT gstin, trade_name, place, state_code FROM users WHERE gstin = ? AND status = 'approved'"
    ).get(gstinUpper) || db.prepare(
      "SELECT gstin, trade_name, place, state_code FROM gstin_cache WHERE gstin = ?"
    ).get(gstinUpper);

    if (!row) return res.status(404).json({ success: false, error: 'GSTIN not found in our system' });
    res.json({ success: true, info: { gstin: row.gstin, tradeName: row.trade_name, place: row.place } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// --- Business-side endpoints ---

// GET /api/accountant/business/pending-requests
// Business user sees pending requests for their GSTINs
export function getPendingRequestsForBusiness(req, res) {
  try {
    const myGstins = db.prepare(
      "SELECT gstin FROM user_gstins WHERE user_id = ? AND status = 'approved' UNION SELECT gstin FROM users WHERE id = ? AND role = 'user'"
    ).all(req.user.id, req.user.id).map(r => r.gstin);

    if (myGstins.length === 0) return res.json({ success: true, requests: [] });

    const placeholders = myGstins.map(() => '?').join(',');
    const requests = db.prepare(`
      SELECT aga.id, aga.gstin, aga.status, aga.requested_at,
             u.id AS accountant_user_id, u.app_username, u.full_name AS display_name, u.mobile
      FROM accountant_gstin_access aga
      JOIN users u ON u.id = aga.accountant_id
      WHERE aga.gstin IN (${placeholders}) AND aga.status = 'pending'
      ORDER BY aga.requested_at DESC
    `).all(...myGstins);
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/accountant/business/approved-accountants
// Business user sees all approved accountants for their GSTINs
export function getApprovedAccountantsForBusiness(req, res) {
  try {
    const myGstins = db.prepare(
      "SELECT gstin FROM user_gstins WHERE user_id = ? AND status = 'approved' UNION SELECT gstin FROM users WHERE id = ? AND role = 'user'"
    ).all(req.user.id, req.user.id).map(r => r.gstin);

    if (myGstins.length === 0) return res.json({ success: true, accountants: [] });

    const placeholders = myGstins.map(() => '?').join(',');
    const accountants = db.prepare(`
      SELECT aga.id, aga.gstin, aga.reviewed_at,
             u.id AS accountant_user_id, u.app_username, u.full_name AS display_name, u.mobile
      FROM accountant_gstin_access aga
      JOIN users u ON u.id = aga.accountant_id
      WHERE aga.gstin IN (${placeholders}) AND aga.status = 'approved'
      ORDER BY aga.reviewed_at DESC
    `).all(...myGstins);
    res.json({ success: true, accountants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/accountant/business/review/:id
// Business user approves or rejects an accountant's access request
export function reviewRequest(req, res) {
  try {
    const { action, notes } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'action must be approve or reject' });

    const row = db.prepare('SELECT * FROM accountant_gstin_access WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Request not found' });

    // Verify the business user owns the GSTIN
    const ownsGstin = db.prepare(
      "SELECT 1 FROM user_gstins WHERE user_id = ? AND gstin = ? AND status = 'approved'"
    ).get(req.user.id, row.gstin) || db.prepare(
      "SELECT 1 FROM users WHERE id = ? AND gstin = ? AND status = 'approved'"
    ).get(req.user.id, row.gstin);

    if (!ownsGstin && req.user.role !== 'super_admin' && req.user.role !== 'employee') {
      return res.status(403).json({ success: false, error: 'You do not own this GSTIN' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    db.prepare(
      'UPDATE accountant_gstin_access SET status=?, reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?, notes=? WHERE id=?'
    ).run(newStatus, req.user.id, notes || '', req.params.id);

    // Notify the accountant
    try {
      const accountant = db.prepare('SELECT id, trade_name FROM users WHERE id = ?').get(row.accountant_id);
      if (accountant) {
        db.prepare(
          "INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'gstin_access_reviewed', ?, ?)"
        ).run(
          accountant.id,
          action === 'approve' ? 'GSTIN Access Approved' : 'GSTIN Access Rejected',
          action === 'approve'
            ? `Your request for GSTIN ${row.gstin} has been approved. You can now generate e-waybills.`
            : `Your request for GSTIN ${row.gstin} was rejected. ${notes || ''}`
        );
      }
    } catch {}

    res.json({ success: true, message: `Request ${newStatus}` });
  } catch (err) {
    console.error('[ACCOUNTANT] reviewRequest:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/accountant/business/revoke/:id
// Business user revokes an accountant's approved access
export function revokeAccess(req, res) {
  try {
    const row = db.prepare('SELECT * FROM accountant_gstin_access WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Access record not found' });

    const ownsGstin = db.prepare(
      "SELECT 1 FROM user_gstins WHERE user_id = ? AND gstin = ? AND status = 'approved'"
    ).get(req.user.id, row.gstin) || db.prepare(
      "SELECT 1 FROM users WHERE id = ? AND gstin = ? AND status = 'approved'"
    ).get(req.user.id, row.gstin);

    if (!ownsGstin && req.user.role !== 'super_admin' && req.user.role !== 'employee') {
      return res.status(403).json({ success: false, error: 'You do not own this GSTIN' });
    }

    db.prepare('DELETE FROM accountant_gstin_access WHERE id = ?').run(req.params.id);

    // Notify accountant
    try {
      db.prepare(
        "INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'gstin_access_revoked', ?, ?)"
      ).run(row.accountant_id, 'GSTIN Access Revoked', `Your access to GSTIN ${row.gstin} has been revoked.`);
    } catch {}

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// --- Admin endpoints ---

// GET /api/accountant/admin/list
// Admin sees all accountant users
export function adminListAccountants(req, res) {
  try {
    const accountants = db.prepare(
      "SELECT id, app_username, full_name, trade_name, mobile, status, created_at FROM users WHERE role = 'accountant' ORDER BY created_at DESC"
    ).all();
    res.json({ success: true, accountants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/accountant/admin/all-requests
// Admin sees all pending access requests
export function adminListRequests(req, res) {
  try {
    const requests = db.prepare(`
      SELECT aga.id, aga.gstin, aga.status, aga.requested_at, aga.notes,
             u.id AS accountant_user_id, u.app_username, u.full_name, u.trade_name, u.mobile,
             b.app_username AS business_username, b.trade_name AS business_name
      FROM accountant_gstin_access aga
      JOIN users u ON u.id = aga.accountant_id
      LEFT JOIN users b ON b.id = aga.business_user_id
      ORDER BY aga.requested_at DESC
    `).all();
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/accountant/admin/review/:id
// Admin can also approve/reject
export function adminReviewRequest(req, res) {
  try {
    const { action, notes } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'action must be approve or reject' });

    const row = db.prepare('SELECT * FROM accountant_gstin_access WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Request not found' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    db.prepare(
      'UPDATE accountant_gstin_access SET status=?, reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?, notes=? WHERE id=?'
    ).run(newStatus, req.user.id, notes || '', req.params.id);

    try {
      db.prepare(
        "INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'gstin_access_reviewed', ?, ?)"
      ).run(
        row.accountant_id,
        action === 'approve' ? 'GSTIN Access Approved' : 'GSTIN Access Rejected',
        action === 'approve'
          ? `Admin approved your request for GSTIN ${row.gstin}.`
          : `Admin rejected your request for GSTIN ${row.gstin}. ${notes || ''}`
      );
    } catch {}

    res.json({ success: true, message: `Request ${newStatus}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
