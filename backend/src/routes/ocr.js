import { Router } from 'express';
import { extractFieldsFromImage } from '../controllers/ocrController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.post('/extract', requireAuth, extractFieldsFromImage);
export default router;
