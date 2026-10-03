import db from '../db/database.js';

// GET /api/eway/transporters
export function getTransporters(req, res) {
  const rows = db.prepare(
    'SELECT id, name, gstin, vehicle_no, phone, created_at FROM transporters WHERE user_id = ? ORDER BY name ASC'
  ).all(req.user.id);
  res.json({ success: true, transporters: rows });
}

// POST /api/eway/transporters
export function addTransporter(req, res) {
  const { name, gstin, vehicleNo, phone } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
  try {
    const result = db.prepare(
      'INSERT INTO transporters (user_id, name, gstin, vehicle_no, phone) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, name.trim(), gstin?.trim().toUpperCase() || '', vehicleNo?.trim().toUpperCase() || '', phone?.trim() || '');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ success: false, error: 'A transporter with this name already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /api/eway/transporters/:id
export function updateTransporter(req, res) {
  const { name, gstin, vehicleNo, phone } = req.body;
  const row = db.prepare('SELECT id FROM transporters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ success: false, error: 'Transporter not found' });
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
  db.prepare('UPDATE transporters SET name = ?, gstin = ?, vehicle_no = ?, phone = ? WHERE id = ?')
    .run(name.trim(), gstin?.trim().toUpperCase() || '', vehicleNo?.trim().toUpperCase() || '', phone?.trim() || '', req.params.id);
  res.json({ success: true });
}

// DELETE /api/eway/transporters/:id
export function deleteTransporter(req, res) {
  const row = db.prepare('SELECT id FROM transporters WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ success: false, error: 'Transporter not found' });
  db.prepare('DELETE FROM transporters WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}
