import { Router } from 'express';
import { register, registerAccountant, login, getMe, updateEwbPassword, updateProfile, getNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post('/register', register);
router.post('/register-accountant', registerAccountant);
router.post('/login', loginRateLimit, login);
router.get('/me', requireAuth, getMe);
router.put('/update-ewb-password', requireAuth, updateEwbPassword);
router.put('/update-profile', requireAuth, updateProfile);

// Notification endpoints
router.get('/notifications', requireAuth, getNotifications);
router.put('/notifications/read-all', requireAuth, markAllNotificationsRead);
router.put('/notifications/:id/read', requireAuth, markNotificationRead);

export default router;
