import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireApproved } from '../middleware/requireRole.js';
import { getUserGstins, addUserGstin, updateUserGstin, removeUserGstin, setPrimaryGstin } from '../controllers/userGstinController.js';

const router = Router();
router.use(requireAuth, requireApproved);
router.get('/', getUserGstins);
router.post('/', addUserGstin);
router.put('/:id', updateUserGstin);
router.delete('/:id', removeUserGstin);
router.put('/:id/set-primary', setPrimaryGstin);

export default router;
