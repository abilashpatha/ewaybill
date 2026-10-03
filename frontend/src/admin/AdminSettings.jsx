import { useState, useEffect } from 'react';
import { Loader2, Save, RefreshCw, IndianRupee, CheckCircle2, Percent, Building2 } from 'lucide-react';

const STATE_CODES = [
  ['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
  ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],
  ['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],
  ['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],
  ['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],
  ['24','Gujarat'],['26','Dadra & NH'],['27','Maharashtra'],['28','Andhra Pradesh (Old)'],
  ['29','Karnataka'],['30','Goa'],['31','Lakshadweep'],['32','Kerala'],['33','Tamil Nadu'],
  ['34','Puducherry'],['35','Andaman & Nicobar'],['36','Telangana'],['37','Andhra Pradesh'],
];

export default function AdminSettings({ auth }) {
  const [charge, setCharge]         = useState('');
  const [newCharge, setNewCharge]   = useState('');
  const [chargeUpdatedAt, setChargeUpdatedAt] = useState('');
  const [gstRate, setGstRate]       = useState('');
  const [newGstRate, setNewGstRate] = useState('');
  const [gstUpdatedAt, setGstUpdatedAt] = useState('');

  // Cancel charge
  const [cancelCharge,        setCancelCharge]        = useState('');
  const [newCancelCharge,     setNewCancelCharge]     = useState('');
  const [cancelChargeUpdatedAt, setCancelChargeUpdatedAt] = useState('');
  const [cancelGstRate,       setCancelGstRate]       = useState('');
  const [newCancelGstRate,    setNewCancelGstRate]    = useState('');
  const [savingCancelCharge,  setSavingCancelCharge]  = useState(false);
  const [savingCancelGst,     setSavingCancelGst]     = useState(false);
  const [savedCancelCharge,   setSavedCancelCharge]   = useState(false);
  const [savedCancelGst,      setSavedCancelGst]      = useState(false);

  // Extend validity charge
  const [extendCharge,        setExtendCharge]        = useState('');
  const [newExtendCharge,     setNewExtendCharge]     = useState('');
  const [extendChargeUpdatedAt, setExtendChargeUpdatedAt] = useState('');
  const [extendGstRate,       setExtendGstRate]       = useState('');
  const [newExtendGstRate,    setNewExtendGstRate]    = useState('');
  const [savingExtendCharge,  setSavingExtendCharge]  = useState(false);
  const [savingExtendGst,     setSavingExtendGst]     = useState(false);
  const [savedExtendCharge,   setSavedExtendCharge]   = useState(false);
  const [savedExtendGst,      setSavedExtendGst]      = useState(false);

  // Company info
  const [companyName,      setCompanyName]      = useState('');
  const [newCompanyName,   setNewCompanyName]   = useState('');
  const [companyGstin,     setCompanyGstin]     = useState('');
  const [newCompanyGstin,  setNewCompanyGstin]  = useState('');
  const [companyState,     setCompanyState]     = useState('36');
  const [newCompanyState,  setNewCompanyState]  = useState('36');
  const [companySac,       setCompanySac]       = useState('');
  const [newCompanySac,    setNewCompanySac]    = useState('');
  const [companyUpdatedAt, setCompanyUpdatedAt] = useState('');

  const [loading, setLoading]         = useState(true);
  const [savingCharge, setSavingCharge]   = useState(false);
  const [savingGst, setSavingGst]         = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savedCharge, setSavedCharge]     = useState(false);
  const [savedGst, setSavedGst]           = useState(false);
  const [savedCompany, setSavedCompany]   = useState(false);
  const [error, setError]             = useState('');

  const load = () => {
    setLoading(true); setError('');
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const s = d.settings;
          const paise  = parseInt(s?.ewb_charge_paise?.value ?? 2000);
          const rupees = (paise / 100).toFixed(2);
          setCharge(rupees); setNewCharge(rupees);
          setChargeUpdatedAt(s?.ewb_charge_paise?.updated_at || '');

          const rate = parseFloat(s?.ewb_charge_gst_rate?.value ?? 18).toFixed(1);
          setGstRate(rate); setNewGstRate(rate);
          setGstUpdatedAt(s?.ewb_charge_gst_rate?.updated_at || '');

          const cp = parseInt(s?.cancel_charge_paise?.value ?? 1000);
          const cpRupees = (cp / 100).toFixed(2);
          setCancelCharge(cpRupees); setNewCancelCharge(cpRupees);
          setCancelChargeUpdatedAt(s?.cancel_charge_paise?.updated_at || '');
          const cgst = parseFloat(s?.cancel_charge_gst_rate?.value ?? 18).toFixed(1);
          setCancelGstRate(cgst); setNewCancelGstRate(cgst);

          const ep = parseInt(s?.extend_charge_paise?.value ?? 0);
          const epRupees = (ep / 100).toFixed(2);
          setExtendCharge(epRupees); setNewExtendCharge(epRupees);
          setExtendChargeUpdatedAt(s?.extend_charge_paise?.updated_at || '');
          const egst = parseFloat(s?.extend_charge_gst_rate?.value ?? 18).toFixed(1);
          setExtendGstRate(egst); setNewExtendGstRate(egst);

          const cn = s?.company_name?.value || 'Kena Software Solutions';
          setCompanyName(cn); setNewCompanyName(cn);
          const cg = s?.company_gstin?.value || '';
          setCompanyGstin(cg); setNewCompanyGstin(cg);
          const cs = s?.company_state_code?.value || '36';
          setCompanyState(cs); setNewCompanyState(cs);
          const csac = s?.company_sac_code?.value || '998315';
          setCompanySac(csac); setNewCompanySac(csac);
          setCompanyUpdatedAt(s?.company_name?.updated_at || '');
        }
        setLoading(false);
      })
      .catch(() => { setError('Failed to load settings.'); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const saveSetting = async (key, value, setSaving, setSaved, onSuccess) => {
    setSaving(true); setError(''); setSaved(false);
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ key, value: String(value) }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) { setSaved(true); setTimeout(() => setSaved(false), 3000); onSuccess(d); }
    else setError(d.error || 'Failed to save');
  };

  const handleSaveCharge = async () => {
    const rupees = parseFloat(newCharge);
    if (isNaN(rupees) || rupees < 0) return setError('Enter a valid amount (₹0 or more)');
    if (rupees > 10000) return setError('Maximum charge is ₹10,000');
    const paise = Math.round(rupees * 100);
    await saveSetting('ewb_charge_paise', paise, setSavingCharge, setSavedCharge,
      () => setCharge((paise / 100).toFixed(2)));
  };

  const handleSaveGst = async () => {
    const rate = parseFloat(newGstRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return setError('GST rate must be 0–100%');
    await saveSetting('ewb_charge_gst_rate', rate, setSavingGst, setSavedGst,
      () => setGstRate(rate.toFixed(1)));
  };

  const handleSaveCancelCharge = async () => {
    const rupees = parseFloat(newCancelCharge);
    if (isNaN(rupees) || rupees < 0) return setError('Enter a valid amount (₹0 or more)');
    if (rupees > 10000) return setError('Maximum charge is ₹10,000');
    const paise = Math.round(rupees * 100);
    await saveSetting('cancel_charge_paise', paise, setSavingCancelCharge, setSavedCancelCharge,
      () => setCancelCharge((paise / 100).toFixed(2)));
  };

  const handleSaveCancelGst = async () => {
    const rate = parseFloat(newCancelGstRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return setError('GST rate must be 0–100%');
    await saveSetting('cancel_charge_gst_rate', rate, setSavingCancelGst, setSavedCancelGst,
      () => setCancelGstRate(rate.toFixed(1)));
  };

  const handleSaveExtendCharge = async () => {
    const rupees = parseFloat(newExtendCharge);
    if (isNaN(rupees) || rupees < 0) return setError('Enter a valid amount (₹0 or more)');
    if (rupees > 10000) return setError('Maximum charge is ₹10,000');
    const paise = Math.round(rupees * 100);
    await saveSetting('extend_charge_paise', paise, setSavingExtendCharge, setSavedExtendCharge,
      () => setExtendCharge((paise / 100).toFixed(2)));
  };

  const handleSaveExtendGst = async () => {
    const rate = parseFloat(newExtendGstRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return setError('GST rate must be 0–100%');
    await saveSetting('extend_charge_gst_rate', rate, setSavingExtendGst, setSavedExtendGst,
      () => setExtendGstRate(rate.toFixed(1)));
  };

  const handleSaveCompany = async () => {
    if (!newCompanyName.trim()) return setError('Company name cannot be empty');
    if (newCompanyGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(newCompanyGstin.toUpperCase()))
      return setError('Invalid GSTIN format (e.g. 36XXXXX1234X1ZX)');
    if (!/^\d{4,8}$/.test(newCompanySac)) return setError('SAC code must be 4–8 digits');
    setSavingCompany(true); setError(''); setSavedCompany(false);
    try {
      const updates = [
        { key: 'company_name',       value: newCompanyName.trim() },
        { key: 'company_gstin',      value: newCompanyGstin.trim().toUpperCase() },
        { key: 'company_state_code', value: newCompanyState },
        { key: 'company_sac_code',   value: newCompanySac.trim() },
      ];
      for (const upd of updates) {
        const res = await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify(upd),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error || `Failed to save ${upd.key}`);
      }
      setCompanyName(newCompanyName.trim());
      setCompanyGstin(newCompanyGstin.trim().toUpperCase());
      setCompanyState(newCompanyState);
      setCompanySac(newCompanySac.trim());
      setSavedCompany(true);
      setTimeout(() => setSavedCompany(false), 3000);
    } catch (e) {
      setError(e.message);
    }
    setSavingCompany(false);
  };

  const fmtDate = (dt) => dt
    ? new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const companyChanged = newCompanyName !== companyName
    || newCompanyGstin !== companyGstin
    || newCompanyState !== companyState
    || newCompanySac   !== companySac;

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">⚙️ App Settings</h2>

      {error && <div className="admin-error" style={{ marginBottom: '12px' }}>{error}</div>}

      {loading ? (
        <div className="admin-loading">Loading settings…</div>
      ) : (
        <div className="settings-grid">

          {/* ── Per-EWB Charge card ── */}
          <div className="admin-card settings-card">
            <div className="settings-card-header">
              <IndianRupee size={18} color="#6366f1" />
              <div>
                <h3 className="settings-card-title">Per E-Waybill Charge (Base)</h3>
                <p className="settings-card-sub">Base amount before GST. Total deducted = base + GST.</p>
              </div>
            </div>
            <div className="settings-current-row">
              <span className="settings-current-label">Current base charge</span>
              <span className="settings-current-value">₹{charge}</span>
              {chargeUpdatedAt && <span className="settings-updated-at">Updated: {fmtDate(chargeUpdatedAt)}</span>}
            </div>
            {savedCharge && <div className="settings-success"><CheckCircle2 size={14} /> Base charge updated to ₹{charge}</div>}
            <div className="settings-input-row">
              <label className="settings-input-label">New base charge (₹)</label>
              <div className="settings-input-wrap">
                <span className="settings-rupee-prefix">₹</span>
                <input type="number" className="settings-input" value={newCharge}
                  onChange={e => { setNewCharge(e.target.value); setError(''); setSavedCharge(false); }}
                  min="0" step="0.01" placeholder="e.g. 30" />
              </div>
              <p className="settings-hint">
                If base = ₹{parseFloat(newCharge||charge||0).toFixed(2)} and GST = {gstRate}%,
                total per EWB = ₹{(parseFloat(newCharge||charge||0) * (1 + parseFloat(gstRate||0)/100)).toFixed(2)}.
              </p>
            </div>
            <div className="settings-actions">
              <button className="admin-btn-sm" onClick={load} disabled={loading || savingCharge}><RefreshCw size={13}/> Reset</button>
              <button className="admin-btn-sm admin-btn-green" onClick={handleSaveCharge}
                disabled={savingCharge || newCharge === charge}>
                {savingCharge ? <><Loader2 size={13} className="spin"/> Saving…</> : <><Save size={13}/> Save</>}
              </button>
            </div>
          </div>

          {/* ── GST Rate card ── */}
          <div className="admin-card settings-card">
            <div className="settings-card-header">
              <Percent size={18} color="#d97706" />
              <div>
                <h3 className="settings-card-title">GST Rate on Service Charge</h3>
                <p className="settings-card-sub">GST added on top of the base charge. A PDF tax invoice is auto-generated for each EWB.</p>
              </div>
            </div>
            <div className="settings-current-row">
              <span className="settings-current-label">Current GST rate</span>
              <span className="settings-current-value">{gstRate}%</span>
              {gstUpdatedAt && <span className="settings-updated-at">Updated: {fmtDate(gstUpdatedAt)}</span>}
            </div>
            {savedGst && <div className="settings-success"><CheckCircle2 size={14} /> GST rate updated to {gstRate}%</div>}
            <div className="settings-input-row">
              <label className="settings-input-label">New GST rate (%)</label>
              <div className="settings-input-wrap">
                <input type="number" className="settings-input" value={newGstRate}
                  onChange={e => { setNewGstRate(e.target.value); setError(''); setSavedGst(false); }}
                  min="0" max="100" step="0.1" placeholder="e.g. 18" />
                <span className="settings-rupee-prefix" style={{ left: 'auto', right: 8 }}>%</span>
              </div>
              <p className="settings-hint">Set to 0 for no GST. Common rates: 5%, 12%, 18%, 28%.</p>
            </div>
            <div className="settings-actions">
              <button className="admin-btn-sm" onClick={load} disabled={loading || savingGst}><RefreshCw size={13}/> Reset</button>
              <button className="admin-btn-sm admin-btn-green" onClick={handleSaveGst}
                disabled={savingGst || newGstRate === gstRate}>
                {savingGst ? <><Loader2 size={13} className="spin"/> Saving…</> : <><Save size={13}/> Save</>}
              </button>
            </div>
          </div>

          {/* ── Cancel Charge card ── */}
          <div className="admin-card settings-card">
            <div className="settings-card-header">
              <IndianRupee size={18} color="#dc2626" />
              <div>
                <h3 className="settings-card-title">Cancellation Charge (Base)</h3>
                <p className="settings-card-sub">Fee charged per e-waybill cancellation (before GST).</p>
              </div>
            </div>
            <div className="settings-current-row">
              <span className="settings-current-label">Current base charge</span>
              <span className="settings-current-value">₹{cancelCharge}</span>
              {cancelChargeUpdatedAt && <span className="settings-updated-at">Updated: {fmtDate(cancelChargeUpdatedAt)}</span>}
            </div>
            {savedCancelCharge && <div className="settings-success"><CheckCircle2 size={14} /> Cancel charge updated to ₹{cancelCharge}</div>}
            <div className="settings-input-row">
              <label className="settings-input-label">New base charge (₹)</label>
              <div className="settings-input-wrap">
                <span className="settings-rupee-prefix">₹</span>
                <input type="number" className="settings-input" value={newCancelCharge}
                  onChange={e => { setNewCancelCharge(e.target.value); setError(''); setSavedCancelCharge(false); }}
                  min="0" step="0.01" placeholder="e.g. 10" />
              </div>
              <p className="settings-hint">
                If base = ₹{parseFloat(newCancelCharge||cancelCharge||0).toFixed(2)} and GST = {cancelGstRate}%,
                total per cancel = ₹{(parseFloat(newCancelCharge||cancelCharge||0) * (1 + parseFloat(cancelGstRate||0)/100)).toFixed(2)}.
              </p>
            </div>
            <div className="settings-actions">
              <button className="admin-btn-sm" onClick={load} disabled={loading || savingCancelCharge}><RefreshCw size={13}/> Reset</button>
              <button className="admin-btn-sm admin-btn-green" onClick={handleSaveCancelCharge}
                disabled={savingCancelCharge || newCancelCharge === cancelCharge}>
                {savingCancelCharge ? <><Loader2 size={13} className="spin"/> Saving…</> : <><Save size={13}/> Save</>}
              </button>
            </div>
          </div>

          {/* ── Cancel GST Rate card ── */}
          <div className="admin-card settings-card">
            <div className="settings-card-header">
              <Percent size={18} color="#b45309" />
              <div>
                <h3 className="settings-card-title">GST Rate on Cancellation Fee</h3>
                <p className="settings-card-sub">GST added on top of the cancellation base charge.</p>
              </div>
            </div>
            <div className="settings-current-row">
              <span className="settings-current-label">Current GST rate</span>
              <span className="settings-current-value">{cancelGstRate}%</span>
            </div>
            {savedCancelGst && <div className="settings-success"><CheckCircle2 size={14} /> Cancel GST rate updated to {cancelGstRate}%</div>}
            <div className="settings-input-row">
              <label className="settings-input-label">New GST rate (%)</label>
              <div className="settings-input-wrap">
                <input type="number" className="settings-input" value={newCancelGstRate}
                  onChange={e => { setNewCancelGstRate(e.target.value); setError(''); setSavedCancelGst(false); }}
                  min="0" max="100" step="0.1" placeholder="e.g. 18" />
                <span className="settings-rupee-prefix" style={{ left: 'auto', right: 8 }}>%</span>
              </div>
              <p className="settings-hint">Set to 0 for no GST. Common rates: 5%, 12%, 18%, 28%.</p>
            </div>
            <div className="settings-actions">
              <button className="admin-btn-sm" onClick={load} disabled={loading || savingCancelGst}><RefreshCw size={13}/> Reset</button>
              <button className="admin-btn-sm admin-btn-green" onClick={handleSaveCancelGst}
                disabled={savingCancelGst || newCancelGstRate === cancelGstRate}>
                {savingCancelGst ? <><Loader2 size={13} className="spin"/> Saving…</> : <><Save size={13}/> Save</>}
              </button>
            </div>
          </div>

          {/* ── Extend Validity Charge card ── */}
          <div className="admin-card settings-card">
            <div className="settings-card-header">
              <IndianRupee size={18} color="#0891b2" />
              <div>
                <h3 className="settings-card-title">Validity Extension Charge (Base)</h3>
                <p className="settings-card-sub">Fee charged per e-waybill validity extension (before GST). Set ₹0 for free.</p>
              </div>
            </div>
            <div className="settings-current-row">
              <span className="settings-current-label">Current base charge</span>
              <span className="settings-current-value">₹{extendCharge}</span>
              {extendChargeUpdatedAt && <span className="settings-updated-at">Updated: {fmtDate(extendChargeUpdatedAt)}</span>}
            </div>
            {savedExtendCharge && <div className="settings-success"><CheckCircle2 size={14} /> Extend charge updated to ₹{extendCharge}</div>}
            <div className="settings-input-row">
              <label className="settings-input-label">New base charge (₹)</label>
              <div className="settings-input-wrap">
                <span className="settings-rupee-prefix">₹</span>
                <input type="number" className="settings-input" value={newExtendCharge}
                  onChange={e => { setNewExtendCharge(e.target.value); setError(''); setSavedExtendCharge(false); }}
                  min="0" step="0.01" placeholder="e.g. 10" />
              </div>
              <p className="settings-hint">
                If base = ₹{parseFloat(newExtendCharge||extendCharge||0).toFixed(2)} and GST = {extendGstRate}%,
                total per extension = ₹{(parseFloat(newExtendCharge||extendCharge||0) * (1 + parseFloat(extendGstRate||0)/100)).toFixed(2)}.
              </p>
            </div>
            <div className="settings-actions">
              <button className="admin-btn-sm" onClick={load} disabled={loading || savingExtendCharge}><RefreshCw size={13}/> Reset</button>
              <button className="admin-btn-sm admin-btn-green" onClick={handleSaveExtendCharge}
                disabled={savingExtendCharge || newExtendCharge === extendCharge}>
                {savingExtendCharge ? <><Loader2 size={13} className="spin"/> Saving…</> : <><Save size={13}/> Save</>}
              </button>
            </div>
          </div>

          {/* ── Extend Validity GST Rate card ── */}
          <div className="admin-card settings-card">
            <div className="settings-card-header">
              <Percent size={18} color="#0e7490" />
              <div>
                <h3 className="settings-card-title">GST Rate on Extension Fee</h3>
                <p className="settings-card-sub">GST added on top of the validity extension base charge.</p>
              </div>
            </div>
            <div className="settings-current-row">
              <span className="settings-current-label">Current GST rate</span>
              <span className="settings-current-value">{extendGstRate}%</span>
            </div>
            {savedExtendGst && <div className="settings-success"><CheckCircle2 size={14} /> Extension GST rate updated to {extendGstRate}%</div>}
            <div className="settings-input-row">
              <label className="settings-input-label">New GST rate (%)</label>
              <div className="settings-input-wrap">
                <input type="number" className="settings-input" value={newExtendGstRate}
                  onChange={e => { setNewExtendGstRate(e.target.value); setError(''); setSavedExtendGst(false); }}
                  min="0" max="100" step="0.1" placeholder="e.g. 18" />
                <span className="settings-rupee-prefix" style={{ left: 'auto', right: 8 }}>%</span>
              </div>
              <p className="settings-hint">Set to 0 for no GST. Common rates: 5%, 12%, 18%, 28%.</p>
            </div>
            <div className="settings-actions">
              <button className="admin-btn-sm" onClick={load} disabled={loading || savingExtendGst}><RefreshCw size={13}/> Reset</button>
              <button className="admin-btn-sm admin-btn-green" onClick={handleSaveExtendGst}
                disabled={savingExtendGst || newExtendGstRate === extendGstRate}>
                {savingExtendGst ? <><Loader2 size={13} className="spin"/> Saving…</> : <><Save size={13}/> Save</>}
              </button>
            </div>
          </div>

          {/* ── Company / Service Provider card ── */}
          <div className="admin-card settings-card" style={{ gridColumn: '1 / -1' }}>
            <div className="settings-card-header">
              <Building2 size={18} color="#0891b2" />
              <div>
                <h3 className="settings-card-title">Service Provider Details</h3>
                <p className="settings-card-sub">Your company info for GST invoices and filing reports (GSTR-1).</p>
              </div>
            </div>
            {companyUpdatedAt && (
              <div className="settings-current-row">
                <span className="settings-current-label">Last updated</span>
                <span className="settings-updated-at">{fmtDate(companyUpdatedAt)}</span>
              </div>
            )}
            {savedCompany && <div className="settings-success"><CheckCircle2 size={14} /> Company details saved successfully.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginTop: '12px' }}>
              <div className="settings-input-row" style={{ marginTop: 0 }}>
                <label className="settings-input-label">Company / Trade Name *</label>
                <input type="text" className="settings-input" value={newCompanyName}
                  onChange={e => { setNewCompanyName(e.target.value); setError(''); }}
                  placeholder="e.g. Kena Software Solutions" />
                <p className="settings-hint">Appears on all service invoices.</p>
              </div>
              <div className="settings-input-row" style={{ marginTop: 0 }}>
                <label className="settings-input-label">Company GSTIN</label>
                <input type="text" className="settings-input" value={newCompanyGstin}
                  onChange={e => { setNewCompanyGstin(e.target.value.toUpperCase()); setError(''); }}
                  placeholder="e.g. 36XXXXX1234X1ZX" maxLength={15} style={{ fontFamily: 'monospace' }} />
                <p className="settings-hint">Used in GSTR-1 filing. Leave blank if not registered.</p>
              </div>
              <div className="settings-input-row" style={{ marginTop: 0 }}>
                <label className="settings-input-label">State of Registration</label>
                <select className="settings-input" value={newCompanyState}
                  onChange={e => { setNewCompanyState(e.target.value); setError(''); }}>
                  {STATE_CODES.map(([code, name]) => (
                    <option key={code} value={code}>{code} – {name}</option>
                  ))}
                </select>
                <p className="settings-hint">Used to determine CGST/SGST vs IGST per invoice.</p>
              </div>
              <div className="settings-input-row" style={{ marginTop: 0 }}>
                <label className="settings-input-label">SAC Code</label>
                <input type="text" className="settings-input" value={newCompanySac}
                  onChange={e => { setNewCompanySac(e.target.value); setError(''); }}
                  placeholder="e.g. 998315" maxLength={8} style={{ fontFamily: 'monospace' }} />
                <p className="settings-hint">Service Accounting Code. 998315 = IT/software services.</p>
              </div>
            </div>
            <div className="settings-actions" style={{ marginTop: '16px' }}>
              <button className="admin-btn-sm" onClick={load} disabled={loading || savingCompany}><RefreshCw size={13}/> Reset</button>
              <button className="admin-btn-sm admin-btn-green" onClick={handleSaveCompany}
                disabled={savingCompany || !companyChanged}>
                {savingCompany ? <><Loader2 size={13} className="spin"/> Saving…</> : <><Save size={13}/> Save Company Details</>}
              </button>
            </div>
          </div>

          {/* Info card */}
          <div className="settings-info-card">
            <h4>About Settings</h4>
            <p>Changes take effect immediately for all new EWB generations. Existing transactions are not affected.</p>
            <ul>
              <li><strong>Base Charge:</strong> Wallet deduction before GST.</li>
              <li><strong>GST Rate:</strong> Added on top of base. A PDF tax invoice is auto-generated per EWB.</li>
              <li><strong>Company Details:</strong> Used on invoices and in the 🧾 GST Filing Report for GSTR-1.</li>
              <li>Set base to <strong>₹0</strong> to allow free generation (e.g. for testing).</li>
              <li>Only super admins can modify these settings.</li>
            </ul>
          </div>

        </div>
      )}
    </div>
  );
}
