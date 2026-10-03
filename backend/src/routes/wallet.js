import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireApproved } from '../middleware/requireRole.js';
import {
  getBalance, getTransactions, createOrder, verifyPayment,
  getSubscription, createSubscriptionOrder, verifySubscription,
} from '../controllers/walletController.js';

const router = Router();
router.use(requireAuth);
router.get('/balance',              getBalance);
router.get('/transactions',         getTransactions);
router.post('/create-order',        requireApproved, createOrder);
router.post('/verify-payment',      requireApproved, verifyPayment);
router.get('/subscription',         getSubscription);
router.post('/subscribe',           requireApproved, createSubscriptionOrder);
router.post('/verify-subscription', requireApproved, verifySubscription);

export default router;
