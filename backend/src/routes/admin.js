import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { uploadReceipts } from '../middleware/upload.js';
import { adminUpdateUserCredentials } from '../controllers/authController.js';
import {
  listUsers, getAnalytics, getUserDetails, updateUserStatus, updateUserDetails, toggleFreeEwb, setFreeUntil, updateUserFeatureFlags,
  creditWallet, debitWallet, createEmployee, getPendingApprovals, getAllTransactions,
  serveReceipt, addTransactionReceipts, getSettings, updateSettings,
  getEwbList, getReports, getGstReport, getErrorLogs, deleteErrorLog, clearErrorLogs,
  getEmployeePermissions, updateEmployeePermissions, getMyPermissions,
  listGstinRequests, updateGstinRequestStatus,
} from '../controllers/adminController.js';
import { getHsnValidationStatus, triggerHsnValidation } from '../services/hsnValidationService.js';

const router = Router();

// ── Receipt file serving (before requireAuth — uses ?token= query param) ──────
router.get('/receipts/:filename',
  (req, res, next) => {
    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  },
  requireAuth,
  requireRole('super_admin', 'employee'),
  serveReceipt
);

// ── All other admin routes require auth ───────────────────────────────────────
router.use(requireAuth);

// ── Employee / admin shared (with permission system) ─────────────────────────

// Pending approvals: always allowed for employees (manage_approvals is default)
router.get('/pending-approvals',   requireRole('employee', 'super_admin'), getPendingApprovals);
router.put('/users/:id/status',      requireRole('employee', 'super_admin'), updateUserStatus);
router.put('/users/:id/free-ewb',    requireRole('super_admin', 'employee'), toggleFreeEwb);
router.put('/users/:id/free-until',  requireRole('super_admin', 'employee'), setFreeUntil);
router.put('/users/:id/credentials',    requireRole('super_admin'), adminUpdateUserCredentials);
router.put('/users/:id/feature-flags', requireRole('super_admin'), updateUserFeatureFlags);

// Receipt attachment (employee + super_admin)
router.post('/transactions/:txnId/receipts', requireRole('super_admin', 'employee'), (req, res, next) => {
  uploadReceipts(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, addTransactionReceipts);

// My permissions (employee fetches own)
router.get('/my-permissions', requireRole('super_admin', 'employee'), getMyPermissions);

// ── Permission-gated routes (super_admin always passes, employee needs permission) ──
router.get('/all-transactions', requireRole('super_admin', 'employee'), requirePermission('view_all_transactions'), getAllTransactions);
router.get('/ewb-list',         requireRole('super_admin', 'employee'), requirePermission('view_ewb_list'),         getEwbList);
router.get('/reports',          requireRole('super_admin', 'employee'), requirePermission('view_reports'),          getReports);
router.get('/gst-report',       requireRole('super_admin', 'employee'), requirePermission('view_reports'),          getGstReport);
router.get('/users',            requireRole('super_admin', 'employee'), requirePermission('view_user_list'),        listUsers);

// ── Super admin only ──────────────────────────────────────────────────────────
router.get('/users/:id/details', requireRole('super_admin'), getUserDetails);
router.put('/users/:id/details', requireRole('super_admin'), updateUserDetails);
router.get('/analytics',         requireRole('super_admin'), getAnalytics);
router.post('/create-employee',  requireRole('super_admin'), createEmployee);

router.get('/employees/:id/permissions', requireRole('super_admin'), getEmployeePermissions);
router.put('/employees/:id/permissions', requireRole('super_admin'), updateEmployeePermissions);

// Credit wallet — multipart/form-data with optional receipt files (admin + employee)
router.post('/users/:id/credit', requireRole('super_admin', 'employee'), (req, res, next) => {
  uploadReceipts(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, creditWallet);

router.post('/users/:id/debit', requireRole('super_admin'), debitWallet);

router.get('/settings', requireRole('super_admin'), getSettings);
router.put('/settings', requireRole('super_admin'), updateSettings);

router.get('/error-logs',        requireRole('super_admin'), getErrorLogs);
router.delete('/error-logs/all', requireRole('super_admin'), clearErrorLogs);
router.delete('/error-logs/:id', requireRole('super_admin'), deleteErrorLog);

router.get('/gstin-requests',     requireRole('super_admin', 'employee'), listGstinRequests);
router.put('/gstin-requests/:id', requireRole('super_admin', 'employee'), updateGstinRequestStatus);

// HSN rate validation
router.get('/hsn-validation',      requireRole('super_admin'), getHsnValidationStatus);
router.post('/hsn-validation/run', requireRole('super_admin'), triggerHsnValidation);

export default router;
