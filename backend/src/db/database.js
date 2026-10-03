import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { HSN_DATA, HSN_SUBHEADINGS } from './hsnData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '../../../data');
const DB_PATH = path.join(DB_DIR, 'ewaybill.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    app_username     TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    gstin            TEXT UNIQUE NOT NULL,
    trade_name       TEXT NOT NULL,
    addr1            TEXT DEFAULT '',
    addr2            TEXT DEFAULT '',
    place            TEXT DEFAULT '',
    pincode          TEXT DEFAULT '',
    state_code       TEXT DEFAULT '29',
    ewb_username     TEXT DEFAULT '',
    ewb_password_enc TEXT DEFAULT '',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

['role TEXT DEFAULT \'user\'',
 'status TEXT DEFAULT \'pending\'',
 'wallet_balance INTEGER DEFAULT 0',
 'free_until DATETIME',
 'mobile TEXT DEFAULT \'\'',
].forEach(col => { try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch {} });

db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    type          TEXT NOT NULL,
    amount        INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description   TEXT DEFAULT '',
    ref_id        TEXT DEFAULT '',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payment_orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    razorpay_order_id   TEXT UNIQUE NOT NULL,
    amount              INTEGER NOT NULL,
    status              TEXT DEFAULT 'created',
    razorpay_payment_id TEXT DEFAULT '',
    razorpay_signature  TEXT DEFAULT '',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at             DATETIME
  );

  CREATE TABLE IF NOT EXISTS business_approvals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER UNIQUE NOT NULL REFERENCES users(id),
    reviewed_by INTEGER,
    status      TEXT DEFAULT 'pending',
    notes       TEXT DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS ewb_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    ewb_no      TEXT NOT NULL,
    doc_no      TEXT DEFAULT '',
    from_gstin  TEXT DEFAULT '',
    to_gstin    TEXT DEFAULT '',
    taxable_amt REAL DEFAULT 0,
    charge      INTEGER DEFAULT 2000,
    mode        TEXT DEFAULT 'live',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS credit_receipts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_id     INTEGER NOT NULL REFERENCES wallet_transactions(id),
    filename   TEXT NOT NULL,
    orig_name  TEXT DEFAULT '',
    mime_type  TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_by INTEGER REFERENCES users(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS employee_permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    granted_by  INTEGER REFERENCES users(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, permission)
  );
