import { getGspToken, buildEwayPayload, callGspGenerateEway, callGstinDetails, callGetEwbDetails, callCancelEwb, callExtendEwbValidity, getGspActionUrl, getGstinMasterUrl } from '../services/gspService.js';
import { getCachedGstin, upsertGstinCache } from '../services/gstinCacheService.js';
import { generateEwayPdf, generateInvoicePdf } from '../services/pdfService.js';
import { getUserEwbCredentials } from './authController.js';
import { decryptText } from '../utils/crypto.js';
import db from '../db/database.js';
import fs from 'fs';
import path from 'path';
import { EWB_PDFS_DIR } from '../middleware/upload.js';

// Persist every GSP error with user context so admin can audit
function logGspError(req, action, err, input = null, gspUrl = null, headers = null, serial = null) {
  try {
    const detail  = err.response?.data || err.message || String(err);
    const raw     = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
    const code    = err.response?.data?.errorCode || err.response?.data?.error_description || '';
    const message = err.response?.data?.message   || err.message || raw;
    const payload = input ? (typeof input === 'string' ? input : JSON.stringify(input)) : '';
    // Use explicit GSP URL > axios config URL > Express route
    const url     = gspUrl || err.config?.url || `${req.method} ${req.originalUrl}`;
    // Build headers from explicit arg > axios config headers (Authorization token masked only)
    const rawHdrs = headers || err.config?.headers || {};
    const safeHdrs = {
      requestid:     serial || rawHdrs.requestid || '',
      username:      rawHdrs.username      || '',
      gstin:         rawHdrs.gstin         || '',
      password:      rawHdrs.password      || '',
      Authorization: rawHdrs.Authorization ? '***masked***' : '',
    };
    db.prepare(`
      INSERT INTO ewb_error_logs (user_id, username, gstin, action, error_code, error_message, raw_response, request_payload, request_url, request_headers, request_serial)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user?.id           ?? null,
      req.user?.app_username ?? 'unknown',
      req.user?.gstin        ?? '',
      action,
      String(code).slice(0, 100),
      String(message).slice(0, 500),
      raw.slice(0, 2000),
      payload.slice(0, 3000),
      url.slice(0, 200),
      JSON.stringify(safeHdrs),
      serial || ''
    );
  } catch (dbErr) {
    console.error('[ERROR LOG DB]', dbErr.message);
  }
}

// Generate next sequential request serial (e.g. EWBREQ000042) — atomic SQLite increment
function nextRequestSerial() {
  try {
    const row  = db.prepare("SELECT value FROM app_settings WHERE key='ewb_request_counter'").get();
    const next = (parseInt(row?.value || '0') + 1);
    db.prepare("UPDATE app_settings SET value=? WHERE key='ewb_request_counter'").run(String(next));
    return `EWBREQ${String(next).padStart(6, '0')}`;
  } catch { return `EWBREQ${Date.now()}`; }
}

// Read per-EWB charge from DB (falls back to ₹20 if not set)
function getChargePaise() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='ewb_charge_paise'").get();
    return row ? parseInt(row.value) : 2000;
  } catch { return 2000; }
}

function getGstRatePct() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='ewb_charge_gst_rate'").get();
    return row ? parseFloat(row.value) : 18;
  } catch { return 18; }
}

function getCancelChargePaise() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='cancel_charge_paise'").get();
    return row ? parseInt(row.value) : 1000;
  } catch { return 1000; }
}

function getCancelGstRatePct() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='cancel_charge_gst_rate'").get();
    return row ? parseFloat(row.value) : 18;
  } catch { return 18; }
}

function getExtendChargePaise() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='extend_charge_paise'").get();
    return row ? parseInt(row.value) : 0;
  } catch { return 0; }
}

function getExtendGstRatePct() {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='extend_charge_gst_rate'").get();
    return row ? parseFloat(row.value) : 18;
  } catch { return 18; }
}


const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Accountant helper: resolve business user + EWB credentials for a given GSTIN
// Returns { businessUser, creds } or null if no approved access
function resolveAccountantAccess(accountantId, gstin) {
  const access = db.prepare(
    "SELECT business_user_id FROM accountant_gstin_access WHERE accountant_id = ? AND gstin = ? AND status = 'approved'"
  ).get(accountantId, gstin);
  if (!access) return null;

  const businessUser = db.prepare('SELECT * FROM users WHERE id = ?').get(access.business_user_id);
  if (!businessUser) return null;

  // Prefer user_gstins-level credentials over users table
  const ug = db.prepare(
    "SELECT ewb_username, ewb_password_enc FROM user_gstins WHERE user_id = ? AND gstin = ? AND status = 'approved'"
  ).get(access.business_user_id, gstin);

  const creds = {
    gstin,
    ewbUsername: ug?.ewb_username || businessUser.ewb_username || '',
    ewbPassword: decryptText(ug?.ewb_password_enc || businessUser.ewb_password_enc || ''),
  };

  return { businessUser, creds };
}

// Find an EWB log visible to the current user (owner or accountant with approved access)
function findEwbLog(ewbNo, userId, userRole) {
  if (userRole === 'accountant') {
    // First try: EWB the accountant generated themselves
    const byAccountant = db.prepare('SELECT * FROM ewb_logs WHERE ewb_no = ? AND accountant_id = ?').get(ewbNo, userId);
    if (byAccountant) return byAccountant;
    // Second try: EWB for a GSTIN the accountant has approved access to (generated by business user)
    const log = db.prepare('SELECT * FROM ewb_logs WHERE ewb_no = ?').get(ewbNo);
    if (!log) return null;
    const access = db.prepare(
      "SELECT 1 FROM accountant_gstin_access WHERE accountant_id = ? AND gstin = ? AND status = 'approved'"
    ).get(userId, log.from_gstin);
    return access ? log : null;
  }
  return db.prepare('SELECT * FROM ewb_logs WHERE ewb_no = ? AND user_id = ?').get(ewbNo, userId);
}

// GET /api/eway/charge — returns 0 for free businesses
export function getCharge(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.user) {
    const u = db.prepare('SELECT free_ewb, free_until FROM users WHERE id = ?').get(req.user.id);
    if (u?.free_ewb || (u?.free_until && new Date(u.free_until) > new Date())) {
      return res.json({ success: true, paise: 0, rupees: '0.00', gstRate: 0, gstPaise: 0, totalPaise: 0, totalRupees: '0.00', free: true });
    }
  }
  const paise      = getChargePaise();
  const gstRate    = getGstRatePct();
  const gstPaise   = Math.round(paise * gstRate / 100);
  const totalPaise = paise + gstPaise;
  res.json({ success: true, paise, rupees: (paise / 100).toFixed(2), gstRate, gstPaise, totalPaise, totalRupees: (totalPaise / 100).toFixed(2), free: false });
}

// GET /api/eway/cancel-charge — returns cancel charge info (free users pay ₹0)
export function getCancelCharge(req, res) {
  if (req.user) {
    const u = db.prepare('SELECT free_ewb, free_until FROM users WHERE id = ?').get(req.user.id);
    if (u?.free_ewb || (u?.free_until && new Date(u.free_until) > new Date())) {
      return res.json({ success: true, paise: 0, rupees: '0.00', gstRate: 0, gstPaise: 0, totalPaise: 0, totalRupees: '0.00', free: true });
    }
  }
  const paise      = getCancelChargePaise();
  const gstRate    = getCancelGstRatePct();
  const gstPaise   = Math.round(paise * gstRate / 100);
  const totalPaise = paise + gstPaise;
  res.json({ success: true, paise, rupees: (paise / 100).toFixed(2), gstRate, gstPaise, totalPaise, totalRupees: (totalPaise / 100).toFixed(2), free: false });
}

// GET /api/eway/gstin/:gstin  — taxpayer details (trade name, address, pincode, state)
export async function getGstinDetails(req, res) {
  try {
    const { gstin } = req.params;
    if (!GSTIN_RE.test(gstin)) {
      return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
    }

    // ── 1. Check local cache first ──────────────────────────────────────────
    const cached = getCachedGstin(gstin);
    if (cached) {
      console.log('[GSTINDET] cache hit:', gstin, 'source:', cached.source);
      return res.json({
        success: true, cached: true, source: cached.source,
        data: {
          tradeName:  cached.trade_name,
          legalName:  cached.legal_name || cached.trade_name,
          addr1:      cached.addr1,
          addr2:      cached.addr2,
          place:      cached.place,
          district:   cached.district || '',
          pincode:    cached.pincode,
          stateCode:  cached.state_code,
          status:     cached.status || '',
        },
      });
    }

    // ── 2. No cache — fall back to GSP API ─────────────────────────────────
    const hasCredentials = process.env.GSP_APP_ID && !process.env.GSP_APP_ID.startsWith('your_');
    if (!hasCredentials) {
      // Sandbox mock: derive state from GSTIN prefix
      return res.json({
        success: true, mock: true,
        data: {
          tradeName: 'Demo Business',
          addr1: '123 Demo Street', addr2: '',
          place: 'Demo City',
          pincode: '560001',
          stateCode: gstin.slice(0, 2),
        },
      });
    }

    let userCreds = req.user ? getUserEwbCredentials(req.user) : {};
    // GSTIN lookup is a master API. If current user has no NIC creds, fall back to:
    //   1. Global GSP_USERNAME/GSP_PASSWORD/GSTIN from .env, OR
    //   2. Any other user with valid NIC creds (so lookups work for everyone)
    if (!userCreds.ewbPassword) {
      if (process.env.GSP_USERNAME && process.env.GSP_PASSWORD) {
        userCreds = {
          gstin:       process.env.GSTIN        || userCreds.gstin || '',
          ewbUsername: process.env.GSP_USERNAME,
          ewbPassword: process.env.GSP_PASSWORD,
        };
      } else {
        // Find any user with a non-empty NIC password to use as lookup proxy
        const proxy = db.prepare(`
          SELECT gstin, ewb_username, ewb_password_enc FROM (
            SELECT gstin, ewb_username, ewb_password_enc FROM user_gstins WHERE ewb_password_enc != '' AND ewb_username != ''
            UNION ALL
            SELECT gstin, ewb_username, ewb_password_enc FROM users       WHERE ewb_password_enc != '' AND ewb_username != ''
          ) LIMIT 1
        `).get();
        if (proxy) {
          userCreds = {
            gstin:       proxy.gstin,
            ewbUsername: proxy.ewb_username,
            ewbPassword: decryptText(proxy.ewb_password_enc),
          };
          console.log('[GSTINDET] using proxy lookup creds (user has no NIC password set)');
        }
      }
    }
    // Final guard — no creds available anywhere
    if (!userCreds.ewbPassword) {
      return res.status(400).json({ success: false, error: 'GSTIN lookup unavailable. No NIC credentials configured. Please set your NIC username/password in Settings → NIC Credentials.' });
    }
    const serial1   = nextRequestSerial();
    const masterUrl = getGstinMasterUrl();
    const gspHeaders = { username: userCreds.ewbUsername || '', gstin: userCreds.gstin || '', password: '***masked***', Authorization: '***masked***' };
    const inputData = { gstin, callerGstin: userCreds.gstin, username: userCreds.ewbUsername };
    const token  = await getGspToken();
    const apiRes = await callGstinDetails(token, gstin, userCreds, serial1);
    console.log('[GetGSTINDetails]', gstin, 'serial:', serial1, JSON.stringify(apiRes).slice(0, 200));

    if (apiRes.success === false) {
      logGspError(req, 'GetGSTINDetails', Object.assign(new Error(apiRes.message || 'GSTIN lookup failed'), { response: { data: apiRes } }), inputData, masterUrl, gspHeaders, serial1);
      // GSP rejects when NIC password is stale/wrong — translate to user-friendly message
      const msg = String(apiRes.message || '');
      if (/access token is expired or empty|provide password/i.test(msg)) {
        return res.status(400).json({ success: false, error: 'NIC credentials missing or invalid. Please re-enter your NIC username and password in Settings → NIC Credentials.' });
      }
      return res.status(404).json({ success: false, error: apiRes.message || 'GSTIN not found' });
    }

    // Master API response: { success, result: { gstin, tradeName, legalName, address1, address2, stateCode, pinCode, status } }
    const r = apiRes.result || apiRes.data || apiRes;

    const tradeName = r.tradeName  || r.tradeNam  || r.legalName || '';
    const legalName = r.legalName  || r.lgnm      || tradeName;
    const addr1     = r.address1   || r.addr1     || '';
    const addr2     = r.address2   || r.addr2     || '';
    // API concatenates NIC fields into address1 without separators.
    // City (loc) is always at the END, after the last digit + optional ordinal (st/nd/rd/th) + optional floor/cross/road word.
    // e.g. "4-4-80/2Peddapalli" → "Peddapalli"
    //      "NIRMAL BUILDINGPLOT No 241/2429th FloorNARIMAN POINT" → "NARIMAN POINT"
    //      "44 AND 97AINFOSYS LIMITED3RD CROSSBANGALORE" → "BANGALORE"
    const place     = r.location   || r.place     || r.loc || (() => {
      if (!addr1) return '';
      const extracted = addr1
        .replace(/^.*\d+(?:st|nd|rd|th)?\s*(?:Floor|Fl|Cross|Road|Street|Lane|Nagar|Colony)?\s*/i, '')
        .trim();
      return extracted || addr1.replace(/^[\d\-\/\s,]+/, '').trim();
    })() || '';
    const district  = r.district   || r.dst       || '';
    const pincode   = String(r.pinCode || r.pincode || r.pncd || '');
    const stateCode = String(r.stateCode || r.stcd || gstin.slice(0, 2)).padStart(2, '0');
    const status    = r.status     || r.sts       || '';

    // ── 3. Store in local cache for future lookups ──────────────────────────
    try { upsertGstinCache(gstin, { tradeName, addr1, addr2, place, pincode, stateCode }, 'gsp'); } catch {}

    res.json({ success: true, cached: false, data: { tradeName, legalName, addr1, addr2, place, district, pincode, stateCode, status } });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[GetGSTINDetails error] user:', req.user?.app_username, '| gstin:', req.user?.gstin, '|', detail);
    const uc1 = req.user ? getUserEwbCredentials(req.user) : {};
    logGspError(req, 'GetGSTINDetails', err, { gstin: req.params.gstin }, getGstinMasterUrl(), { username: uc1.ewbUsername || '', gstin: uc1.gstin || '', password: '***masked***', Authorization: '***masked***' });
    res.status(500).json({ success: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  }
}

// Haversine straight-line distance (km) between two lat/lng points
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// Fetch lat/lng for a pincode — check DB cache first, else call Nominatim
async function getPincodeCoords(pincode) {
  const cached = db.prepare('SELECT lat, lng FROM pincode_coords WHERE pincode = ?').get(pincode);
  if (cached) return { lat: cached.lat, lng: cached.lng };

  const url = `https://nominatim.openstreetmap.org/search?q=${pincode},India&format=json&limit=1&countrycodes=in`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'EwaybillApp/1.0' } });
  const data = await resp.json();
  if (!data?.length) throw new Error(`Pincode ${pincode} not found`);

  const { lat, lon, display_name } = data[0];
  const coords = { lat: parseFloat(lat), lng: parseFloat(lon) };
  db.prepare('INSERT OR REPLACE INTO pincode_coords (pincode, lat, lng, place_name) VALUES (?,?,?,?)')
    .run(pincode, coords.lat, coords.lng, display_name || '');
  return coords;
}

// GET /api/eway/distance?from=PINCODE&to=PINCODE&mode=1
// Uses Nominatim (geocoding) + OSRM (real road routing), falls back to haversine×1.4
export async function getDistance(req, res) {
  try {
    const { from, to, mode = '1' } = req.query;
    if (!from || !to || !/^[0-9]{6}$/.test(from) || !/^[0-9]{6}$/.test(to)) {
      return res.status(400).json({ success: false, error: 'Valid 6-digit pincodes required' });
    }

    if (from === to) return res.json({ success: true, distance: 0, source: 'same-pincode' });

    // Distance calculation is free — no wallet deduction

    console.log('[DISTANCE] Resolving coords for pincodes:', from, '->', to);
    const [c1, c2] = await Promise.all([getPincodeCoords(from), getPincodeCoords(to)]);

    const straight = haversine(c1.lat, c1.lng, c2.lat, c2.lng);

    // Road (mode=1): use OSRM real road distance
    if (mode === '1' || !mode) {
      try {
        const osrmUrl  = `https://router.project-osrm.org/route/v1/driving/${c1.lng},${c1.lat};${c2.lng},${c2.lat}?overview=false`;
        const osrmResp = await fetch(osrmUrl, { headers: { 'User-Agent': 'EwaybillApp/1.0' } });
        const osrmData = await osrmResp.json();
        if (osrmData.code === 'Ok' && osrmData.routes?.[0]) {
          // NIC's routing gives ~12% more than OSRM for Indian roads — apply buffer to avoid rejection
          const osrmKm   = osrmData.routes[0].distance / 1000;
          const distance = Math.round(osrmKm * 1.12);
          console.log('[DISTANCE] OSRM raw:', Math.round(osrmKm), 'km → buffered:', distance, 'km (straight-line:', straight, 'km)');
          return res.json({ success: true, distance, source: 'osrm', straight });
        }
      } catch (osrmErr) {
        console.warn('[DISTANCE] OSRM failed, falling back to haversine:', osrmErr.message);
      }
      const distance = Math.round(straight * 1.6);
      console.log('[DISTANCE] Haversine×1.6 fallback:', distance, 'km');
      return res.json({ success: true, distance, source: 'haversine', straight });
    }

    // Other transport modes: haversine × factor
    const factors  = { '2': 1.2, '3': 1.0, '4': 1.5 };
    const distance = Math.round(straight * (factors[mode] || 1.3));
    console.log('[DISTANCE] mode', mode, '| haversine:', straight, 'km → ', distance, 'km');
    res.json({ success: true, distance, source: 'haversine', straight });

  } catch (err) {
    console.error('[DISTANCE error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function generateEwaybill(req, res) {
  // Declare outside try so catch block can reference them for error logging
  let serial = '';
  let gspHeaders = {};

  try {
    const form = req.body;
    if (!form.docNo || !form.fromGstin || !form.toTradeName) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // ── Accountant: resolve effective business user ───────────────────────────
    let effectiveUserId = req.user.id;
    let effectiveUser   = req.user;
    let userCreds       = req.user ? getUserEwbCredentials(req.user) : {};
    let accountantId    = null;

    if (req.user.role === 'accountant') {
      const actingGstin = form.actingGstin || form.fromGstin;
      if (!actingGstin) return res.status(400).json({ success: false, error: 'actingGstin is required for accountant users' });

      const resolved = resolveAccountantAccess(req.user.id, actingGstin.trim().toUpperCase());
      if (!resolved) return res.status(403).json({ success: false, error: 'You do not have approved access to GSTIN ' + actingGstin });

      effectiveUser   = resolved.businessUser;
      effectiveUserId = resolved.businessUser.id;
      userCreds       = resolved.creds;
      accountantId    = req.user.id;
    }

    // ── Request deduplication: if requestId already used, return cached result ──
    const clientRequestId = form.requestId || '';
    if (clientRequestId) {
      const existing = db.prepare(
        `SELECT ewb_no, valid_upto, ewb_pdf_filename, invoice_filename
         FROM ewb_logs WHERE request_serial = ? AND user_id = ?`
      ).get(clientRequestId, effectiveUserId);
      if (existing) {
        console.log('[DEDUP] Returning cached result for requestId:', clientRequestId, '| ewb:', existing.ewb_no);
        // Read cached PDF if available
        let pdfBase64 = null;
        if (existing.ewb_pdf_filename) {
          try {
            const pdfPath = path.join(EWB_PDFS_DIR, existing.ewb_pdf_filename);
            if (fs.existsSync(pdfPath)) {
              pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
            }
          } catch {}
        }
        const userRow = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(effectiveUserId);
        return res.json({
          success:         true,
          ewbNo:           existing.ewb_no,
          validUpto:       existing.valid_upto || '',
          mode:            'live',
          pdfBase64:       pdfBase64,
          invoiceFilename: existing.invoice_filename || null,
          walletBalance:   userRow?.wallet_balance ?? null,
          deduplicated:    true,
        });
      }
    }

    const hasCredentials = process.env.GSP_APP_ID && !process.env.GSP_APP_ID.startsWith('your_');
    const isMock     = !hasCredentials;
    serial     = clientRequestId || nextRequestSerial();

    // Guard: NIC password required for EWB generation under the user's GSTIN
    if (!isMock && !userCreds.ewbPassword) {
      return res.status(400).json({ success: false, error: 'NIC password not set. Please enter your NIC username and password in Settings → NIC Credentials.' });
    }

    gspHeaders = { username: userCreds.ewbUsername || '', gstin: userCreds.gstin || '', password: userCreds.ewbPassword || '', Authorization: '***masked***' };

    // Check if effective (business) user has free EWB generation
    const userRow = db.prepare('SELECT wallet_balance, free_ewb, free_until FROM users WHERE id = ?').get(effectiveUserId);
    const isFree = !!userRow?.ewb_generation_free || !!userRow?.free_ewb || !!(userRow?.free_until && new Date(userRow.free_until) > new Date());

    // Pre-validate wallet balance (only for non-mock, non-free) — no deduction yet
    if (!isMock && !isFree) {
      const BASE_PAISE  = getChargePaise();
      const GST_RATE    = getGstRatePct();
      const GST_PAISE   = Math.round(BASE_PAISE * GST_RATE / 100);
      const TOTAL_PAISE = BASE_PAISE + GST_PAISE;
      if (userRow.wallet_balance < TOTAL_PAISE) {
        return res.status(402).json({
          success: false,
          error: `Insufficient wallet balance${accountantId ? ' for business account' : ''}. Need ₹${(TOTAL_PAISE / 100).toFixed(2)} (base ₹${(BASE_PAISE / 100).toFixed(2)} + GST ₹${(GST_PAISE / 100).toFixed(2)}). Current: ₹${(userRow.wallet_balance / 100).toFixed(2)}`,
          code: 'INSUFFICIENT_BALANCE',
          balance: userRow.wallet_balance,
        });
      }
    }

    let ewbData;

    if (isMock) {
      ewbData = {
        ewayBillNo:   `MOCK${Date.now()}`.slice(0, 12),
        ewayBillDate: new Date().toLocaleString('en-IN'),
        validUpto:    new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-IN'),
        status:       'Mock',
      };
      console.log('[MOCK] E-waybill:', ewbData);
    } else {
      // ── Call GSP FIRST, before any wallet deduction ──────────────────────
      console.log('[GSP] Getting token for user:', req.user?.app_username, '| serial:', serial);
      const token = await getGspToken();
      const payload = buildEwayPayload(form);
      const apiRes = await callGspGenerateEway(token, payload, userCreds, serial);
      console.log('[GSP] API response serial:', serial, JSON.stringify(apiRes));

      if (apiRes.success === false) {
        const errMsg = apiRes.message || JSON.stringify(apiRes);
        console.error('[GENEWAYBILL error] user:', req.user?.app_username, '| serial:', serial, '| gstin:', req.user?.gstin, '|', errMsg);
        logGspError(req, 'GENEWAYBILL', Object.assign(new Error(errMsg), { response: { data: apiRes } }), payload, getGspActionUrl('GENEWAYBILL'), gspHeaders, serial);
        // GSP failed — NO wallet deduction happened, user is not charged
        return res.status(400).json({ success: false, error: errMsg, raw: apiRes });
      }

      const d = apiRes.result || apiRes.data || apiRes;
      ewbData = {
        ewayBillNo:   String(d.ewayBillNo   || d.EwbNo   || ''),
        ewayBillDate: d.ewayBillDate || d.EwbDt   || '',
        validUpto:    d.validUpto    || d.validTill || d.EwbValidTill || '',
        status:       'Active',
        raw:          d,
      };

      // Helper: all form columns to store (same for free and paid)
      const formCols = `doc_no, from_gstin, to_gstin, taxable_amt, scan_filename,
        doc_date, doc_type, supply_type, sub_supply_type,
        hsn_code, product_name, product_desc, quantity, qty_unit,
        cgst_rate, sgst_rate, igst_rate, cess_rate,
        transport_mode, trans_distance, vehicle_no,
        transporter_id, transporter_name, trans_doc_no, valid_upto,
        from_trade_name, from_addr1, from_addr2, from_place, from_pincode, from_state_code,
        to_trade_name, to_addr1, to_addr2, to_place, to_pincode, to_state_code`;
      const formVals = [
        form.docNo||'', form.fromGstin||'', form.toGstin||'',
        parseFloat(form.taxableAmount)||0, form.scan_filename||'',
        form.docDate||'', form.docType||'INV', form.supplyType||'O', String(form.subSupplyType||'1'),
        form.hsnCode||'', form.productName||'', form.productDesc||'',
        String(form.quantity||'0'), form.qtyUnit||'BAG',
        parseFloat(form.cgstRate)||0, parseFloat(form.sgstRate)||0,
        parseFloat(form.igstRate)||0, parseFloat(form.cessRate)||0,
        String(form.transportMode||'1'), String(form.transDistance||''),
        form.vehicleNo||'',
        form.transporterId||'', form.transporterName||'', form.transDocNo||'',
        ewbData.validUpto||'',
        form.fromTradeName||'', form.fromAddr1||'', form.fromAddr2||'',
        form.fromPlace||'', form.fromPincode||'', form.fromStateCode||'',
        form.toTradeName||'', form.toAddr1||'', form.toAddr2||'',
        form.toPlace||'', form.toPincode||'', form.toStateCode||'',
      ];
      const formPlaceholders = formVals.map(() => '?').join(', ');

      // ── GSP succeeded — NOW deduct wallet + log (atomically) ─────────────
      if (isFree) {
        // Free EWB: log with 0 charge + wallet_transaction (₹0) + invoice (₹0)
        const freshUser = db.prepare('SELECT trade_name, gstin, place, state_code, wallet_balance FROM users WHERE id = ?').get(effectiveUserId);
        const acctCol   = accountantId ? ', accountant_id' : '';
        const acctVal   = accountantId ? ', ?' : '';
        const freeLogResult = db.prepare(`INSERT INTO ewb_logs (user_id, ewb_no, request_serial, ${formCols}, charge, gst_rate, gst_amount, total_charge${acctCol})
          VALUES (?, ?, ?, ${formPlaceholders}, 0, 0, 0, 0${acctVal})`)
          .run(effectiveUserId, ewbData.ewayBillNo, serial, ...formVals, ...(accountantId ? [accountantId] : []));
        // ₹0 wallet transaction so invoice exists in transaction history
        const freeTxn = db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, ref_id)
          VALUES (?, 'free_ewb', 0, ?, ?, ?)`)
          .run(effectiveUserId, freshUser.wallet_balance, 'E-Waybill generated (Free)', ewbData.ewayBillNo);
        // Generate ₹0 invoice PDF
        const freeInvoiceNo = `INV-${Date.now()}`;
        const freeInvoiceResult = await generateInvoicePdf({
          invoiceNo:  freeInvoiceNo,
          ewbNo:      ewbData.ewayBillNo,
          tradeName:  freshUser.trade_name || '',
          gstin:      freshUser.gstin      || '',
          place:      freshUser.place      || '',
          stateCode:  freshUser.state_code || '',
          basePaise:  0,
          gstRate:    0,
          gstPaise:   0,
          totalPaise: 0,
          date:       new Date(),
          isFree:     true,
        });
        db.prepare('UPDATE ewb_logs SET invoice_filename = ? WHERE id = ?')
          .run(freeInvoiceResult.filename, freeLogResult.lastInsertRowid);
        ewbData._newBalance       = freshUser.wallet_balance;
        ewbData._invoiceFilename  = freeInvoiceResult.filename;
        ewbData._invoiceBase64    = freeInvoiceResult.base64;
      } else {
        // Paid business: deduct total (base + GST) and log — atomic SQLite transaction
        // This runs ONLY AFTER GSP success, so user is never charged for failed requests
        const deductAndLog = db.transaction((fVals) => {
          const BASE_PAISE  = getChargePaise();
          const GST_RATE    = getGstRatePct();
          const GST_PAISE   = Math.round(BASE_PAISE * GST_RATE / 100);
          const TOTAL_PAISE = BASE_PAISE + GST_PAISE;
          const u = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(effectiveUserId);
          if (u.wallet_balance < TOTAL_PAISE) throw new Error('INSUFFICIENT_BALANCE');
          const newBalance = u.wallet_balance - TOTAL_PAISE;
          db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, effectiveUserId);
          const txnResult = db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, ref_id)
            VALUES (?, 'debit_ewb', ?, ?, ?, ?)`)
            .run(effectiveUserId, -TOTAL_PAISE, newBalance,
                 `E-Waybill generated (base ₹${(BASE_PAISE/100).toFixed(2)} + GST ${GST_RATE}%)`,
                 ewbData.ewayBillNo);
          const acctCol = accountantId ? ', accountant_id' : '';
          const acctVal = accountantId ? ', ?' : '';
          const ewbLogResult = db.prepare(`INSERT INTO ewb_logs (user_id, ewb_no, request_serial, ${formCols}, charge, gst_rate, gst_amount, total_charge${acctCol})
            VALUES (?, ?, ?, ${formPlaceholders}, ?, ?, ?, ?${acctVal})`)
            .run(effectiveUserId, ewbData.ewayBillNo, serial, ...fVals, BASE_PAISE, GST_RATE, GST_PAISE, TOTAL_PAISE, ...(accountantId ? [accountantId] : []));
          return { newBalance, txnId: txnResult.lastInsertRowid, ewbLogId: ewbLogResult.lastInsertRowid, BASE_PAISE, GST_RATE, GST_PAISE, TOTAL_PAISE };
        });

        const deductResult = deductAndLog(formVals);
        ewbData._newBalance = deductResult.newBalance;

        // Generate invoice PDF (async, after transaction)
        const billableUser = db.prepare('SELECT trade_name, gstin, place, state_code FROM users WHERE id = ?').get(effectiveUserId);
        const invoiceNo = `INV-${Date.now()}`;
        const invoiceResult = await generateInvoicePdf({
          invoiceNo,
          ewbNo:     ewbData.ewayBillNo,
          tradeName: billableUser?.trade_name || '',
          gstin:     billableUser?.gstin      || '',
          place:     billableUser?.place      || '',
          stateCode: billableUser?.state_code || '',
          basePaise: deductResult.BASE_PAISE,
          gstRate:   deductResult.GST_RATE,
          gstPaise:  deductResult.GST_PAISE,
          totalPaise:deductResult.TOTAL_PAISE,
          date:      new Date(),
        });

        // Store invoice filename in ewb_log
        db.prepare('UPDATE ewb_logs SET invoice_filename = ? WHERE id = ?')
          .run(invoiceResult.filename, deductResult.ewbLogId);
        ewbData._invoiceFilename = invoiceResult.filename;
        ewbData._invoiceBase64   = invoiceResult.base64;
      }
    }

    const pdfResult = await generateEwayPdf(ewbData, form);

    // Persist PDF filename in ewb_logs so it can be served later (always, including mock)
    if (pdfResult.filename) {
      try {
        db.prepare('UPDATE ewb_logs SET ewb_pdf_filename = ? WHERE ewb_no = ? AND user_id = ?')
          .run(pdfResult.filename, ewbData.ewayBillNo, effectiveUserId);
      } catch {}
    }

    res.json({
      success:         true,
      ewbNo:           ewbData.ewayBillNo,
      validUpto:       ewbData.validUpto,
      mode:            isMock ? 'mock' : 'live',
      pdfBase64:       pdfResult.base64,
      invoiceBase64:   ewbData._invoiceBase64   ?? null,
      invoiceFilename: ewbData._invoiceFilename  ?? null,
      walletBalance:   ewbData._newBalance       ?? null,
      raw:             ewbData,
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({ success: false, error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' });
    }
    const detail = err.response?.data || err.message;
    console.error('[ERROR] generateEwaybill user:', req.user?.app_username, '| gstin:', req.user?.gstin, '|', detail);
    logGspError(req, 'GENEWAYBILL', err, req.body, getGspActionUrl('GENEWAYBILL'), gspHeaders, serial);

    res.status(500).json({ success: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  }
}

// GET /api/eway/history  — user's own EWB history from DB
export function getEwbHistory(req, res) {
  const page  = Math.max(1, parseInt(req.query.page || '1'));
  const limit = Math.min(100, parseInt(req.query.limit || '20'));
  const offset = (page - 1) * limit;
  const filterGstin = req.query.gstin || null;

  if (req.user.role === 'accountant') {
    if (filterGstin) {
      // When a specific GSTIN is selected, show ALL EWBs for that GSTIN
      // (same full history the business user sees) — but only if accountant has approved access
      const gstinUpper = filterGstin.trim().toUpperCase();
      const access = db.prepare(
        "SELECT business_user_id FROM accountant_gstin_access WHERE accountant_id = ? AND gstin = ? AND status = 'approved'"
      ).get(req.user.id, gstinUpper);
      if (!access) {
        console.log('[ACCOUNTANT HISTORY] No approved access for accountant', req.user.id, 'GSTIN', gstinUpper);
        return res.status(403).json({ success: false, error: 'No approved access to this GSTIN' });
      }

      console.log('[ACCOUNTANT HISTORY] business_user_id:', access.business_user_id, 'from_gstin:', gstinUpper);

      // Query by from_gstin only — covers EWBs generated by business user directly
      // AND EWBs generated by accountant on their behalf (both have same from_gstin)
      const total = db.prepare(
        'SELECT COUNT(*) as c FROM ewb_logs WHERE from_gstin = ?'
      ).get(gstinUpper).c;

      console.log('[ACCOUNTANT HISTORY] total EWBs found:', total);

      const logs = db.prepare(`
        SELECT ewb_no, doc_no, from_gstin, to_gstin, taxable_amt, charge, gst_rate, gst_amount, total_charge,
               created_at, invoice_filename, scan_filename, ewb_pdf_filename, valid_upto,
               cancelled, cancel_reason, cancelled_at, accountant_id
        FROM ewb_logs WHERE from_gstin = ?
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).all(gstinUpper, limit, offset);
      return res.json({ success: true, logs, total, page, limit });
    }

    // No GSTIN filter: show all EWBs the accountant personally generated (across all GSTINs)
    const total = db.prepare('SELECT COUNT(*) as c FROM ewb_logs WHERE accountant_id = ?').get(req.user.id).c;
    const logs  = db.prepare(`
      SELECT ewb_no, doc_no, from_gstin, to_gstin, taxable_amt, charge, gst_rate, gst_amount, total_charge,
             created_at, invoice_filename, scan_filename, ewb_pdf_filename, valid_upto,
             cancelled, cancel_reason, cancelled_at
      FROM ewb_logs WHERE accountant_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);
    return res.json({ success: true, logs, total, page, limit });
  }

  const total = db.prepare('SELECT COUNT(*) as c FROM ewb_logs WHERE user_id = ?').get(req.user.id).c;
  const logs  = db.prepare(`
    SELECT ewb_no, doc_no, from_gstin, to_gstin, taxable_amt, charge, gst_rate, gst_amount, total_charge,
           created_at, invoice_filename, scan_filename, ewb_pdf_filename, valid_upto,
           cancelled, cancel_reason, cancelled_at
    FROM ewb_logs WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);

  res.json({ success: true, logs, total, page, limit });
}

// GET /api/eway/pdf/:ewbNo
export function downloadEwbPdf(req, res) {
  const ewbNo = req.params.ewbNo;
  const log = findEwbLog(ewbNo, req.user.id, req.user.role);

  if (!log?.ewb_pdf_filename) {
    return res.status(404).json({ success: false, error: 'PDF not found. Try "Refresh from GSP".' });
  }
  const filepath = path.join(EWB_PDFS_DIR, log.ewb_pdf_filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, error: 'PDF file missing on server. Try "Refresh from GSP".' });
  }

  const dlName = `EWaybill-${ewbNo}.pdf`;
  if (req.query.dl) {
    // res.download sets Content-Disposition:attachment + Content-Length — works on all mobile browsers
    res.download(filepath, dlName, (err) => {
      if (err && !res.headersSent) res.status(500).json({ success: false, error: 'Download failed' });
    });
  } else {
    // Inline for Open/Print view
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${dlName}"`);
    res.sendFile(filepath, (err) => {
      if (err && !res.headersSent) res.status(500).json({ success: false, error: 'File read failed' });
    });
  }
}

// Build formData from local DB — uses stored columns first, falls back to gstin_cache
function buildFormDataFromLocal(log) {
  // Address fallback: if not stored in log, try gstin_cache
  const from = (log.from_trade_name ? null : getCachedGstin(log.from_gstin)) || {};
  const to   = (log.to_trade_name   ? null : getCachedGstin(log.to_gstin))   || {};
  return {
    fromGstin:       log.from_gstin       || '',
    fromTradeName:   log.from_trade_name  || from.trade_name || '',
    fromAddr1:       log.from_addr1       || from.addr1      || '',
    fromAddr2:       log.from_addr2       || from.addr2      || '',
    fromPlace:       log.from_place       || from.place      || '',
    fromPincode:     log.from_pincode     || from.pincode    || '',
    fromStateCode:   log.from_state_code  || from.state_code || '',
    toGstin:         log.to_gstin         || '',
    toTradeName:     log.to_trade_name    || to.trade_name   || '',
    toAddr1:         log.to_addr1         || to.addr1        || '',
    toAddr2:         log.to_addr2         || to.addr2        || '',
    toPlace:         log.to_place         || to.place        || '',
    toPincode:       log.to_pincode       || to.pincode      || '',
    toStateCode:     log.to_state_code    || to.state_code   || '',
    docNo:           log.doc_no           || '',
    docDate:         log.doc_date         || '',
    docType:         log.doc_type         || 'INV',
    supplyType:      log.supply_type      || 'O',
    subSupplyType:   log.sub_supply_type  || '1',
    taxableAmount:   String(log.taxable_amt || '0'),
    hsnCode:         log.hsn_code         || '',
    productName:     log.product_name     || '',
    productDesc:     log.product_desc     || '',
    quantity:        log.quantity         || '0',
    qtyUnit:         log.qty_unit         || 'BAG',
    cgstRate:        String(log.cgst_rate || '0'),
    sgstRate:        String(log.sgst_rate || '0'),
    igstRate:        String(log.igst_rate || '0'),
    cessRate:        String(log.cess_rate || '0'),
    transportMode:   log.transport_mode   || '1',
    transDistance:   log.trans_distance   || '',
    vehicleNo:       log.vehicle_no       || '',
    transporterId:   log.transporter_id   || '',
    transporterName: log.transporter_name || '',
    transDocNo:      log.trans_doc_no     || '',
  };
}

// POST /api/eway/fetch-pdf/:ewbNo
// 1. Try GSP GETEWBDT for latest EWB details
// 2. Fall back to local DB data (gstin_cache + ewb_logs) if GSP fails
export async function fetchAndSaveEwbPdf(req, res) {
  try {
    const ewbNo = req.params.ewbNo;

    // Always need the local log to update ewb_pdf_filename
    const log = findEwbLog(ewbNo, req.user.id, req.user.role);
    if (!log) return res.status(404).json({ success: false, error: 'EWB not found in your records' });
    const logOwnerId = log.user_id; // actual business user's ID for credential lookup

    let ewbData, formData, source = 'local';

    // ── Try GSP first ──────────────────────────────────────────────────────
    try {
      // For accountants, use the business user's credentials
      const credUser = req.user.role === 'accountant'
        ? db.prepare('SELECT * FROM users WHERE id = ?').get(logOwnerId)
        : req.user;
      const userCreds = getUserEwbCredentials(credUser);
      const serial    = nextRequestSerial();
      console.log('[FETCH-PDF] Trying GSP GETEWBDT:', ewbNo, '| serial:', serial);
      const gspToken  = await getGspToken();
      const apiRes    = await callGetEwbDetails(gspToken, ewbNo, userCreds, serial);

      if (apiRes.success !== false) {
        const d = apiRes.result || apiRes.data || apiRes;
        ewbData  = {
          ewayBillNo:   String(d.ewbNo || d.ewayBillNo || ewbNo),
          ewayBillDate: d.ewbDate      || d.ewayBillDate || '',
          validUpto:    d.validUpto    || d.ewbValidTill  || '',
          status:       d.status       || 'Active',
        };
        formData = {
          fromGstin:     d.fromGstin   || '',
          fromTradeName: d.fromTrdName || d.fromTradeName || '',
          fromAddr1:     d.fromAddr1   || '',
          fromAddr2:     d.fromAddr2   || '',
          fromPlace:     d.fromPlace   || '',
          fromPincode:   String(d.fromPincode || ''),
          toGstin:       d.toGstin     || '',
          toTradeName:   d.toTrdName   || d.toTradeName || '',
          toAddr1:       d.toAddr1     || '',
          toAddr2:       d.toAddr2     || '',
          toPlace:       d.toPlace     || '',
          toPincode:     String(d.toPincode || ''),
          docNo:         d.docNo       || '',
          docDate:       d.docDate     || '',
          taxableAmount: String(d.totalValue || d.taxableAmount || ''),
          productName:   d.itemList?.[0]?.productName || '',
          hsnCode:       String(d.itemList?.[0]?.hsnCode || ''),
          vehicleNo:     d.vehicleNo   || '',
          transportMode: String(d.transMode || '1'),
          transDistance: String(d.transDistance || ''),
        };
        source = 'gsp';
        console.log('[FETCH-PDF] GSP data received for', ewbNo);
      } else {
        console.warn('[FETCH-PDF] GSP returned error:', apiRes.message, '— falling back to local data');
      }
    } catch (gspErr) {
      console.warn('[FETCH-PDF] GSP call failed:', gspErr.message, '— falling back to local data');
    }

    // ── Fall back to local DB if GSP failed ───────────────────────────────
    if (!ewbData) {
      ewbData  = { ewayBillNo: ewbNo, ewayBillDate: '', validUpto: '', status: 'Active' };
      formData = buildFormDataFromLocal(log);
      console.log('[FETCH-PDF] Regenerating PDF from local data for', ewbNo);
    }

    const pdfResult = await generateEwayPdf(ewbData, formData);
    db.prepare('UPDATE ewb_logs SET ewb_pdf_filename = ? WHERE ewb_no = ? AND user_id = ?')
      .run(pdfResult.filename, ewbNo, logOwnerId);

    console.log('[FETCH-PDF] saved:', pdfResult.filename, '| source:', source);
    res.json({ success: true, ewbNo, source, filename: pdfResult.filename, pdfBase64: pdfResult.base64 });
  } catch (err) {
    console.error('[FETCH-PDF error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/eway/cancel/:ewbNo
// Body: { cancelRsnCode: 1|2|3|4, cancelRmrk: 'reason text' }
// cancelRsnCode: 1=Duplicate, 2=Order Cancelled, 3=Data Entry mistake, 4=Others
export async function cancelEwaybill(req, res) {
  const { ewbNo } = req.params;
  const { cancelRsnCode = 2, cancelRmrk = '' } = req.body;

  try {
    const log = findEwbLog(ewbNo, req.user.id, req.user.role);
    if (!log) return res.status(404).json({ success: false, error: 'E-Waybill not found in your history' });
    if (log.cancelled) return res.status(400).json({ success: false, error: 'E-Waybill already cancelled' });

    // For accountants, bill the business user's wallet
    const billingUserId = log.user_id;
    const billingUser   = db.prepare('SELECT * FROM users WHERE id = ?').get(billingUserId);

    // ── Compute cancel charge ───────────────────────────────────────────────
    const userRow = db.prepare('SELECT wallet_balance, free_ewb, free_until FROM users WHERE id = ?').get(billingUserId);
    const isFree  = !!userRow?.cancel_free || !!userRow?.free_ewb || !!(userRow?.free_until && new Date(userRow.free_until) > new Date());
    const BASE_PAISE = isFree ? 0 : getCancelChargePaise();
    const GST_RATE   = isFree ? 0 : getCancelGstRatePct();
    const GST_PAISE  = isFree ? 0 : Math.round(BASE_PAISE * GST_RATE / 100);
    const TOTAL_PAISE = BASE_PAISE + GST_PAISE;

    if (!isFree && TOTAL_PAISE > 0 && userRow.wallet_balance < TOTAL_PAISE) {
      return res.status(402).json({
        success: false,
        error: `Insufficient wallet balance. Cancellation fee is ₹${(TOTAL_PAISE / 100).toFixed(2)} (base ₹${(BASE_PAISE / 100).toFixed(2)} + GST ₹${(GST_PAISE / 100).toFixed(2)}). Current balance: ₹${(userRow.wallet_balance / 100).toFixed(2)}`,
        balance: userRow.wallet_balance,
        required: TOTAL_PAISE,
      });
    }

    const userCreds = getUserEwbCredentials(billingUser);
    const serial    = `CANEWB-${Date.now()}`;

    try {
      const gspToken = await getGspToken();
      const apiRes   = await callCancelEwb(gspToken, ewbNo, cancelRsnCode, cancelRmrk, userCreds, serial);
      console.log('[CANCEL-EWB] GSP response:', JSON.stringify(apiRes));
      if (apiRes.success === false) {
        const msg = apiRes.message || apiRes.error_description || 'GSP cancellation failed';
        return res.status(400).json({ success: false, error: msg });
      }
    } catch (gspErr) {
      const detail = gspErr.response?.data;
      const msg    = detail?.message || detail?.error_description || gspErr.message;
      console.error('[CANCEL-EWB] GSP error:', msg);
      logGspError(req, 'CANEWB', gspErr, { ewbNo, cancelRsnCode, cancelRmrk }, getGspActionUrl('CANEWB'), null, serial);
      return res.status(400).json({ success: false, error: msg });
    }

    // ── Deduct cancel charge + mark cancelled (atomic) ─────────────────────
    const deductAndCancel = db.transaction(() => {
      let newBalance = userRow.wallet_balance;
      if (!isFree && TOTAL_PAISE > 0) {
        const fresh = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(billingUserId);
        if (fresh.wallet_balance < TOTAL_PAISE) throw new Error('INSUFFICIENT_BALANCE');
        newBalance = fresh.wallet_balance - TOTAL_PAISE;
        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, billingUserId);
      }
      db.prepare(
        `UPDATE ewb_logs SET cancelled = 1, cancel_reason = ?, cancelled_at = CURRENT_TIMESTAMP,
         cancel_charge = ?, cancel_gst_amount = ?, cancel_total_charge = ?
         WHERE ewb_no = ? AND user_id = ?`
      ).run(`[${cancelRsnCode}] ${cancelRmrk}`.trim(), BASE_PAISE, GST_PAISE, TOTAL_PAISE, ewbNo, billingUserId);
      return newBalance;
    });

    const newBalance = deductAndCancel();
    console.log('[CANCEL-EWB] Marked cancelled in DB:', ewbNo, '| charge:', TOTAL_PAISE);

    // ── Generate cancellation invoice PDF ──────────────────────────────────
    let cancelInvoiceFilename = null;
    let cancelInvoiceBase64   = null;
    if (TOTAL_PAISE > 0 || isFree) {
      try {
        const billableUser = db.prepare('SELECT trade_name, gstin, place, state_code FROM users WHERE id = ?').get(billingUserId);
        const cancelInvoiceNo = `CINV-${Date.now()}`;
        const invoiceResult = await generateInvoicePdf({
          invoiceNo:  cancelInvoiceNo,
          ewbNo:      ewbNo,
          tradeName:  billableUser?.trade_name || '',
          gstin:      billableUser?.gstin      || '',
          place:      billableUser?.place      || '',
          stateCode:  billableUser?.state_code || '',
          basePaise:  BASE_PAISE,
          gstRate:    GST_RATE,
          gstPaise:   GST_PAISE,
          totalPaise: TOTAL_PAISE,
          date:       new Date(),
          isFree:     isFree,
          label:      'Cancellation Fee',
        });
        cancelInvoiceFilename = invoiceResult.filename;
        cancelInvoiceBase64   = invoiceResult.base64;
        // Store cancel invoice filename in ewb_logs
        db.prepare('UPDATE ewb_logs SET cancel_invoice_filename = ? WHERE ewb_no = ? AND user_id = ?')
          .run(cancelInvoiceFilename, ewbNo, billingUserId);
      } catch (invErr) {
        console.error('[CANCEL-EWB] Invoice generation failed:', invErr.message);
      }
    }

    res.json({
      success: true, ewbNo, cancelled: true,
      cancelCharge: { base: BASE_PAISE, gst: GST_PAISE, total: TOTAL_PAISE },
      newBalance,
      cancelInvoiceFilename,
      cancelInvoiceBase64,
    });
  } catch (err) {
    console.error('[CANCEL-EWB error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/eway/extend/:ewbNo
// Body: { vehicleNo, fromPlace, fromState, remainingDistance, extnRsnCode, extnRemarks, consignmentStatus, transitType }
export async function extendEwaybill(req, res) {
  const { ewbNo } = req.params;
  const {
    vehicleNo = '', fromPlace = '', fromState = '36',
    remainingDistance = 0, extnRsnCode = 5, extnRemarks = '',
    consignmentStatus = 'M', transitType = 'R',
    addressChanged = false,
  } = req.body;

  try {
    const log = findEwbLog(ewbNo, req.user.id, req.user.role);
    if (!log) return res.status(404).json({ success: false, error: 'E-Waybill not found in your history' });
    if (log.cancelled) return res.status(400).json({ success: false, error: 'Cannot extend a cancelled E-Waybill' });

    const billingUserId = log.user_id;
    const logOwner  = db.prepare('SELECT * FROM users WHERE id = ?').get(billingUserId);
    const userCreds = getUserEwbCredentials(logOwner || req.user);
    const serial    = `EXTVLD-${Date.now()}`;

    // ── Compute extend charge ───────────────────────────────────────────────
    const extUserRow  = db.prepare('SELECT wallet_balance, free_ewb, free_until FROM users WHERE id = ?').get(billingUserId);
    const extIsFree   = !!extUserRow?.extend_free || !!extUserRow?.free_ewb || !!(extUserRow?.free_until && new Date(extUserRow.free_until) > new Date());
    const EXT_BASE    = extIsFree ? 0 : getExtendChargePaise();
    const EXT_GST_PCT = extIsFree ? 0 : getExtendGstRatePct();
    const EXT_GST     = extIsFree ? 0 : Math.round(EXT_BASE * EXT_GST_PCT / 100);
    const EXT_TOTAL   = EXT_BASE + EXT_GST;

    if (!extIsFree && EXT_TOTAL > 0 && extUserRow.wallet_balance < EXT_TOTAL) {
      return res.status(402).json({
        success: false,
        error: `Insufficient wallet balance. Extend validity fee is ₹${(EXT_TOTAL / 100).toFixed(2)} (base ₹${(EXT_BASE / 100).toFixed(2)} + GST ₹${(EXT_GST / 100).toFixed(2)}). Current balance: ₹${(extUserRow.wallet_balance / 100).toFixed(2)}`,
        balance: extUserRow.wallet_balance,
        required: EXT_TOTAL,
      });
    }

    const gspToken  = await getGspToken();

    const payload = {
      ewbNo:             String(ewbNo),
      vehicleNo:         vehicleNo.trim(),
      fromPlace:         fromPlace.trim(),
      fromState:         parseInt(fromState) || 36,
      remainingDistance: parseInt(remainingDistance) || 0,
      extnRsnCode:       parseInt(extnRsnCode) || 5,
      extnRemarks:       extnRemarks.trim() || 'Extension requested',
      consignmentStatus: consignmentStatus || 'M',
      transitType:       transitType || 'R',
      addressChanged:    !!addressChanged,
    };

    const apiRes = await callExtendEwbValidity(gspToken, payload, userCreds, serial);
    console.log('[EXTEND-EWB] GSP response:', JSON.stringify(apiRes));

    if (apiRes.success === false) {
      const msg = apiRes.message || 'GSP extension failed';
      logGspError(req, 'EXTENDVALIDITY', Object.assign(new Error(msg), { response: { data: apiRes } }), payload, null, null, serial);
      return res.status(400).json({ success: false, error: msg });
    }

    // ── Deduct extend charge + update valid_upto (atomic) ──────────────────
    const newValidUpto = apiRes.data?.validUpto || apiRes.validUpto || null;
    const deductAndUpdate = db.transaction(() => {
      let newBalance = extUserRow.wallet_balance;
      if (!extIsFree && EXT_TOTAL > 0) {
        const fresh = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(billingUserId);
        if (fresh.wallet_balance < EXT_TOTAL) throw new Error('INSUFFICIENT_BALANCE');
        newBalance = fresh.wallet_balance - EXT_TOTAL;
        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, billingUserId);
        db.prepare(
          "INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description) VALUES (?, 'debit_extend', ?, ?, ?)"
        ).run(billingUserId, -EXT_TOTAL, newBalance, `Validity extension - EWB ${ewbNo}`);
      }
      if (newValidUpto) {
        db.prepare('UPDATE ewb_logs SET valid_upto = ? WHERE ewb_no = ? AND user_id = ?')
          .run(newValidUpto, ewbNo, billingUserId);
      }
      return newBalance;
    });

    const newBalance = deductAndUpdate();

    res.json({ success: true, ewbNo, validUpto: newValidUpto, balance: newBalance, data: apiRes.data || apiRes });
  } catch (err) {
    console.error('[EXTEND-EWB error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/eway/cancel-manual
// Body: { ewbNo, cancelRsnCode, cancelRmrk }  — cancel by EWB number (not necessarily in history)
export async function cancelEwbManual(req, res) {
  const { ewbNo, cancelRsnCode = 2, cancelRmrk = '' } = req.body;
  if (!ewbNo) return res.status(400).json({ success: false, error: 'EWB number is required' });

  try {
    // Check if already cancelled in our DB
    const log = findEwbLog(String(ewbNo), req.user.id, req.user.role);
    if (log?.cancelled) return res.status(400).json({ success: false, error: 'E-Waybill is already cancelled' });

    // For accountant, need actingGstin to resolve credentials
    let userCreds;
    if (req.user.role === 'accountant') {
      const actingGstin = req.body.actingGstin;
      if (!actingGstin) return res.status(400).json({ success: false, error: 'actingGstin is required for accountant users' });
      const resolved = resolveAccountantAccess(req.user.id, actingGstin.trim().toUpperCase());
      if (!resolved) return res.status(403).json({ success: false, error: 'No approved access to GSTIN ' + actingGstin });
      userCreds = resolved.creds;
    } else {
      userCreds = getUserEwbCredentials(req.user);
    }
    const serial    = `MANCAN-${Date.now()}`;
    const gspToken  = await getGspToken();

    try {
      const apiRes = await callCancelEwb(gspToken, ewbNo, cancelRsnCode, cancelRmrk, userCreds, serial);
      console.log('[MANUAL-CANCEL] GSP response:', JSON.stringify(apiRes));
      if (apiRes.success === false) {
        const msg = apiRes.message || 'GSP cancellation failed';
        logGspError(req, 'CANEWB-MANUAL', Object.assign(new Error(msg), { response: { data: apiRes } }), { ewbNo, cancelRsnCode, cancelRmrk }, null, null, serial);
        return res.status(400).json({ success: false, error: msg });
      }
    } catch (gspErr) {
      const msg = gspErr.response?.data?.message || gspErr.message;
      logGspError(req, 'CANEWB-MANUAL', gspErr, { ewbNo, cancelRsnCode, cancelRmrk }, null, null, serial);
      return res.status(400).json({ success: false, error: msg });
    }

    // If in our logs, mark cancelled
    if (log) {
      db.prepare(
        `UPDATE ewb_logs SET cancelled = 1, cancel_reason = ?, cancelled_at = CURRENT_TIMESTAMP,
         cancel_charge = 0, cancel_gst_amount = 0, cancel_total_charge = 0
         WHERE ewb_no = ? AND user_id = ?`
      ).run(`[${cancelRsnCode}] ${cancelRmrk}`.trim(), String(ewbNo), log.user_id);
    }

    res.json({ success: true, ewbNo: String(ewbNo), cancelled: true });
  } catch (err) {
    console.error('[MANUAL-CANCEL error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/eway/check-duplicate?docNo=...&fromGstin=...&toGstin=...
// Checks if a similar EWB was generated in the last 24 hours
export function checkDuplicate(req, res) {
  try {
    const { docNo, fromGstin, toGstin } = req.query;
    if (!docNo || !fromGstin || !toGstin) {
      return res.status(400).json({ success: false, error: 'docNo, fromGstin, and toGstin are required' });
    }

    const existing = db.prepare(`
      SELECT ewb_no, created_at FROM ewb_logs
      WHERE doc_no = ? AND from_gstin = ? AND to_gstin = ? AND user_id = ?
        AND cancelled = 0
        AND created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC LIMIT 1
    `).get(docNo, fromGstin, toGstin, req.user.id);

    if (existing) {
      return res.json({ success: true, duplicate: true, existingEwbNo: existing.ewb_no, createdAt: existing.created_at });
    }
    res.json({ success: true, duplicate: false });
  } catch (err) {
    console.error('[CHECK-DUPLICATE error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/eway/gstin-search?q=...
// Searches saved GSTINs by partial GSTIN or trade name (for autocomplete)
export function searchGstins(req, res) {
  try {
    const q = (req.query.q || '').trim().toUpperCase();
    if (q.length < 2) return res.json({ success: true, results: [] });

    const like = `${q}%`;
    const nameLike = `%${q}%`;

    const rows = db.prepare(`
      SELECT gstin, trade_name, addr1, addr2, place, pincode, state_code FROM gstin_cache
      WHERE gstin LIKE ? OR UPPER(trade_name) LIKE ?
      UNION
      SELECT gstin, trade_name, addr1, addr2, place, pincode, state_code FROM user_gstins
      WHERE status = 'approved' AND (gstin LIKE ? OR UPPER(trade_name) LIKE ?)
      UNION
      SELECT gstin, trade_name, addr1, addr2, place, pincode, state_code FROM users
      WHERE role = 'user' AND status = 'approved' AND (gstin LIKE ? OR UPPER(trade_name) LIKE ?)
      LIMIT 10
    `).all(like, nameLike, like, nameLike, like, nameLike);

    // Deduplicate by GSTIN
    const seen = new Set();
    const results = rows.filter(r => { if (!r.gstin || seen.has(r.gstin)) return false; seen.add(r.gstin); return true; });

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/eway/product-suggestions?q=<prefix>&field=name|hsn
// Returns distinct recent (product_name, hsn_code) pairs used by this user, filtered by prefix.
// The frontend calls this while the user types in either the Product Name or HSN Code field.
export function getProductSuggestions(req, res) {
  try {
    const q     = (req.query.q || '').trim();
    const field = (req.query.field === 'hsn') ? 'hsn' : 'name';
    const uid   = req.user.id;

    // Effective owner: an accountant sees suggestions of the businesses they act for + their own generations.
    // Simplest: match any ewb_logs where the user is either the owner or the accountant.
    const conds = ['(user_id = ? OR accountant_id = ?)'];
    const args  = [uid, uid];

    if (q.length > 0) {
      if (field === 'hsn') {
        conds.push('hsn_code LIKE ?');
        args.push(q + '%');
      } else {
        conds.push('LOWER(product_name) LIKE ?');
        args.push(q.toLowerCase() + '%');
      }
    }
    // Always exclude blank entries so we don't suggest empty rows
    conds.push("COALESCE(product_name,'') != ''");
    conds.push("COALESCE(hsn_code,'')     != ''");

    const rows = db.prepare(`
      SELECT product_name, hsn_code, qty_unit, MAX(created_at) AS last_used, COUNT(*) AS uses
      FROM   ewb_logs
      WHERE  ${conds.join(' AND ')}
      GROUP  BY LOWER(product_name), hsn_code
      ORDER  BY uses DESC, last_used DESC
      LIMIT  10
    `).all(...args);

    res.json({ success: true, results: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/eway/hsn/:code
// Returns GST rate for an HSN/SAC code with prefix fallback (exact → 6-digit → 4-digit)
export function getHsnRate(req, res) {
  try {
    const raw = req.params.code?.trim().replace(/\D/g, '');
    if (!raw || raw.length < 4) return res.status(400).json({ success: false, error: 'Code must be at least 4 digits' });

    // Try exact match first, then truncated prefixes
    const candidates = [raw];
    if (raw.length > 6) candidates.push(raw.slice(0, 6));
    if (raw.length > 4) candidates.push(raw.slice(0, 4));

    let row = null;
    let matchedCode = null;
    for (const code of candidates) {
      row = db.prepare('SELECT code, description, gst_rate FROM hsn_rates WHERE code = ?').get(code);
      if (row) { matchedCode = code; break; }
    }

    if (!row) return res.status(404).json({ success: false, error: 'HSN/SAC code not found' });
    const approximate = matchedCode !== raw; // true when using a prefix fallback
    res.json({ success: true, code: row.code, description: row.description, gstRate: row.gst_rate, approximate });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/eway/bulk-generate
// Processes up to 50 EWB form rows sequentially, re-using the single generate endpoint
export async function bulkGenerateEwaybill(req, res) {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ success: false, error: 'rows array is required' });
  if (rows.length > 50)
    return res.status(400).json({ success: false, error: 'Maximum 50 rows per bulk request' });

  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const r = await fetch(`${baseUrl}/api/eway/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization,
        },
        body: JSON.stringify(row),
      });
      const d = await r.json();
      results.push({
        index: i,
        docNo: row.docNo || '',
        success: d.success,
        ewbNo: d.ewbNo || '',
        validUpto: d.validUpto || '',
        error: d.error || '',
      });
    } catch (err) {
      results.push({ index: i, docNo: row.docNo || '', success: false, error: err.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  res.json({
    success: true,
    total: rows.length,
    successCount,
    failedCount: rows.length - successCount,
    results,
  });
}
