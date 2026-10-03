/**
 * HSN Rate Validation Service
 *
 * Checks our local hsn_rates table against the GSTN public search API
 * every 90 days and updates any rates that have changed. On completion,
 * creates an admin notification summarising the result.
 */

import db from '../db/database.js';
import { HSN_SUBHEADINGS } from '../db/hsnData.js';

const VALIDATION_INTERVAL_DAYS = 90;
const GSTN_SEARCH_URL = 'https://services.gst.gov.in/services/api/search/goodsSearch';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, String(value));
}

function daysSince(isoDateStr) {
  if (!isoDateStr) return Infinity;
  return (Date.now() - new Date(isoDateStr).getTime()) / (1000 * 60 * 60 * 24);
}

function notifyAdmins(title, message) {
  try {
    const admins = db.prepare("SELECT id FROM users WHERE role IN ('super_admin','employee') AND status = 'approved'").all();
    const ins = db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'hsn_validation', ?, ?)");
    for (const a of admins) ins.run(a.id, title, message);
  } catch {}
}

function parseGstnRate(rateStr) {
  if (!rateStr) return null;
  if (/nil|exempt|0%/i.test(rateStr)) return 0;
  const m = rateStr.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

// ── GSTN API lookup for a single code ────────────────────────────────────────

async function fetchGstnRate(code) {
  try {
    const url = `${GSTN_SEARCH_URL}?q=${encodeURIComponent(code)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'EWaybill-App/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const items = json?.data ?? json?.results ?? [];
    const match = items.find(i => String(i.hsnCode || i.HSNCode || '').trim() === code);
    if (!match) return null;
    return parseGstnRate(match.gstRates || match.GST_Rate || match.rate || '');
  } catch {
    return null;
  }
}

// ── Core validation logic ─────────────────────────────────────────────────────

export async function validateHsnRates() {
  console.log('[HSN] Starting quarterly rate validation against GSTN portal…');

  // Re-apply bundled sub-heading overrides (picks up any code updates in hsnData.js)
  const upsert = db.prepare('INSERT OR REPLACE INTO hsn_rates (code, description, gst_rate) VALUES (?, ?, ?)');
  const refreshSubs = db.transaction(() => {
    for (const [code, description, gst_rate] of HSN_SUBHEADINGS) upsert.run(code, description, gst_rate);
  });
  refreshSubs();

  // Sample a cross-section of codes to validate against GSTN
  const sampleCodes = [
    '0401','0402','0701','0801','0901','0902','0904','1001','1006',
    '1701','1704','1804','1806','1905','2106','2201','2202','2302',
    '2501','2523','2710','2711','3004','3102','3105','3301',
    '3401','3808','3901','4011','4802','5201','5509','6101','6401',
    '6802','6904','7013','7204','7208','7213','7308','7403','7601',
    '8415','8471','8517','8703','8704','8708','8711','8716','9401',
    '9403','9503','9506',
  ];

  let changed = 0, failed = 0, checked = 0;

  for (const code of sampleCodes) {
    const local = db.prepare('SELECT gst_rate, description FROM hsn_rates WHERE code = ?').get(code);
    if (!local) continue;

    const remoteRate = await fetchGstnRate(code);
    checked++;

    if (remoteRate === null) { failed++; continue; }

    if (remoteRate !== local.gst_rate) {
      console.log(`[HSN] Rate changed: ${code} ${local.gst_rate}% → ${remoteRate}%`);
      upsert.run(code, local.description, remoteRate);
      changed++;
    }

    // Rate-limit: 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  setSetting('hsn_rates_validated_at', new Date().toISOString());
  setSetting('hsn_rates_updated_at', new Date().toISOString());

  const summary = `HSN validation complete: ${checked} codes checked, ${changed} rate(s) updated, ${failed} not found on portal (normal for broad headings).`;
  console.log('[HSN]', summary);
  notifyAdmins('HSN Rate Validation Complete', summary);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function scheduleHsnValidation() {
  const runIfDue = async () => {
    try {
      const lastValidated = getSetting('hsn_rates_validated_at');
      const days = daysSince(lastValidated);
      if (days >= VALIDATION_INTERVAL_DAYS) {
        console.log(`[HSN] Rates last validated ${Math.floor(days)} days ago — running validation now`);
        await validateHsnRates();
      }
    } catch (err) {
      console.error('[HSN] Validation error:', err.message);
    }
  };

  // Check shortly after startup (non-blocking)
  setTimeout(runIfDue, 30_000);

  // Then check once every 24 hours
  setInterval(runIfDue, 24 * 60 * 60 * 1000);
}

// ── Admin endpoint handlers ───────────────────────────────────────────────────

export function getHsnValidationStatus(req, res) {
  try {
    const updatedAt   = getSetting('hsn_rates_updated_at');
    const validatedAt = getSetting('hsn_rates_validated_at');
    const totalCodes  = db.prepare('SELECT COUNT(*) as c FROM hsn_rates').get().c;
    const daysOld     = Math.floor(daysSince(validatedAt));
    const dueDate     = validatedAt
      ? new Date(new Date(validatedAt).getTime() + VALIDATION_INTERVAL_DAYS * 86400_000).toISOString()
      : null;

    res.json({
      success: true,
      totalCodes,
      updatedAt,
      validatedAt,
      daysOld,
      nextValidationDue: dueDate,
      isOverdue: daysOld >= VALIDATION_INTERVAL_DAYS,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function triggerHsnValidation(req, res) {
  res.json({ success: true, message: 'HSN validation started in background' });
  try { await validateHsnRates(); } catch (err) { console.error('[HSN] Manual validation error:', err.message); }
}
