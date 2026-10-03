import axios from 'axios';
import { randomBytes } from 'crypto';

// Read env at request time (not module init) — ES module imports run before dotenv.config()
const getBase    = () => process.env.GSP_BASE_URL || 'https://gsp.adaequare.com';
const getApiPath = () => (process.env.GSP_MODE === 'production')
  ? '/enriched/ewb/ewayapi'
  : '/test/enriched/ewb/ewayapi';

// Export full GSP URL for a given action (used in error logging)
export const getGspActionUrl = (action) => `${getBase()}${getApiPath()}?action=${action}`;

// Fallback random request id (used only if caller doesn't provide one)
const reqId = () => randomBytes(8).toString('hex');

/**
 * Step 1 – Get Bearer token from Adaequare GSP
 * POST https://gsp.adaequare.com/gsp/authenticate?grant_type=token
 * Headers: gspappid, gspappsecret
 */
export async function getGspToken() {
  const res = await axios.post(
    `${getBase()}/gsp/authenticate?grant_type=token`,
    null,
    {
      headers: {
        gspappid:     process.env.GSP_APP_ID,
        gspappsecret: process.env.GSP_APP_SECRET,
      },
    }
  );
  const token = res.data?.access_token || res.data?.token || res.data?.authToken;
  if (!token) throw new Error(`GSP auth failed: ${JSON.stringify(res.data)}`);
  return token;
}

/**
 * Step 2 – Build NIC-compliant payload (Adaequare enRiched EWB schema)
 */
