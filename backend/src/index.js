import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ocrRoutes from './routes/ocr.js';
import { scheduleHsnValidation } from './services/hsnValidationService.js';
import ewayRoutes from './routes/eway.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';
import gstinRoutes from './routes/userGstins.js';
import accountantRoutes from './routes/accountant.js';

dotenv.config();

// Fail fast if required secrets are missing or still set to known-weak defaults
const WEAK_DEFAULTS = {
  JWT_SECRET: 'ewb-jwt-secret-change-in-prod-2025',
  ENCRYPT_SECRET: 'ewb-encrypt-secret-32-bytes!!!!!',
};
for (const [key, weakDefault] of Object.entries(WEAK_DEFAULTS)) {
  if (!process.env[key]) {
    console.error(`FATAL: ${key} is not set in .env — add a strong random secret and restart.`);
    process.exit(1);
  }
  if (process.env[key] === weakDefault) {
    console.error(`FATAL: ${key} is using the insecure default value — replace it in .env with a strong random secret and restart.`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/eway', ewayRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user/gstins', gstinRoutes);
app.use('/api/accountant', accountantRoutes);

const FRONTEND_BUILD = path.join(__dirname, '../../frontend/dist');
// Assets (JS/CSS) are content-hashed → long cache; index.html must never be cached so PWA always gets fresh entry point
app.use(express.static(FRONTEND_BUILD, { index: false }));
app.get(/(.*)/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(FRONTEND_BUILD, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  scheduleHsnValidation(); // Check HSN rates every 90 days against GSTN portal
});