`);

// GSTIN details cache — avoids repeated GSP API calls for the same GSTIN
db.exec(`
  CREATE TABLE IF NOT EXISTS gstin_cache (
    gstin      TEXT PRIMARY KEY,
    trade_name TEXT DEFAULT '',
    addr1      TEXT DEFAULT '',
    addr2      TEXT DEFAULT '',
    place      TEXT DEFAULT '',
    pincode    TEXT DEFAULT '',
    state_code TEXT DEFAULT '',
    source     TEXT DEFAULT 'gsp',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add free_ewb flag to users (idempotent)
try { db.exec("ALTER TABLE users ADD COLUMN free_ewb INTEGER DEFAULT 0"); } catch {}

// Error log table — stores every GSP API failure with user context
db.exec(`
  CREATE TABLE IF NOT EXISTS ewb_error_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id),
    username        TEXT DEFAULT '',
    gstin           TEXT DEFAULT '',
    action          TEXT DEFAULT '',
    error_code      TEXT DEFAULT '',
    error_message   TEXT DEFAULT '',
    raw_response    TEXT DEFAULT '',
    request_payload TEXT DEFAULT '',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
// Add request_payload and request_url columns to existing ewb_error_logs (idempotent)
try { db.exec("ALTER TABLE ewb_error_logs ADD COLUMN request_payload TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE ewb_error_logs ADD COLUMN request_url TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE ewb_error_logs ADD COLUMN request_headers TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE ewb_error_logs ADD COLUMN request_serial TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE ewb_logs ADD COLUMN request_serial TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE ewb_logs ADD COLUMN ewb_pdf_filename TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE ewb_logs ADD COLUMN cancelled INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE ewb_logs ADD COLUMN cancel_reason TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE ewb_logs ADD COLUMN cancelled_at DATETIME"); } catch {}

// Seed EWB request serial counter
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ewb_request_counter', '0')").run();

// Add new columns to ewb_logs if not present (idempotent migrations)
['gst_rate INTEGER DEFAULT 0',
 'gst_amount INTEGER DEFAULT 0',
 'total_charge INTEGER DEFAULT 0',
 'invoice_filename TEXT DEFAULT \'\'',
 'scan_filename TEXT DEFAULT \'\'',
].forEach(col => { try { db.exec(`ALTER TABLE ewb_logs ADD COLUMN ${col}`); } catch {} });

// Seed default per-EWB charge (₹20 = 2000 paise) and GST rate (18%)
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ewb_charge_paise', '2000')").run();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ewb_charge_gst_rate', '18')").run();

// Seed default cancel charge (₹10 = 1000 paise) and GST rate (18%)
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('cancel_charge_paise', '1000')").run();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('cancel_charge_gst_rate', '18')").run();

// Add cancel charge columns to ewb_logs
['cancel_charge INTEGER DEFAULT 0', 'cancel_gst_amount INTEGER DEFAULT 0', 'cancel_total_charge INTEGER DEFAULT 0', "cancel_invoice_filename TEXT DEFAULT ''"]
  .forEach(col => { try { db.exec(`ALTER TABLE ewb_logs ADD COLUMN ${col}`); } catch {} });

// Subscription table
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id),
    razorpay_order_id   TEXT UNIQUE NOT NULL,
    amount              INTEGER NOT NULL,
    status              TEXT DEFAULT 'created',
    razorpay_payment_id TEXT DEFAULT '',
    started_at          DATETIME,
    expires_at          DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add subscription_expires_at to users
try { db.exec("ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME"); } catch {}

// New settings
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('subscription_monthly_paise', '166000')").run();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ocr_charge_paise', '500')").run();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('distance_charge_paise', '200')").run();

// Add full form-data columns so PDF can be regenerated without GSP call
[
  "doc_date TEXT DEFAULT ''",
  "doc_type TEXT DEFAULT 'INV'",
  "supply_type TEXT DEFAULT 'O'",
  "sub_supply_type TEXT DEFAULT '1'",
  "hsn_code TEXT DEFAULT ''",
  "product_name TEXT DEFAULT ''",
  "product_desc TEXT DEFAULT ''",
  "quantity TEXT DEFAULT '0'",
  "qty_unit TEXT DEFAULT 'BAG'",
  "cgst_rate REAL DEFAULT 0",
  "sgst_rate REAL DEFAULT 0",
  "igst_rate REAL DEFAULT 0",
  "cess_rate REAL DEFAULT 0",
  "transport_mode TEXT DEFAULT '1'",
  "trans_distance TEXT DEFAULT ''",
  "vehicle_no TEXT DEFAULT ''",
  "transporter_id TEXT DEFAULT ''",
  "transporter_name TEXT DEFAULT ''",
  "trans_doc_no TEXT DEFAULT ''",
  "valid_upto TEXT DEFAULT ''",
  "from_trade_name TEXT DEFAULT ''",
  "from_addr1 TEXT DEFAULT ''",
  "from_addr2 TEXT DEFAULT ''",
  "from_place TEXT DEFAULT ''",
  "from_pincode TEXT DEFAULT ''",
  "from_state_code TEXT DEFAULT ''",
  "to_trade_name TEXT DEFAULT ''",
  "to_addr1 TEXT DEFAULT ''",
  "to_addr2 TEXT DEFAULT ''",
  "to_place TEXT DEFAULT ''",
  "to_pincode TEXT DEFAULT ''",
  "to_state_code TEXT DEFAULT ''",
].forEach(col => { try { db.exec(`ALTER TABLE ewb_logs ADD COLUMN ${col}`); } catch {} });

// Seed company/service-provider details for GST invoicing & reports
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('company_name', 'Kena Software Solutions')").run();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('company_gstin', '')").run();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('company_state_code', '36')").run();
db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('company_sac_code', '998315')").run();

const superAdmin = db.prepare("SELECT id FROM users WHERE role = 'super_admin'").get();
if (!superAdmin) {
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare(`
    INSERT INTO users (app_username, password_hash, gstin, trade_name, role, status, wallet_balance)
    VALUES ('superadmin', ?, 'ADMIN000000000SA', 'System Administrator', 'super_admin', 'approved', 0)
  `).run(hash);
  console.log('[INIT] Super admin created → username: superadmin | password: ' + adminPass);
}

db.exec(`UPDATE users SET status = 'approved' WHERE role IN ('super_admin','employee') AND (status IS NULL OR status = '')`);
db.exec(`UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''`);

// Notifications table — stores user notifications (approval, rejection, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    message    TEXT DEFAULT '',
    is_read    INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Cache for pincode → lat/lng (avoids repeated Nominatim calls)
db.exec(`
  CREATE TABLE IF NOT EXISTS pincode_coords (
    pincode    TEXT PRIMARY KEY,
    lat        REAL NOT NULL,
    lng        REAL NOT NULL,
    place_name TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// user_gstins table — supports multiple GSTINs per user with admin approval workflow
db.exec(`
  CREATE TABLE IF NOT EXISTS user_gstins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    gstin TEXT NOT NULL,
    trade_name TEXT DEFAULT '',
    addr1 TEXT DEFAULT '',
    addr2 TEXT DEFAULT '',
    place TEXT DEFAULT '',
    pincode TEXT DEFAULT '',
    state_code TEXT DEFAULT '',
    ewb_username TEXT DEFAULT '',
    ewb_password_enc TEXT DEFAULT '',
    is_primary INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, gstin)
  );
`);

// Migrate existing approved users' GSTINs to user_gstins (idempotent)
{
  const users = db.prepare("SELECT id, gstin, trade_name, addr1, addr2, place, pincode, state_code, ewb_username, ewb_password_enc FROM users WHERE role='user' AND gstin != '' AND status='approved'").all();
  const ins = db.prepare("INSERT OR IGNORE INTO user_gstins (user_id, gstin, trade_name, addr1, addr2, place, pincode, state_code, ewb_username, ewb_password_enc, is_primary, status) VALUES (?,?,?,?,?,?,?,?,?,?,1,'approved')");
  const upd = db.prepare("UPDATE user_gstins SET ewb_username=?, ewb_password_enc=? WHERE user_id=? AND gstin=? AND (ewb_username='' OR ewb_username IS NULL)");
  for (const u of users) {
    ins.run(u.id, u.gstin, u.trade_name||'', u.addr1||'', u.addr2||'', u.place||'', u.pincode||'', u.state_code||'', u.ewb_username||'', u.ewb_password_enc||'');
    upd.run(u.ewb_username||'', u.ewb_password_enc||'', u.id, u.gstin);
  }
}

// Accountant GSTIN access — accountants request access to business GSTINs
db.exec(`
  CREATE TABLE IF NOT EXISTS accountant_gstin_access (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    accountant_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gstin           TEXT NOT NULL,
    business_user_id INTEGER REFERENCES users(id),
    status          TEXT DEFAULT 'pending',
    requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at     DATETIME,
    reviewed_by     INTEGER REFERENCES users(id),
    notes           TEXT DEFAULT '',
    UNIQUE(accountant_id, gstin)
  );
`);

// Saved transporters — user's master list for quick form fill
db.exec(`
  CREATE TABLE IF NOT EXISTS transporters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    gstin       TEXT DEFAULT '',
    vehicle_no  TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
  );
`);
// Add phone column to transporters if it doesn't exist (migration for existing DBs)
try { db.exec("ALTER TABLE transporters ADD COLUMN phone TEXT DEFAULT ''"); } catch {}

// Add full_name column to users (for accountant display names)
try { db.exec("ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''"); } catch {}

// Per-user feature pricing flags
try { db.exec("ALTER TABLE users ADD COLUMN ewb_generation_free INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN cancel_free INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN extend_free INTEGER DEFAULT 0"); } catch {}

// One-time migration: clear legacy AES-encrypted NIC passwords (format "ivHex:ctHex")
// so users get a clear "re-enter credentials" prompt instead of bad-decrypt errors.
try {
  const LEGACY = "ewb_password_enc GLOB '????????????????????????????????:*'";
  const u1 = db.prepare(`UPDATE users        SET ewb_password_enc = '' WHERE ${LEGACY}`).run();
  const u2 = db.prepare(`UPDATE user_gstins  SET ewb_password_enc = '' WHERE ${LEGACY}`).run();
  if (u1.changes || u2.changes)
    console.log(`[migration] Cleared ${u1.changes} user + ${u2.changes} user_gstins legacy-encrypted NIC passwords`);
} catch (e) { console.error('[migration] Failed clearing legacy NIC passwords:', e.message); }

// Add accountant_id to ewb_logs (tracks which accountant generated the EWB)
try { db.exec("ALTER TABLE ewb_logs ADD COLUMN accountant_id INTEGER REFERENCES users(id)"); } catch {}

// Seed existing users' GSTIN details into the cache (idempotent — skips if already present)
try {
  const users = db.prepare(
    `SELECT gstin, trade_name, addr1, addr2, place, pincode, state_code FROM users
     WHERE role = 'user' AND gstin NOT LIKE 'EMP%' AND LENGTH(gstin) = 15`
  ).all();
  const upsert = db.prepare(`
    INSERT OR IGNORE INTO gstin_cache (gstin, trade_name, addr1, addr2, place, pincode, state_code, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
  `);
  users.forEach(u => upsert.run(u.gstin, u.trade_name, u.addr1 || '', u.addr2 || '', u.place || '', u.pincode || '', u.state_code || ''));
} catch {}

// HSN/SAC rates table (updated_at added idempotently via ALTER TABLE)
db.exec(`
  CREATE TABLE IF NOT EXISTS hsn_rates (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    gst_rate    REAL NOT NULL
  );
`);
try { db.exec("ALTER TABLE hsn_rates ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
{
  // Do NOT include updated_at in column list — let DEFAULT CURRENT_TIMESTAMP handle it
  const insert = db.prepare('INSERT OR IGNORE INTO hsn_rates (code, description, gst_rate) VALUES (?, ?, ?)');
  const upsert = db.prepare('INSERT OR REPLACE INTO hsn_rates (code, description, gst_rate) VALUES (?, ?, ?)');
  const count = db.prepare('SELECT COUNT(*) as c FROM hsn_rates').get().c;
  if (count === 0) {
    const seedAll = db.transaction(() => {
      for (const [code, description, gst_rate] of HSN_DATA) insert.run(code, description, gst_rate);
      for (const [code, description, gst_rate] of HSN_SUBHEADINGS) upsert.run(code, description, gst_rate);
    });
    seedAll();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('hsn_rates_updated_at', datetime('now'))").run();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('hsn_rates_validated_at', datetime('now'))").run();
    console.log(`[INIT] Seeded ${HSN_DATA.length + HSN_SUBHEADINGS.length} HSN/SAC codes`);
  } else {
    // Always upsert sub-headings to pick up new entries on redeploy
    const upsertSubs = db.transaction(() => {
      for (const [code, description, gst_rate] of HSN_SUBHEADINGS) upsert.run(code, description, gst_rate);
    });
    upsertSubs();
    // Ensure settings keys exist
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('hsn_rates_updated_at', datetime('now'))").run();
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('hsn_rates_validated_at', datetime('now'))").run();
  }
}

export default db;
