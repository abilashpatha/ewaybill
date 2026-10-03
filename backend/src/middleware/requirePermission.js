import db from '../db/database.js';

/**
 * Allows super_admin always.
 * Allows employee only if they have the given permission in employee_permissions.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === 'super_admin') return next();
    if (req.user.role === 'employee') {
      const perm = db.prepare(
        'SELECT id FROM employee_permissions WHERE employee_id = ? AND permission = ?'
      ).get(req.user.id, permission);
      if (perm) return next();
    }
    return res.status(403).json({ success: false, error: 'Access denied: insufficient permissions' });
  };
}
