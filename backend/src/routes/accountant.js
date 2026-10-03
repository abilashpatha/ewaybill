import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireApproved } from '../middleware/requireRole.js';
import {
  requestGstinAccess, getMyGstins, removeAccess, getGstinInfo,
  getPendingRequestsForBusiness, getApprovedAccountantsForBusiness,
  reviewRequest, revokeAccess,
  adminListAccountants, adminListRequests, adminReviewRequest,
} from '../controllers/accountantController.js';

const router = Router();

// Accountant-facing
router.post('/request-access',     requireAuth, requireApproved, requestGstinAccess);
router.get('/my-gstins',           requireAuth, requireApproved, getMyGstins);
router.delete('/access/:id',       requireAuth, requireApproved, removeAccess);
router.get('/gstin-info/:gstin',   requireAuth, getGstinInfo);

// Business-user-facing
router.get('/business/pending-requests',   requireAuth, requireApproved, getPendingRequestsForBusiness);
router.get('/business/approved-accountants', requireAuth, requireApproved, getApprovedAccountantsForBusiness);
router.post('/business/review/:id',        requireAuth, requireApproved, reviewRequest);
router.post('/business/revoke/:id',        requireAuth, requireApproved, revokeAccess);

// Admin-facing
router.get('/admin/list',          requireAuth, adminListAccountants);
router.get('/admin/all-requests',  requireAuth, adminListRequests);
router.post('/admin/review/:id',   requireAuth, adminReviewRequest);

export default router;
