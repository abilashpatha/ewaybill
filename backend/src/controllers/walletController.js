import Razorpay from 'razorpay';
import crypto from 'crypto';
import db from '../db/database.js';

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// GET /api/wallet/balance
export function getBalance(req, res) {
  const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, balance: user.wallet_balance }); // paise
}

// GET /api/wallet/transactions
export function getTransactions(req, res) {
  const txns = db.prepare(
    'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(req.user.id);
  res.json({ success: true, transactions: txns });
}

// POST /api/wallet/create-order  { amount: rupees }
export async function createOrder(req, res) {
  try {
    const rupees = parseInt(req.body.amount);
    if (!rupees || rupees < 20 || rupees > 50000) {
      return res.status(400).json({ success: false, error: 'Amount must be between ₹20 and ₹50,000' });
    }
    if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_REPLACE')) {
      return res.status(400).json({ success: false, error: 'Payment gateway not configured. Contact admin.' });
    }

    const paise = rupees * 100;
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: paise,
      currency: 'INR',
      receipt: `ewb_${req.user.id}_${Date.now()}`,
    });

    db.prepare(`
      INSERT INTO payment_orders (user_id, razorpay_order_id, amount)
      VALUES (?, ?, ?)
    `).run(req.user.id, order.id, paise);

    res.json({ success: true, orderId: order.id, amount: paise, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('[WALLET] createOrder error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/wallet/verify-payment  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
export function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment details' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }

    const order = db.prepare(
      'SELECT * FROM payment_orders WHERE razorpay_order_id = ? AND user_id = ?'
    ).get(razorpay_order_id, req.user.id);

    if (!order || order.status === 'paid') {
      return res.status(400).json({ success: false, error: 'Invalid or duplicate payment' });
    }

    const creditWallet = db.transaction(() => {
      const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
      const newBalance = user.wallet_balance + order.amount;
      db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, req.user.id);
      db.prepare(`
        INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, ref_id)
        VALUES (?, 'credit_razorpay', ?, ?, 'Wallet top-up via UPI/Card', ?)
      `).run(req.user.id, order.amount, newBalance, razorpay_payment_id);
      db.prepare(`
        UPDATE payment_orders SET status='paid', razorpay_payment_id=?, razorpay_signature=?, paid_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(razorpay_payment_id, razorpay_signature, order.id);
      return newBalance;
    });

    const newBalance = creditWallet();
    res.json({ success: true, balance: newBalance });
  } catch (err) {
    console.error('[WALLET] verifyPayment error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/wallet/subscription
export function getSubscription(req, res) {
  const user = db.prepare('SELECT subscription_expires_at FROM users WHERE id = ?').get(req.user.id);
  const expiresAt = user?.subscription_expires_at;
  const active = !!(expiresAt && new Date(expiresAt) > new Date());
  res.json({ success: true, active, expires_at: expiresAt || null });
}

// POST /api/wallet/subscribe  — create Razorpay order for monthly subscription
export async function createSubscriptionOrder(req, res) {
  try {
    if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_REPLACE')) {
      return res.status(400).json({ success: false, error: 'Payment gateway not configured. Contact admin.' });
    }
    const paise = parseInt(
      db.prepare("SELECT value FROM app_settings WHERE key='subscription_monthly_paise'").get()?.value ?? '166000'
    );
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: paise,
      currency: 'INR',
      receipt: `sub_${req.user.id}_${Date.now()}`,
    });
    db.prepare(
      'INSERT INTO subscriptions (user_id, razorpay_order_id, amount) VALUES (?, ?, ?)'
    ).run(req.user.id, order.id, paise);
    res.json({ success: true, orderId: order.id, amount: paise, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('[SUB] createSubscriptionOrder error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/wallet/verify-subscription
export function verifySubscription(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ success: false, error: 'Missing payment details' });

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, error: 'Payment verification failed' });

    const sub = db.prepare(
      'SELECT * FROM subscriptions WHERE razorpay_order_id = ? AND user_id = ?'
    ).get(razorpay_order_id, req.user.id);
    if (!sub || sub.status === 'active')
      return res.status(400).json({ success: false, error: 'Invalid or duplicate subscription payment' });

    const activate = db.transaction(() => {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      db.prepare(`
        UPDATE subscriptions SET status='active', razorpay_payment_id=?, started_at=CURRENT_TIMESTAMP, expires_at=?
        WHERE id=?
      `).run(razorpay_payment_id, expires.toISOString(), sub.id);
      db.prepare(
        "UPDATE users SET subscription_expires_at=? WHERE id=?"
      ).run(expires.toISOString(), req.user.id);
      return expires.toISOString();
    });

    const expiresAt = activate();
    res.json({ success: true, active: true, expires_at: expiresAt });
  } catch (err) {
    console.error('[SUB] verifySubscription error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
