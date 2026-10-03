import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_UPLOADS = path.join(__dirname, '../../../uploads');

// Receipts stored in  <project-root>/uploads/receipts/
export const UPLOADS_DIR   = path.join(BASE_UPLOADS, 'receipts');
export const SCANS_DIR     = path.join(BASE_UPLOADS, 'scans');
export const INVOICES_DIR  = path.join(BASE_UPLOADS, 'invoices');
export const EWB_PDFS_DIR  = path.join(BASE_UPLOADS, 'ewb_pdfs');

[UPLOADS_DIR, SCANS_DIR, INVOICES_DIR, EWB_PDFS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `receipt_${uid}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  cb(null, allowed.includes(file.mimetype));
};

// Up to 5 files, 5 MB each, field name "receipts"
export const uploadReceipts = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array('receipts', 5);
