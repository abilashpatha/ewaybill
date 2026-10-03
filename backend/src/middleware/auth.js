import jwt from 'jsonwebtoken';
import db from '../db/database.js';

// Read lazily so dotenv has already populated process.env before first use
function getJwtSecret() {
  return process.env.JWT_SECRET;
}

export function generateToken(userId) {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: '30d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  // Also accept ?token= query param (needed for <img> src and direct file links)
  const raw = header?.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  if (!raw) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(raw, getJwtSecret());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
