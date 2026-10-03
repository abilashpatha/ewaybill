import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, ArrowLeft, CheckCircle2, AlertCircle, Loader2, ScanLine, Camera, FolderOpen, X, Truck } from 'lucide-react';
import TransporterManager from './TransporterManager';

// ── HSN localStorage cache (30-day TTL, max 1000 entries) ───────────────────
const HSN_CACHE_KEY = 'ewb_hsn_v1';
const HSN_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function _getHsnStore() {
  try { return JSON.parse(localStorage.getItem(HSN_CACHE_KEY) || '{}'); } catch { return {}; }
}
function _putHsnStore(store) {
  try { localStorage.setItem(HSN_CACHE_KEY, JSON.stringify(store)); } catch {}
}
function getCachedHsn(code) {
  const entry = _getHsnStore()[code];
  if (entry && (Date.now() - entry.ts) < HSN_CACHE_TTL) return entry.data;
  return null;
}
function setCachedHsn(code, data) {
  const store = _getHsnStore();
  store[code] = { data, ts: Date.now() };
  // Evict oldest entries if store grows beyond 1000 codes
  const keys = Object.keys(store);
  if (keys.length > 1000) {
    keys.sort((a, b) => store[a].ts - store[b].ts);
    keys.slice(0, keys.length - 1000).forEach(k => delete store[k]);
  }
  _putHsnStore(store);
}
// ─────────────────────────────────────────────────────────────────────────────