export function buildEwayPayload(form) {
  const taxable = parseFloat(form.taxableAmount) || 0;
  const cgst    = parseFloat(form.cgstRate)      || 0;
  const sgst    = parseFloat(form.sgstRate)      || 0;
  const igst    = parseFloat(form.igstRate)      || 0;
  const cess    = parseFloat(form.cessRate)      || 0;

  const cgstAmt  = parseFloat(((taxable * cgst)  / 100).toFixed(2));
  const sgstAmt  = parseFloat(((taxable * sgst)  / 100).toFixed(2));
  const igstAmt  = parseFloat(((taxable * igst)  / 100).toFixed(2));
  const cessAmt  = parseFloat(((taxable * cess)  / 100).toFixed(2));
  const totalVal = parseFloat((taxable + cgstAmt + sgstAmt + igstAmt + cessAmt).toFixed(2));

  // NIC API requires date as DD/MM/YYYY
  const fmtDate = (d) => {
    if (!d) return '';
    if (d.includes('/')) return d;
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  // State codes must be zero-padded strings (e.g. "05"), not integers
  const fromState = String(form.fromStateCode || '').padStart(2, '0');
  const toState   = String(form.toStateCode   || '').padStart(2, '0');

  return {
    supplyType:          form.supplyType       || 'O',
    subSupplyType:       String(form.subSupplyType || '1'),
    subSupplyDesc:       form.subSupplyDesc     || '',
    docType:             form.docType           || 'INV',
    docNo:               form.docNo,
    docDate:             fmtDate(form.docDate),

    fromGstin:           form.fromGstin,
    fromTrdName:         form.fromTradeName     || '',
    fromAddr1:           form.fromAddr1         || '',
    fromAddr2:           form.fromAddr2         || '',
    fromPlace:           form.fromPlace         || '',
    fromPincode:         parseInt(form.fromPincode) || 0,
    fromStateCode:       fromState,
    actFromStateCode:    fromState,

    toGstin:             form.toGstin           || 'URP',
    toTrdname:           form.toTradeName        || '',   // lowercase 'n' — NIC field name
    toAddr1:             form.toAddr1            || '',
    toAddr2:             form.toAddr2            || '',
    toPlace:             form.toPlace            || '',
    toPincode:           parseInt(form.toPincode) || 0,
    toStateCode:         toState,
    actToStateCode:      toState,

    totalValue:          taxable,
    cgstValue:           cgstAmt,
    sgstValue:           sgstAmt,
    igstValue:           igstAmt,
    cessValue:           cessAmt,
    totInvValue:         totalVal,
    otherValue:          0,
    cessNonAdvolValue:   0,

    transMode:           String(form.transportMode  || '1'),
    transDistance:       parseInt(form.transDistance) || 0,
    transporterName:     form.transporterName    || null,
    transporterId:       form.transporterId      || null,
    transDocNo:          form.transDocNo         || null,
    transDocDate:        form.transDocDate        || '',
    vehicleNo:           form.vehicleNo          || '',
    vehicleType:         form.vehicleType        || 'R',
    transactionType:     1,                               // lowercase, integer

    itemList: [{
      productName:   form.productName,
      productDesc:   form.productDesc        || form.productName,
      hsnCode:       String(form.hsnCode),               // must be string
      quantity:      parseFloat(form.quantity) || 1,
      qtyUnit:       form.qtyUnit            || 'NOS',
      taxableAmount: taxable,
      cgstRate:      cgst,
      sgstRate:      sgst,
      igstRate:      igst,
      cessRate:      cess,
      cessNonAdvol:  0,                                   // correct field name
    }],
  };
}

/**
 * GetGSTINDetails – Get taxpayer details for a given GSTIN (Master API)
 * GET {BASE}/test/enriched/ewb/master/GetGSTINDetails?GSTIN=<value>
 */
export const getGstinMasterUrl = () =>
  (process.env.GSP_MODE === 'production')
    ? `${getBase()}/enriched/ewb/master/GetGSTINDetails`
    : `${getBase()}/test/enriched/ewb/master/GetGSTINDetails`;

export async function callGstinDetails(token, gstin, creds = {}, requestId = null) {
  const selfGstin = creds.gstin       || process.env.GSTIN;
  const username  = creds.ewbUsername || process.env.GSP_USERNAME;
  const password  = creds.ewbPassword || process.env.GSP_PASSWORD;

  const res = await axios.get(
    `${getGstinMasterUrl()}?GSTIN=${encodeURIComponent(gstin)}`,
    {
      headers: {
        'Content-Type': 'application/json',
        username,
        password,
        gstin:         selfGstin,
        requestid:     requestId || reqId(),
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}

/**
 * GETDISTANCE – Get distance (KM) between two pincodes
 */
export async function callGetDistance(token, fromPincode, toPincode, creds = {}, requestId = null) {
  const selfGstin = creds.gstin       || process.env.GSTIN;
  const username  = creds.ewbUsername || process.env.GSP_USERNAME;
  const password  = creds.ewbPassword || process.env.GSP_PASSWORD;

  const res = await axios.post(
    `${getBase()}${getApiPath()}?action=GETDISTANCE`,
    { fromPincode: parseInt(fromPincode), toPincode: parseInt(toPincode) },
    {
      headers: {
        'Content-Type': 'application/json',
        username,
        password,
        gstin:         selfGstin,
        requestid:     requestId || reqId(),
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}

/**
 * GETEWBDT – Get full EWB details by EWB number (for PDF regeneration)
 */
export async function callGetEwbDetails(token, ewbNo, creds = {}, requestId = null) {
  const selfGstin = creds.gstin       || process.env.GSTIN;
  const username  = creds.ewbUsername || process.env.GSP_USERNAME;
  const password  = creds.ewbPassword || process.env.GSP_PASSWORD;

  const res = await axios.post(
    `${getBase()}${getApiPath()}?action=GETEWBDT`,
    { ewbNo: String(ewbNo) },
    {
      headers: {
        'Content-Type': 'application/json',
        username,
        password,
        gstin:         selfGstin,
        requestid:     requestId || reqId(),
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}

/**
 * CANEWB – Cancel an e-waybill
 * cancelRsnCode: 1=Duplicate, 2=Order Cancelled, 3=Data Entry mistake, 4=Others
 */
export async function callCancelEwb(token, ewbNo, cancelRsnCode, cancelRmrk, creds = {}, requestId = null) {
  const selfGstin = creds.gstin       || process.env.GSTIN;
  const username  = creds.ewbUsername || process.env.GSP_USERNAME;
  const password  = creds.ewbPassword || process.env.GSP_PASSWORD;

  const res = await axios.post(
    `${getBase()}${getApiPath()}?action=CANEWB`,
    { ewbNo: String(ewbNo), cancelRsnCode: parseInt(cancelRsnCode) || 2, cancelRmrk: cancelRmrk || '' },
    {
      headers: {
        'Content-Type': 'application/json',
        username,
        password,
        gstin:         selfGstin,
        requestid:     requestId || reqId(),
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}

/**
 * EXTENDVALIDITY – Extend validity of an e-waybill
 */
export async function callExtendEwbValidity(token, payload, creds = {}, requestId = null) {
  const selfGstin = creds.gstin       || process.env.GSTIN;
  const username  = creds.ewbUsername || process.env.GSP_USERNAME;
  const password  = creds.ewbPassword || process.env.GSP_PASSWORD;

  const res = await axios.post(
    `${getBase()}${getApiPath()}?action=EXTENDVALIDITY`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        username,
        password,
        gstin:         selfGstin,
        requestid:     requestId || reqId(),
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}

/**
 * Step 3 – Call Adaequare sandbox API to generate e-waybill
 * POST {API_PATH}?action=GENEWAYBILL
 */
/**
 * @param creds - { gstin, ewbUsername, ewbPassword } — per-user NIC portal credentials
 */
export async function callGspGenerateEway(token, payload, creds = {}, requestId = null) {
  const gstin    = creds.gstin       || process.env.GSTIN;
  const username = creds.ewbUsername || process.env.GSP_USERNAME;
  const password = creds.ewbPassword || process.env.GSP_PASSWORD;

  const res = await axios.post(
    `${getBase()}${getApiPath()}?action=GENEWAYBILL`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        username,
        password,
        gstin,
        requestid:     requestId || reqId(),
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return res.data;
}
