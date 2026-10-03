export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    next();
  };
}

export function requireApproved(req, res, next) {
  const { status, role } = req.user || {};
  if (role === 'super_admin' || role === 'employee' || role === 'accountant') return next();
  if (status !== 'approved') {
    return res.status(403).json({
      success: false,
      error: status === 'pending' ? 'Account pending approval. Please wait for admin to approve your account.' : 'Account suspended. Contact support.',
      code: status === 'pending' ? 'ACCOUNT_PENDING' : 'ACCOUNT_SUSPENDED',
    });
  }
  next();
}