const STATE_CODES = [
  { code: '01', name: 'Jammu and Kashmir' }, { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli' }, { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' }, { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' }, { code: '35', name: 'Andaman & Nicobar' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const todayISO = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  supplyType: 'O', subSupplyType: '1', docType: 'INV',
  docNo: '', docDate: todayISO(),
  fromGstin: '', fromTradeName: '', fromAddr1: '', fromAddr2: '',
  fromPlace: '', fromPincode: '', fromStateCode: '29',
  toGstin: '', toTradeName: '', toAddr1: '', toAddr2: '',
  toPlace: '', toPincode: '', toStateCode: '29',
  productName: '', productDesc: '', hsnCode: '',
  quantity: '', qtyUnit: 'QTL', taxableAmount: '',
  cgstRate: '0', sgstRate: '0', igstRate: '0', cessRate: '0',
  transportMode: '1', transDistance: '', transporterId: '',
  transporterName: '', vehicleNo: '', vehicleType: 'R',
};

function Field({ label, children, required, error }) {
  return (
    <div className="field">
      <label>{label}{required && <span className="req">*</span>}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export default function EwayForm({ prefill, onVerify, onBack, token, ewbCharge = 2000, ewbChargeInfo = null, userGstin = '', userProfile = {}, gstins = [], hideChargeInfo = false, onScanExtracted = null, loading: scanLoading = false, setLoading: setScanLoading = null }) {
  const [form, setForm]     = useState(() => ({ ...EMPTY_FORM, docDate: todayISO(), ...userProfile }));
  const [loading] = useState(false); // kept for compat, no longer used for API call
  const [errors, setErrors]   = useState({});
  // 'idle' | 'loading' | 'ok' | 'cached' | 'error'
  const [gstinStatus, setGstinStatus] = useState({ from: 'idle', to: 'idle' });
  const [gstinError,  setGstinError]  = useState({ from: '',     to: ''     });
  const [distStatus, setDistStatus]   = useState('idle'); // 'idle' | 'loading' | 'ok' | 'fail'
  const [hsnStatus, setHsnStatus]     = useState('idle'); // 'idle' | 'loading' | 'ok' | 'error'
  const [hsnInfo, setHsnInfo]         = useState(null);  // { description, gstRate, approximate }
  const [gstinSugg, setGstinSugg]     = useState({ from: [], to: [] });
  const [showSugg, setShowSugg]       = useState({ from: false, to: false });
  const [productSugg, setProductSugg] = useState([]); // [{ product_name, hsn_code, qty_unit }]
  const [hsnSugg, setHsnSugg]         = useState([]);
  const [showProdSugg, setShowProdSugg] = useState(false);
  const [showHsnSugg, setShowHsnSugg]   = useState(false);

  // ── Inline scan panel ──
  const [showScan, setShowScan]       = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const cameraRef  = useRef();
  const galleryRef = useRef();

  const compressImage = useCallback((dataUrl) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  }), []);

  const handleScanFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const compressed = await compressImage(e.target.result);
      setScanPreview(compressed);
      if (setScanLoading) setScanLoading(true);
      try {
        const res  = await fetch('/api/ocr/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ image: compressed }),
        });
        const data = await res.json();
        if (data.success) {
          setShowScan(false);
          setScanPreview(null);
          if (onScanExtracted) onScanExtracted(data.fields, data.scan_filename || '');
        } else {
          alert('Extraction failed: ' + data.error);
        }
      } catch (err) {
        alert('Server error: ' + err.message);
      } finally {
        if (setScanLoading) setScanLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }, [token, onScanExtracted, compressImage, setScanLoading]);
  const [selectedGstinId, setSelectedGstinId] = useState('');
  const formRef = useRef(null);

  // ── Templates ──
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ewb_templates') || '[]'); } catch { return []; }
  });
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showTransporterMgr, setShowTransporterMgr] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    // Exclude per-trip fields
    const { docNo, docDate, vehicleNo, ...templateData } = form;
    const entry = { name, data: templateData, savedAt: new Date().toISOString() };
    const updated = [entry, ...templates.filter(t => t.name !== name)].slice(0, 5);
    setTemplates(updated);
    localStorage.setItem('ewb_templates', JSON.stringify(updated));
    setShowSaveTemplate(false);
    setTemplateName('');
  };

  const loadTemplate = (idx) => {
    if (idx === '') return;
    const tmpl = templates[Number(idx)];
    if (!tmpl) return;
    setForm(prev => ({
      ...prev,
      ...tmpl.data,
      docNo: '', docDate: todayISO(), vehicleNo: '',
    }));
    // Trigger GSTIN status for loaded values
    if (tmpl.data.fromGstin && GSTIN_RE.test(tmpl.data.fromGstin)) {
      if (tmpl.data.fromGstin === userGstin) setGstinStatus(prev => ({ ...prev, from: 'ok' }));
      else fetchGstinDetails(tmpl.data.fromGstin, 'from');
    }
    if (tmpl.data.toGstin && GSTIN_RE.test(tmpl.data.toGstin)) {
      fetchGstinDetails(tmpl.data.toGstin, 'to');
    }
  };

  const deleteTemplate = (idx) => {
    const updated = templates.filter((_, i) => i !== idx);
    setTemplates(updated);
    localStorage.setItem('ewb_templates', JSON.stringify(updated));
  };
  const [draftBanner, setDraftBanner] = useState(false);
  const [draftSaved, setDraftSaved]   = useState(false);
  const [gstinWarn, setGstinWarn]     = useState({ from: '', to: '' });

  // ── Draft restore on mount ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ewb_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only show banner if saved draft has meaningful data beyond defaults
        if (parsed && parsed.docNo) setDraftBanner(true);
      }
    } catch {}
  }, []);

  const restoreDraft = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('ewb_draft'));
      if (saved) setForm(prev => ({ ...prev, ...saved }));
    } catch {}
    setDraftBanner(false);
  };

  const discardDraft = () => {
    localStorage.removeItem('ewb_draft');
    setDraftBanner(false);
  };

  // ── Auto-save form to localStorage (debounced 2s) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('ewb_draft', JSON.stringify(form));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 1500);
      } catch {}
    }, 2000);
    return () => clearTimeout(timer);
  }, [form]);

  // ── GSTIN prefix → state code auto-match ──
  useEffect(() => {
    const prefix = form.fromGstin?.slice(0, 2);
    if (prefix && /^[0-9]{2}$/.test(prefix) && form.fromGstin.length >= 2) {
      const match = STATE_CODES.find(s => s.code === prefix);
      if (match) {
        if (form.fromStateCode !== prefix) {
          setForm(prev => ({ ...prev, fromStateCode: prefix }));
        }
        setGstinWarn(prev => ({ ...prev, from: '' }));
      } else {
        setGstinWarn(prev => ({ ...prev, from: `GSTIN state code (${prefix}) doesn't match any known state` }));
      }
    } else {
      setGstinWarn(prev => ({ ...prev, from: '' }));
    }
  }, [form.fromGstin]);

  useEffect(() => {
    const prefix = form.toGstin?.slice(0, 2);
    if (prefix && /^[0-9]{2}$/.test(prefix) && form.toGstin.length >= 2 && form.toGstin !== 'URP') {
      const match = STATE_CODES.find(s => s.code === prefix);
      if (match) {
        if (form.toStateCode !== prefix) {
          setForm(prev => ({ ...prev, toStateCode: prefix }));
        }
        setGstinWarn(prev => ({ ...prev, to: '' }));
      } else {
        setGstinWarn(prev => ({ ...prev, to: `GSTIN state code (${prefix}) doesn't match any known state` }));
      }
    } else {
      setGstinWarn(prev => ({ ...prev, to: '' }));
    }
  }, [form.toGstin]);

  // Apply user's own "from" profile whenever it arrives (e.g. after first login)
  useEffect(() => {
    if (!userProfile || !userProfile.fromGstin) return;
    setForm(prev => ({ ...prev, ...userProfile }));
    setGstinStatus(prev => ({ ...prev, from: 'ok' }));
  }, [userProfile.fromGstin]);

  useEffect(() => {
    if (!prefill) return;

    const normalized = { ...prefill };

    // Robustly parse docDate from any OCR format → YYYY-MM-DD.
    // Fallback to today if missing or unparseable.
    const parseDate = (str) => {
      if (!str) return '';
      // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      let m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      // YYYY-MM-DD or YYYY/MM/DD
      m = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
      if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
      return '';
    };
    const parsed = parseDate(normalized.docDate);
    normalized.docDate = parsed || todayISO();

    // Normalise vehicle number from OCR → standard format e.g. TS29WB2222
    if (normalized.vehicleNo) {
      // 1. Strip spaces, hyphens, dots, underscores
      let vn = normalized.vehicleNo.replace(/[\s\-._]/g, '').toUpperCase();
      // 2. Fix common OCR confusions in each position:
      //    Positions 0-1 (state code)  : must be letters  — fix 0→O, 1→I
      //    Positions 2-3 (district)    : must be digits   — fix O→0, I→1, S→5, B→8, Z→2, G→6
      //    Positions 4-6 (series)      : must be letters  — fix 0→O, 1→I
      //    Last 4 chars (reg number)   : must be digits   — fix O→0, I→1, S→5, B→8, Z→2, G→6
      const toDigit  = (c) => ({ O:'0', I:'1', S:'5', B:'8', Z:'2', G:'6', Q:'0' }[c] ?? c);
      const toLetter = (c) => ({ '0':'O', '1':'I' }[c] ?? c);
      // Attempt correction only if length is between 8-10 (valid VN length)
      if (vn.length >= 8 && vn.length <= 10) {
        const chars = vn.split('');
        // State code (0,1) → letters
        chars[0] = toLetter(chars[0]);
        chars[1] = toLetter(chars[1]);
        // District code (2,3) → digits
        chars[2] = toDigit(chars[2]);
        chars[3] = toDigit(chars[3]);
        // Series letters (4 to len-4) → letters
        for (let i = 4; i < chars.length - 4; i++) chars[i] = toLetter(chars[i]);
        // Registration number (last 4) → digits
        for (let i = chars.length - 4; i < chars.length; i++) chars[i] = toDigit(chars[i]);
        vn = chars.join('');
      }
      normalized.vehicleNo = vn;
    }

    // 1. Apply OCR-extracted values to form
    setForm(prev => ({
      ...prev,
      ...Object.fromEntries(Object.entries(normalized).filter(([, v]) => v !== '')),
    }));

    // 2. For valid GSTINs in the prefill, auto-fetch entity details.
    // Skip API for fromGstin if it matches the user's own GSTIN — details already in profile.
    if (prefill.fromGstin && GSTIN_RE.test(prefill.fromGstin)) {
      if (prefill.fromGstin === userGstin) {
        setGstinStatus(prev => ({ ...prev, from: 'ok' }));
      } else {
        fetchGstinDetails(prefill.fromGstin, 'from');
      }
    }
    if (prefill.toGstin && GSTIN_RE.test(prefill.toGstin)) {
      fetchGstinDetails(prefill.toGstin, 'to');
    }
  }, [prefill]);

  /* ── Auto-fetch GSTIN details ── */
  const fetchGstinDetails = async (gstin, side) => {
    setGstinStatus(prev => ({ ...prev, [side]: 'loading' }));
    setGstinError(prev => ({ ...prev, [side]: '' }));
    try {
      const res = await fetch(`/api/eway/gstin/${gstin}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (d.success && d.data) {
        const p = side === 'from' ? 'from' : 'to';
        setForm(prev => ({
          ...prev,
          [`${p}TradeName`]: d.data.tradeName || prev[`${p}TradeName`],
          [`${p}Addr1`]:     d.data.addr1     || prev[`${p}Addr1`],
          [`${p}Addr2`]:     d.data.addr2     || prev[`${p}Addr2`],
          [`${p}Place`]:     d.data.place     || prev[`${p}Place`],
          [`${p}Pincode`]:   d.data.pincode   || prev[`${p}Pincode`],
          [`${p}StateCode`]: d.data.stateCode || prev[`${p}StateCode`],
        }));
        setGstinStatus(prev => ({ ...prev, [side]: d.cached ? 'cached' : 'ok' }));
      } else {
        setGstinStatus(prev => ({ ...prev, [side]: 'error' }));
        setGstinError(prev => ({ ...prev, [side]: d.error || 'GSTIN not found' }));
      }
    } catch (e) {
      setGstinStatus(prev => ({ ...prev, [side]: 'error' }));
      setGstinError(prev => ({ ...prev, [side]: e.message || 'Network error' }));
    }
  };

  /* ── Auto-swap tax rates when intra/inter state changes ── */
  useEffect(() => {
    const from = form.fromStateCode;
    const to   = form.toStateCode;
    if (!from || !to) return;

    const intra = from === to;
    const cgst  = parseFloat(form.cgstRate)  || 0;
    const sgst  = parseFloat(form.sgstRate)  || 0;
    const igst  = parseFloat(form.igstRate)  || 0;

    if (intra && igst > 0) {
      // Switching to intra-state: split IGST into CGST + SGST
      const half = parseFloat((igst / 2).toFixed(2));
      setForm(prev => ({ ...prev, cgstRate: String(half), sgstRate: String(half), igstRate: '0' }));
    } else if (!intra && (cgst > 0 || sgst > 0)) {
      // Switching to inter-state: combine CGST + SGST into IGST
      const combined = parseFloat((cgst + sgst).toFixed(2));
      setForm(prev => ({ ...prev, igstRate: String(combined), cgstRate: '0', sgstRate: '0' }));
    }
  }, [form.fromStateCode, form.toStateCode]);

  /* ── Auto-fetch distance when pincodes or transport mode changes (debounced 800ms) ── */
  useEffect(() => {
    const fp = form.fromPincode, tp = form.toPincode, mode = form.transportMode;
    if (!/^[0-9]{6}$/.test(fp) || !/^[0-9]{6}$/.test(tp)) return;

    setDistStatus('loading');
    let cancelled = false;

    const timer = setTimeout(() => {
      fetch(`/api/eway/distance?from=${fp}&to=${tp}&mode=${mode}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          if (d.success && d.distance > 0) {
            setForm(prev => ({ ...prev, transDistance: String(d.distance) }));
            setDistStatus('ok');
          } else {
            setDistStatus('fail');
          }
        })
        .catch(() => { if (!cancelled) setDistStatus('fail'); });
    }, 800);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.fromPincode, form.toPincode, form.transportMode]);

  /* ── GSTIN autocomplete suggestions (debounced 300ms, 2+ chars, not full GSTIN) ── */
  useEffect(() => {
    const val = form.fromGstin?.trim();
    if (!val || val.length < 2 || val.length >= 15) { setGstinSugg(p => ({ ...p, from: [] })); return; }
    const timer = setTimeout(() => {
      fetch(`/api/eway/gstin-search?q=${encodeURIComponent(val)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (d.success) setGstinSugg(p => ({ ...p, from: d.results })); }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [form.fromGstin]);

  useEffect(() => {
    const val = form.toGstin?.trim();
    if (!val || val.length < 2 || val.length >= 15) { setGstinSugg(p => ({ ...p, to: [] })); return; }
    const timer = setTimeout(() => {
      fetch(`/api/eway/gstin-search?q=${encodeURIComponent(val)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (d.success) setGstinSugg(p => ({ ...p, to: d.results })); }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [form.toGstin]);

  const selectGstinSugg = (side, item) => {
    const p = side;
    setForm(prev => ({
      ...prev,
      [`${p}Gstin`]:      item.gstin,
      [`${p}TradeName`]:  item.trade_name || '',
      [`${p}Addr1`]:      item.addr1 || '',
      [`${p}Addr2`]:      item.addr2 || '',
      [`${p}Place`]:      item.place || '',
      [`${p}Pincode`]:    item.pincode || '',
      [`${p}StateCode`]:  item.state_code || prev[`${p}StateCode`],
    }));
    setGstinStatus(prev => ({ ...prev, [side]: 'ok' }));
    setGstinSugg(prev => ({ ...prev, [side]: [] }));
    setShowSugg(prev => ({ ...prev, [side]: false }));
  };

  /* ── Auto-fetch HSN rate when hsnCode changes (debounced 600ms, needs 4+ digits) ── */
  useEffect(() => {
    const code = form.hsnCode?.trim().replace(/\D/g, '');
    if (!code || code.length < 4) {
      setHsnStatus('idle');
      setHsnInfo(null);
      return;
    }

    // ── Check localStorage cache first ──
    const cached = getCachedHsn(code);
    if (cached) {
      setHsnInfo(cached);
      setHsnStatus('ok');
      setForm(prev => {
        const intra = prev.fromStateCode && prev.toStateCode && prev.fromStateCode === prev.toStateCode;
        const half  = parseFloat((cached.gstRate / 2).toFixed(2));
        return intra
          ? { ...prev, cgstRate: String(half), sgstRate: String(half), igstRate: '0' }
          : { ...prev, igstRate: String(cached.gstRate), cgstRate: '0', sgstRate: '0' };
      });
      return () => {};
    }

    setHsnStatus('loading');
    let cancelled = false;

    const timer = setTimeout(() => {
      fetch(`/api/eway/hsn/${code}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          if (d.success) {
            const info = { description: d.description, gstRate: d.gstRate, approximate: d.approximate, matchedCode: d.code };
            setCachedHsn(code, info); // store in localStorage
            setHsnInfo(info);
            setHsnStatus('ok');
            // Use functional updater so we always read latest fromStateCode/toStateCode
            setForm(prev => {
              const intra = prev.fromStateCode && prev.toStateCode && prev.fromStateCode === prev.toStateCode;
              const rate  = d.gstRate;
              const half  = parseFloat((rate / 2).toFixed(2));
              return intra
                ? { ...prev, cgstRate: String(half), sgstRate: String(half), igstRate: '0' }
                : { ...prev, igstRate: String(rate),  cgstRate: '0',          sgstRate: '0' };
            });
          } else {
            setHsnStatus('error');
            setHsnInfo(null);
          }
        })
        .catch(() => { if (!cancelled) { setHsnStatus('error'); setHsnInfo(null); } });
    }, 600);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.hsnCode]);

  /* ── Product name / HSN autocomplete from user's own recent generations (debounced) ── */
  useEffect(() => {
    let cancelled = false;
    const q = (form.productName || '').trim();
    // Show top 10 recent even when field is empty and focused
    if (!showProdSugg) { setProductSugg([]); return () => {}; }
    const timer = setTimeout(() => {
      fetch(`/api/eway/product-suggestions?field=name&q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(d => { if (!cancelled && d.success) setProductSugg(d.results || []); })
        .catch(() => {});
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.productName, showProdSugg, token]);

  useEffect(() => {
    let cancelled = false;
    const q = (form.hsnCode || '').trim();
    if (!showHsnSugg) { setHsnSugg([]); return () => {}; }
    const timer = setTimeout(() => {
      fetch(`/api/eway/product-suggestions?field=hsn&q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(d => { if (!cancelled && d.success) setHsnSugg(d.results || []); })
        .catch(() => {});
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.hsnCode, showHsnSugg, token]);

  const pickProductSugg = (item) => {
    setForm(prev => ({
      ...prev,
      productName: item.product_name || prev.productName,
      hsnCode:     item.hsn_code     || prev.hsnCode,
      qtyUnit:     item.qty_unit     || prev.qtyUnit,
    }));
    setShowProdSugg(false);
    setShowHsnSugg(false);
  };

  const set = (key) => (e) => {
    let val = key === 'fromGstin' || key === 'toGstin' || key === 'vehicleNo'
      ? e.target.value.toUpperCase()
      : e.target.value;
    // Strip spaces and hyphens from vehicle number as user types
    if (key === 'vehicleNo') val = val.replace(/[\s\-._]/g, '');
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  /* ── GSTIN fields get special handler that triggers auto-fill ── */
  const setGstin = (side) => (e) => {
    const val = e.target.value.toUpperCase();
    const key = side === 'from' ? 'fromGstin' : 'toGstin';
    const p   = side === 'from' ? 'from' : 'to';
    // Clear all dependent fields whenever the GSTIN changes
    setForm(prev => ({
      ...prev,
      [key]:               val,
      [`${p}TradeName`]:   '',
      [`${p}Addr1`]:       '',
      [`${p}Addr2`]:       '',
      [`${p}Place`]:       '',
      [`${p}Pincode`]:     '',
      [`${p}StateCode`]:   '',
    }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
    setGstinStatus(prev => ({ ...prev, [side]: 'idle' }));
    if (val.length === 15 && GSTIN_RE.test(val)) {
      // For user's own GSTIN on the from-side, skip API — use stored profile details
      if (side === 'from' && val === userGstin) {
        setGstinStatus(prev => ({ ...prev, from: 'ok' }));
      } else {
        fetchGstinDetails(val, side);
      }
    }
  };

  const handleGstinSelect = (gstinId) => {
    const selected = gstins.find(g => String(g.id) === String(gstinId));
    if (!selected) return;
    setForm(f => ({
      ...f,
      fromGstin: selected.gstin,
      fromTradeName: selected.trade_name || '',
      fromAddr1: selected.addr1 || '',
      fromAddr2: selected.addr2 || '',
      fromPlace: selected.place || '',
      fromPincode: selected.pincode || '',
      fromStateCode: selected.state_code || '29',
    }));
    setGstinStatus(s => ({ ...s, from: 'idle' }));
  };

  const validate = () => {
    const e = {};

    // Document
    if (!form.docNo.trim()) e.docNo = 'Required';
    else if (!/^[A-Za-z0-9\-/]{1,16}$/.test(form.docNo.trim())) e.docNo = 'Max 16 alphanumeric chars (- and / allowed)';

    if (!form.docDate) {
      e.docDate = 'Required';
    } else {
      const d = new Date(form.docDate);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      if (d > endOfDay) e.docDate = 'Cannot be a future date';
      else if (d < today) e.docDate = 'Document date cannot be less than today';
    }

    // From
    if (!form.fromGstin.trim()) e.fromGstin = 'Required';
    else if (!GSTIN_RE.test(form.fromGstin.trim())) e.fromGstin = 'Invalid GSTIN (e.g. 29AAAAA0000A1Z5)';
    if (!form.fromTradeName.trim()) e.fromTradeName = 'Required';
    if (!form.fromAddr1.trim()) e.fromAddr1 = 'Required';
    if (!form.fromPlace.trim()) e.fromPlace = 'Required';
    if (!form.fromPincode) e.fromPincode = 'Required';
    else if (!/^[0-9]{6}$/.test(form.fromPincode)) e.fromPincode = 'Must be 6 digits';

    // To
    const toGstin = form.toGstin.trim();
    if (toGstin && toGstin !== 'URP' && !GSTIN_RE.test(toGstin)) e.toGstin = 'Invalid GSTIN format (or use URP)';
    if (!form.toTradeName.trim()) e.toTradeName = 'Required';
    if (!form.toAddr1.trim()) e.toAddr1 = 'Required';
    if (!form.toPlace.trim()) e.toPlace = 'Required';
    if (!form.toPincode) e.toPincode = 'Required';
    else if (!/^[0-9]{6}$/.test(form.toPincode)) e.toPincode = 'Must be 6 digits';

    // Item
    if (!form.productName.trim()) e.productName = 'Required';
    if (!form.hsnCode.trim()) e.hsnCode = 'Required';
    else if (!/^[0-9]{4,8}$/.test(form.hsnCode.trim())) e.hsnCode = 'Must be 4–8 numeric digits';
    if (!form.quantity || parseFloat(form.quantity) <= 0) e.quantity = 'Must be greater than 0';
    if (!form.taxableAmount || parseFloat(form.taxableAmount) <= 0) e.taxableAmount = 'Must be greater than 0';

    // Tax: intra vs inter state
    const intra = form.fromStateCode === form.toStateCode;
    if (intra && parseFloat(form.igstRate) > 0) e.igstRate = 'IGST must be 0 for intra-state supply';
    if (!intra && (parseFloat(form.cgstRate) > 0 || parseFloat(form.sgstRate) > 0)) {
      e.cgstRate = 'CGST must be 0 for inter-state supply';
      e.sgstRate = 'SGST must be 0 for inter-state supply';
    }

    // Transport
    if (form.transDistance) {
      const dist = parseInt(form.transDistance);
      if (isNaN(dist) || dist < 1 || dist > 4000) e.transDistance = 'Distance must be 1–4000 KM';
    }
    if (form.vehicleNo) {
      const vn = form.vehicleNo.replace(/\s/g, '');
      if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/.test(vn)) e.vehicleNo = 'Format: KA01AB1234';
    }

    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      // Scroll to first error
      setTimeout(() => {
        const firstErr = formRef.current?.querySelector('.field-error');
        firstErr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    // Clear draft on successful submission
    localStorage.removeItem('ewb_draft');
    // Pass validated form data to verify/confirmation screen
    onVerify(form);
  };

  const reset = () => {
    // Keep logged-in user's "from" details; clear everything else
    setForm({ ...EMPTY_FORM, docDate: todayISO(), ...userProfile });
    setErrors({});
    setGstinStatus({ from: userProfile.fromGstin ? 'ok' : 'idle', to: 'idle' });
    setDistStatus('idle');
  };

  return (
    <form className="eway-form" onSubmit={handleSubmit} ref={formRef} noValidate>
      {/* Hidden file inputs for scan */}
      {onScanExtracted && <>
        <input ref={cameraRef}  type="file" accept="image/*" capture="environment" hidden onChange={e => handleScanFile(e.target.files[0])} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={e => handleScanFile(e.target.files[0])} />
      </>}

      <div className="form-top-bar">
        {onBack && (
          <button type="button" className="back-btn" onClick={() => onBack(form)}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <h2 className="section-title"><FileText size={20} /> E-Waybill Details</h2>
        {draftSaved && <span className="draft-saved-indicator">Draft saved</span>}
        {onScanExtracted && (
          <button type="button" className="scan-autofill-btn" onClick={() => setShowScan(p => !p)}>
            <ScanLine size={15} /> Scan to auto-fill
          </button>
        )}
      </div>

      {/* Inline scan panel */}
      {onScanExtracted && showScan && (
        <div className="scan-panel">
          {scanLoading ? (
            <div className="scan-panel-loading">
              <Loader2 size={28} className="spin" />
              <span>Scanning & extracting fields…</span>
            </div>
          ) : scanPreview ? (
            <div className="scan-preview-wrap">
              <img src={scanPreview} alt="Scan preview" className="scan-preview-img" />
              <button type="button" className="scan-clear-btn" onClick={() => { setScanPreview(null); if (cameraRef.current) cameraRef.current.value=''; if (galleryRef.current) galleryRef.current.value=''; }}>
                <X size={14} /> Clear
              </button>
            </div>
          ) : (
            <div className="scan-panel-body">
              <p className="scan-panel-hint">Take a photo or upload an image of your waybill — fields will be auto-filled</p>
              <div className="scan-btn-row">
                <button type="button" className="upload-choice-btn" onClick={() => cameraRef.current?.click()}>
                  <Camera size={18} /> Camera
                </button>
                <button type="button" className="upload-choice-btn" onClick={() => galleryRef.current?.click()}>
                  <FolderOpen size={18} /> Gallery / File
                </button>
                <button type="button" className="upload-choice-btn" style={{ background: '#f1f5f9', color: '#64748b' }} onClick={() => setShowScan(false)}>
                  <X size={16} /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Load Template dropdown */}
      {templates.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Load Template:</label>
          <select
            defaultValue=""
            onChange={e => { loadTemplate(e.target.value); e.target.value = ''; }}
            style={{
              flex: '1 1 auto', padding: '7px 10px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#1e293b',
              outline: 'none', cursor: 'pointer', appearance: 'auto', minWidth: 120,
            }}
          >
            <option value="">Select a template…</option>
            {templates.map((t, i) => (
              <option key={i} value={i}>{t.name}</option>
            ))}
          </select>
          {templates.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete all saved templates?')) {
                  setTemplates([]);
                  localStorage.removeItem('ewb_templates');
                }
              }}
              style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {draftBanner && (
        <div className="draft-banner">
          <span>Draft found from earlier session</span>
          <div className="draft-banner-actions">
            <button type="button" className="btn-sm btn-primary" onClick={restoreDraft}>Restore</button>
            <button type="button" className="btn-sm btn-secondary" onClick={discardDraft}>Discard</button>
          </div>
        </div>
      )}

      {/* GSTIN Selector — shown only when user has multiple approved GSTINs */}
      {gstins.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 14px', background: '#eff6ff', borderRadius: '8px',
          border: '1px solid #bfdbfe', marginBottom: '8px', flexWrap: 'wrap',
        }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#1e40af', whiteSpace: 'nowrap' }}>
            From GSTIN:
          </label>
          <select
            value={selectedGstinId}
            onChange={e => { setSelectedGstinId(e.target.value); handleGstinSelect(e.target.value); }}
            style={{
              flex: '1 1 auto', padding: '7px 10px', borderRadius: '8px', fontSize: '13px',
              border: '1.5px solid #bfdbfe', background: '#fff', color: '#1e293b',
              outline: 'none', cursor: 'pointer', minWidth: 120,
            }}
          >
            <option value="">-- Select GSTIN --</option>
            {gstins.map(g => (
              <option key={g.id} value={g.id}>
                {g.gstin}{g.trade_name ? ` — ${g.trade_name}` : ''}{g.is_primary ? ' \u2605' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Transaction Info */}
      <div className="form-section">
        <h3>Transaction</h3>
        <div className="grid-2">
          <Field label="Supply Type" required>
            <select value={form.supplyType} onChange={set('supplyType')}>
              <option value="O">Outward</option>
              <option value="I">Inward</option>
            </select>
          </Field>
          <Field label="Sub Type" required>
            <select value={form.subSupplyType} onChange={set('subSupplyType')}>
              <option value="1">Supply</option>
              <option value="2">Import</option>
              <option value="3">Export</option>
              <option value="4">Job Work</option>
              <option value="5">For Own Use</option>
              <option value="6">Job Work Returns</option>
              <option value="7">Sales Return</option>
              <option value="8">Others</option>
            </select>
          </Field>
          <Field label="Document Type" required>
            <select value={form.docType} onChange={set('docType')}>
              <option value="INV">Tax Invoice</option>
              <option value="BIL">Bill of Supply</option>
              <option value="BOE">Bill of Entry</option>
              <option value="CHL">Delivery Challan</option>
              <option value="OTH">Others</option>
            </select>
          </Field>
          <Field label="Document No." required error={errors.docNo}>
            <input value={form.docNo} onChange={set('docNo')} placeholder="INV-2024-001" maxLength={16} />
          </Field>
          <Field label="Document Date" required error={errors.docDate}>
            <input type="date" value={form.docDate} onChange={set('docDate')} min={todayISO()} />
          </Field>
        </div>
      </div>

      {/* From Party */}
      <div className="form-section">
        <h3>From (Supplier)</h3>
        <div className="grid-2">
          <Field label="GSTIN" required error={errors.fromGstin}>
            <div className="gstin-wrap" style={{ position: 'relative' }}>
              <input value={form.fromGstin} onChange={setGstin('from')} placeholder="29AAAAA0000A1Z5" maxLength={15} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                onFocus={() => setShowSugg(p => ({ ...p, from: true }))}
                onBlur={() => setTimeout(() => setShowSugg(p => ({ ...p, from: false })), 150)}
              />
              {gstinStatus.from === 'loading' && <span className="gstin-badge loading"><Loader2 size={12} className="spin" /> Looking up…</span>}
              {gstinStatus.from === 'ok'      && <span className="gstin-badge ok"><CheckCircle2 size={12} /> Auto-filled</span>}
              {gstinStatus.from === 'cached'  && <span className="gstin-badge cached">⚡ From local cache</span>}
              {gstinStatus.from === 'error'   && <span className="gstin-badge err" title={gstinError.from}><AlertCircle size={12} /> {gstinError.from && /nic credentials/i.test(gstinError.from) ? 'NIC creds needed' : 'Not found'}</span>}
              {showSugg.from && gstinSugg.from.length > 0 && (
                <ul className="gstin-suggestions">
                  {gstinSugg.from.map(item => (
                    <li key={item.gstin} onMouseDown={() => selectGstinSugg('from', item)}>
                      <span className="sugg-gstin">{item.gstin}</span>
                      <span className="sugg-name">{item.trade_name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
          <Field label="Trade Name" required error={errors.fromTradeName}>
            <input value={form.fromTradeName} onChange={set('fromTradeName')} placeholder="Business name" />
          </Field>
          <Field label="Address Line 1" required error={errors.fromAddr1}>
            <input value={form.fromAddr1} onChange={set('fromAddr1')} placeholder="Street / Building" />
          </Field>
          <Field label="Address Line 2">
            <input value={form.fromAddr2} onChange={set('fromAddr2')} placeholder="Area / Locality" />
          </Field>
          <Field label="City/Place" required error={errors.fromPlace}>
            <input value={form.fromPlace} onChange={set('fromPlace')} placeholder="City" />
          </Field>
          <Field label="Pincode" required error={errors.fromPincode}>
            <input value={form.fromPincode} onChange={set('fromPincode')} placeholder="6-digit PIN" maxLength={6} />
          </Field>
          <Field label="State" required>
            <select value={form.fromStateCode} onChange={set('fromStateCode')}>
              {STATE_CODES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        {gstinWarn.from && <p className="gstin-state-warn">{gstinWarn.from}</p>}
        {gstinError.from && /nic credentials/i.test(gstinError.from) && (
          <p className="gstin-state-warn" style={{ color: '#b91c1c' }}>⚠ {gstinError.from}</p>
        )}
      </div>

      {/* To Party */}
      <div className="form-section">
        <h3>To (Recipient)</h3>
        <div className="grid-2">
          <Field label="GSTIN (or URP)" error={errors.toGstin}>
            <div className="gstin-wrap" style={{ position: 'relative' }}>
              <input value={form.toGstin} onChange={setGstin('to')} placeholder="15-char GSTIN or URP" maxLength={15} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                onFocus={() => setShowSugg(p => ({ ...p, to: true }))}
                onBlur={() => setTimeout(() => setShowSugg(p => ({ ...p, to: false })), 150)}
              />
              {gstinStatus.to === 'loading' && <span className="gstin-badge loading"><Loader2 size={12} className="spin" /> Looking up…</span>}
              {gstinStatus.to === 'ok'      && <span className="gstin-badge ok"><CheckCircle2 size={12} /> Auto-filled</span>}
              {gstinStatus.to === 'cached'  && <span className="gstin-badge cached">⚡ From local cache</span>}
              {gstinStatus.to === 'error'   && <span className="gstin-badge err" title={gstinError.to}><AlertCircle size={12} /> {gstinError.to && /nic credentials/i.test(gstinError.to) ? 'NIC creds needed' : 'Not found'}</span>}
              {showSugg.to && gstinSugg.to.length > 0 && (
                <ul className="gstin-suggestions">
                  {gstinSugg.to.map(item => (
                    <li key={item.gstin} onMouseDown={() => selectGstinSugg('to', item)}>
                      <span className="sugg-gstin">{item.gstin}</span>
                      <span className="sugg-name">{item.trade_name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
          <Field label="Trade Name" required error={errors.toTradeName}>
            <input value={form.toTradeName} onChange={set('toTradeName')} placeholder="Business name" />
          </Field>
          <Field label="Address Line 1" required error={errors.toAddr1}>
            <input value={form.toAddr1} onChange={set('toAddr1')} placeholder="Street / Building" />
          </Field>
          <Field label="Address Line 2">
            <input value={form.toAddr2} onChange={set('toAddr2')} placeholder="Area / Locality" />
          </Field>
          <Field label="City/Place" required error={errors.toPlace}>
            <input value={form.toPlace} onChange={set('toPlace')} placeholder="City" />
          </Field>
          <Field label="Pincode" required error={errors.toPincode}>
            <input value={form.toPincode} onChange={set('toPincode')} placeholder="6-digit PIN" maxLength={6} />
          </Field>
          <Field label="State" required>
            <select value={form.toStateCode} onChange={set('toStateCode')}>
              {STATE_CODES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        {gstinWarn.to && <p className="gstin-state-warn">{gstinWarn.to}</p>}
      </div>

      {/* Item Details */}
      <div className="form-section">
        <h3>Item Details</h3>
        <div className="grid-2">
          <Field label="Product Name" required error={errors.productName}>
            <div className="gstin-wrap" style={{ position: 'relative' }}>
              <input value={form.productName}
                onChange={set('productName')}
                placeholder="Product name"
                onFocus={() => setShowProdSugg(true)}
                onBlur={() => setTimeout(() => setShowProdSugg(false), 150)}
              />
              {showProdSugg && productSugg.length > 0 && (
                <ul className="gstin-suggestions">
                  {productSugg.map((item, i) => (
                    <li key={i} onMouseDown={() => pickProductSugg(item)}>
                      <span className="sugg-name">{item.product_name}</span>
                      <span className="sugg-gstin">HSN {item.hsn_code}{item.qty_unit ? ` · ${item.qty_unit}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
          <Field label="Description">
            <input value={form.productDesc} onChange={set('productDesc')} placeholder="Description" />
          </Field>
          <Field label="HSN/SAC Code" required error={errors.hsnCode}>
            <div className="gstin-wrap" style={{ position: 'relative' }}>
              <input value={form.hsnCode}
                onChange={set('hsnCode')}
                placeholder="e.g. 851712 (4–8 digits)"
                maxLength={8}
                onFocus={() => setShowHsnSugg(true)}
                onBlur={() => setTimeout(() => setShowHsnSugg(false), 150)}
              />
              {showHsnSugg && hsnSugg.length > 0 && (
                <ul className="gstin-suggestions">
                  {hsnSugg.map((item, i) => (
                    <li key={i} onMouseDown={() => pickProductSugg(item)}>
                      <span className="sugg-gstin">{item.hsn_code}</span>
                      <span className="sugg-name">{item.product_name}{item.qty_unit ? ` · ${item.qty_unit}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              {hsnStatus === 'loading' && <span className="gstin-badge loading"><Loader2 size={12} className="spin" /> Looking up…</span>}
              {hsnStatus === 'ok' && hsnInfo && !hsnInfo.approximate && (
                <span className="gstin-badge ok">
                  <CheckCircle2 size={12} /> {hsnInfo.description} — GST {hsnInfo.gstRate}%
                  {hsnInfo.gstRate > 0 && (form.fromStateCode === form.toStateCode
                    ? ` (CGST ${hsnInfo.gstRate/2}% + SGST ${hsnInfo.gstRate/2}%)`
                    : ` (IGST ${hsnInfo.gstRate}%)`)}
                </span>
              )}
              {hsnStatus === 'ok' && hsnInfo && hsnInfo.approximate && (
                <span className="gstin-badge" style={{ background: '#fefce8', color: '#854d0e', border: '1px solid #fde68a' }}>
                  <AlertCircle size={12} /> {hsnInfo.description} (heading {hsnInfo.matchedCode}) — GST approx {hsnInfo.gstRate}% — verify for your sub-code
                </span>
              )}
              {hsnStatus === 'error'   && <span className="gstin-badge" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}><AlertCircle size={12} /> HSN not found — enter rates manually</span>}
            </div>
          </Field>
          <Field label="Quantity" required error={errors.quantity}>
            <input type="number" value={form.quantity} onChange={set('quantity')} placeholder="0.00" min="0.01" step="0.01" />
          </Field>
          <Field label="Unit">
            <select value={form.qtyUnit} onChange={set('qtyUnit')}>
              {[
                'BAG - Bags',        'BAL - Bale',         'BDL - Bundles',      'BKL - Buckles',
                'BOU - Billion of Units', 'BOX - Box',     'BTL - Bottles',      'BUN - Bunches',
                'CAN - Cans',        'CBM - Cubic Meters', 'CCM - Cubic Centimeters', 'CMS - Centimeters',
                'CTN - Cartons',     'DOZ - Dozens',       'DRM - Drums',        'GGK - Great Gross',
                'GMS - Grams',       'GRS - Gross',        'GYD - Gross Yards',  'KGS - Kilograms',
                'KLR - Kilolitres',  'KME - Kilometres',   'LTR - Litres',       'MLT - Millilitres',
                'MTR - Meters',      'MTS - Metric Tons',  'NOS - Numbers',      'OTH - Others',
                'PAC - Packets',     'PCS - Pieces',       'PRS - Pairs',        'QTL - Quintals',
                'ROL - Rolls',       'SET - Sets',         'SQF - Square Feet',  'SQM - Square Meters',
                'SQY - Square Yards','TBS - Tablets',      'TGM - Ten Gross',    'THD - Thousands',
                'TON - Tonnes',      'TUB - Tubes',        'UGS - US Gallons',   'UNT - Units',
                'YDS - Yards',
              ].map(u => {
                const code = u.split(' - ')[0];
                return <option key={code} value={code}>{u}</option>;
              })}
            </select>
          </Field>
          <Field label="Taxable Amount (₹)" required error={errors.taxableAmount}>
            <input type="number" value={form.taxableAmount} onChange={set('taxableAmount')} placeholder="0.00" min="0.01" step="0.01" />
          </Field>
          <Field label="CGST Rate (%)" error={errors.cgstRate}>
            <input type="number" value={form.cgstRate} onChange={set('cgstRate')} min="0" step="0.01" />
          </Field>
          <Field label="SGST Rate (%)" error={errors.sgstRate}>
            <input type="number" value={form.sgstRate} onChange={set('sgstRate')} min="0" step="0.01" />
          </Field>
          <Field label="IGST Rate (%)" error={errors.igstRate}>
            <input type="number" value={form.igstRate} onChange={set('igstRate')} min="0" step="0.01" />
          </Field>
          <Field label="CESS Rate (%)">
            <input type="number" value={form.cessRate} onChange={set('cessRate')} min="0" step="0.01" />
          </Field>
        </div>
        {form.fromStateCode === form.toStateCode
          ? <p className="tax-hint">Intra-state: Use CGST + SGST only (IGST = 0)</p>
          : <p className="tax-hint">Inter-state: Use IGST only (CGST/SGST = 0)</p>
        }
      </div>

      {/* Transport Details */}
      <div className="form-section">
        <h3>Transport Details</h3>
        <div className="grid-2">
          <Field label="Mode of Transport">
            <select value={form.transportMode} onChange={set('transportMode')}>
              <option value="1">Road</option>
              <option value="2">Rail</option>
              <option value="3">Air</option>
              <option value="4">Ship</option>
            </select>
          </Field>
          <Field label="Distance (KM)" error={errors.transDistance}>
            <div className="gstin-wrap">
              <input type="number" value={form.transDistance} onChange={set('transDistance')} placeholder="1–4000 KM" min="1" max="4000" />
              {distStatus === 'loading' && <span className="gstin-badge loading"><Loader2 size={12} className="spin" /> Calculating…</span>}
              {distStatus === 'ok'      && <span className="gstin-badge ok"><CheckCircle2 size={12} /> Auto-calculated</span>}
              {distStatus === 'fail'    && <span className="gstin-badge" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}><AlertCircle size={12} /> Could not calculate — enter manually</span>}
            </div>
          </Field>
          <Field label="Transporter ID/GSTIN">
            <input value={form.transporterId} onChange={set('transporterId')} placeholder="Transporter GSTIN" />
          </Field>
          <Field label="Transporter Name">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={form.transporterName}
                onChange={set('transporterName')}
                placeholder="Transport company"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                title="Pick from saved transporters"
                onClick={() => setShowTransporterMgr(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '0 10px', borderRadius: 8, border: '1.5px solid #6366f1',
                  background: '#eef2ff', color: '#4f46e5', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                <Truck size={13} /> Saved
              </button>
            </div>
          </Field>
          <Field label="Vehicle No." error={errors.vehicleNo}>
            <input value={form.vehicleNo} onChange={set('vehicleNo')} placeholder="KA01AB1234" style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Vehicle Type">
            <select value={form.vehicleType} onChange={set('vehicleType')}>
              <option value="R">Regular</option>
              <option value="O">Over Dimensional Cargo</option>
            </select>
          </Field>
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="error-summary">
          {Object.keys(errors).length} validation error{Object.keys(errors).length > 1 ? 's' : ''} found. Please review the highlighted fields.
        </div>
      )}

      {/* Save as Template */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', flexWrap: 'wrap' }}>
        {!showSaveTemplate ? (
          <button
            type="button"
            className="btn-sm"
            onClick={() => setShowSaveTemplate(true)}
            style={{ fontSize: 12, color: '#475569' }}
          >
            Save as Template {templates.length >= 5 ? '(5/5)' : `(${templates.length}/5)`}
          </button>
        ) : (
          <>
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Template name…"
              maxLength={30}
              style={{
                flex: '1 1 140px', padding: '7px 10px', borderRadius: 8, fontSize: 13,
                border: '1.5px solid #6366f1', background: '#f8fafc', outline: 'none',
                boxSizing: 'border-box', color: '#1e293b',
              }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveTemplate(); } }}
              autoFocus
            />
            <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '6px 14px', width: 'auto' }} onClick={saveTemplate} disabled={!templateName.trim()}>
              Save
            </button>
            <button type="button" className="btn-sm" style={{ fontSize: 12 }} onClick={() => { setShowSaveTemplate(false); setTemplateName(''); }}>
              Cancel
            </button>
          </>
        )}
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={reset}>Reset Form</button>
        <div className="form-actions-right">
          {!hideChargeInfo && (
            <span className="ewb-charge-badge">
              💳 ₹{((ewbChargeInfo?.paise ?? ewbCharge) / 100).toFixed(2)}{ewbChargeInfo?.gstRate > 0 ? ` + ${ewbChargeInfo.gstRate}% GST` : ''} per e-waybill
            </span>
          )}
          <button type="submit" className="btn-primary">
            Review &amp; Confirm →
          </button>
        </div>
      </div>

      {showTransporterMgr && (
        <TransporterManager
          token={token}
          onSelect={(t) => {
            setForm(prev => ({
              ...prev,
              transporterName: t.name || '',
              transporterId: t.gstin || '',
              vehicleNo: t.vehicle_no || '',
            }));
            setShowTransporterMgr(false);
          }}
          onClose={() => setShowTransporterMgr(false)}
        />
      )}
    </form>
  );
}
