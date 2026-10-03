import { Router } from 'express';
import { generateEwaybill, getGstinDetails, getDistance, getCharge, getCancelCharge, getEwbHistory, downloadEwbPdf, fetchAndSaveEwbPdf, cancelEwaybill, extendEwaybill, cancelEwbManual, checkDuplicate, getHsnRate, searchGstins, bulkGenerateEwaybill, getProductSuggestions } from '../controllers/ewayController.js';
import { getTransporters, addTransporter, updateTransporter, deleteTransporter } from '../controllers/transportersController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireApproved } from '../middleware/requireRole.js';
import { serveEwayFile } from '../controllers/adminController.js';

const router = Router();
router.get('/charge',                requireAuth, getCharge);
router.get('/cancel-charge',         requireAuth, getCancelCharge);
router.post('/generate',             requireAuth, requireApproved, generateEwaybill);
router.get('/history',               requireAuth, requireApproved, getEwbHistory);
router.get('/pdf/:ewbNo',
  (req, res, next) => { if (req.query.token && !req.headers.authorization) req.headers.authorization = `Bearer ${req.query.token}`; next(); },
  requireAuth, requireApproved, downloadEwbPdf
);
router.post('/fetch-pdf/:ewbNo',     requireAuth, requireApproved, fetchAndSaveEwbPdf);
router.post('/cancel/:ewbNo',        requireAuth, requireApproved, cancelEwaybill);
router.post('/extend/:ewbNo',        requireAuth, requireApproved, extendEwaybill);
router.post('/cancel-manual',        requireAuth, requireApproved, cancelEwbManual);
router.get('/gstin/:gstin',          requireAuth, requireApproved, getGstinDetails);
router.get('/check-duplicate',       requireAuth, requireApproved, checkDuplicate);
router.get('/distance',              requireAuth, requireApproved, getDistance);
router.get('/gstin-search',          requireAuth, searchGstins);
router.get('/hsn/:code',             requireAuth, getHsnRate);
router.get('/product-suggestions',   requireAuth, requireApproved, getProductSuggestions);
const tokenFromQuery = (req, res, next) => {
  if (req.query.token && !req.headers.authorization)
    req.headers.authorization = `Bearer ${req.query.token}`;
  next();
};
router.get('/scan/:filename',    tokenFromQuery, requireAuth, requireApproved, (req, res) => serveEwayFile(req, res, 'scan'));
router.get('/invoice/:filename', tokenFromQuery, requireAuth, requireApproved, (req, res) => serveEwayFile(req, res, 'invoice'));
router.get('/transporters',       requireAuth, requireApproved, getTransporters);
router.post('/transporters',      requireAuth, requireApproved, addTransporter);
router.put('/transporters/:id',   requireAuth, requireApproved, updateTransporter);
router.delete('/transporters/:id',requireAuth, requireApproved, deleteTransporter);
router.post('/bulk-generate', requireAuth, requireApproved, bulkGenerateEwaybill);
export default router;
