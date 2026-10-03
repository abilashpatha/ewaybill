import { useState, useEffect } from 'react';
import { Plus, Trash2, Star, Loader2, CheckCircle2, Clock, XCircle, ChevronRight, ArrowLeft, Eye, EyeOff, Phone, Mail, Save } from 'lucide-react';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

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

const STATUS_CONFIG = {
  approved: { label: 'Approved',         color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: <CheckCircle2 size={12}/> },
  pending:  { label: 'Pending Approval', color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: <Clock size={12}/> },
  rejected: { label: 'Rejected',         color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: <XCircle size={12}/> },
};

const EMPTY_FORM = {
  gstin: '', tradeName: '', addr1: '', addr2: '',
  place: '', pincode: '', stateCode: '36',
  ewbUsername: '', ewbPassword: '',
};

// ── Add GSTIN form ─────────────────────────────────────────────
function AddGstinForm({ token, onAdded, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const set = k => e => {
    const v = k === 'gstin' ? e.target.value.toUpperCase() : e.target.value;
    setForm(p => ({ ...p, [k]: v }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const g = form.gstin.trim();
    if (!GSTIN_RE.test(g)) return setError('Invalid GSTIN format (e.g. 36XXXXX1234X1ZX)');
    if (!form.tradeName.trim()) return setError('Business / Trade Name is required');
    if (!form.addr1.trim()) return setError('Address is required');
    if (!form.place.trim()) return setError('City / Place is required');
    if (!/^[0-9]{6}$/.test(form.pincode.trim())) return setError('Valid 6-digit pincode is required');
    if (!form.ewbUsername.trim()) return setError('EWB Portal Username is required');
    if (!form.ewbPassword.trim()) return setError('EWB Portal Password is required');

    setSaving(true);
    try {
      const r = await fetch('/api/user/gstins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          gstin: g,
          tradeName: form.tradeName.trim(),
          addr1: form.addr1.trim(),
          addr2: form.addr2.trim(),
          place: form.place.trim(),
          pincode: form.pincode.trim(),
          stateCode: form.stateCode,
          ewbUsername: form.ewbUsername.trim(),
          ewbPassword: form.ewbPassword,
        }),
      });
      const d = await r.json();
      if (d.success) onAdded();
      else setError(d.error || 'Failed to add GSTIN');
    } catch {
      setError('Server error');
    }
    setSaving(false);
  };

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Add New GSTIN</div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="auth-field">
          <label>GSTIN <span style={{ color: '#ef4444' }}>*</span></label>
          <input value={form.gstin} onChange={set('gstin')} placeholder="e.g. 36XXXXX1234X1ZX" maxLength={15}
            style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
        </div>
        <div className="auth-field">
          <label>Business / Trade Name <span style={{ color: '#ef4444' }}>*</span></label>
          <input value={form.tradeName} onChange={set('tradeName')} placeholder="Your company name" />
        </div>
        <div className="auth-field">
          <label>Address Line 1 <span style={{ color: '#ef4444' }}>*</span></label>
          <input value={form.addr1} onChange={set('addr1')} placeholder="Street / Building No." />
        </div>
        <div className="auth-field">
          <label>Address Line 2</label>
          <input value={form.addr2} onChange={set('addr2')} placeholder="Area / Locality (optional)" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="auth-field">
            <label>City / Place <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={form.place} onChange={set('place')} placeholder="City" />
          </div>
          <div className="auth-field">
            <label>Pincode <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={form.pincode} onChange={set('pincode')} placeholder="6-digit PIN" maxLength={6} />
          </div>
        </div>
        <div className="auth-field">
          <label>State <span style={{ color: '#ef4444' }}>*</span></label>
          <select value={form.stateCode} onChange={set('stateCode')}>
            {STATE_CODES.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            EWB Portal Credentials
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="auth-field">
              <label>EWB Username <span style={{ color: '#ef4444' }}>*</span></label>
              <input value={form.ewbUsername} onChange={set('ewbUsername')} placeholder="NIC portal username (usually your GSTIN)" />
            </div>
            <div className="auth-field">
              <label>EWB Password <span style={{ color: '#ef4444' }}>*</span></label>
              <div className="pass-wrap">
                <input type={showPass ? 'text' : 'password'} value={form.ewbPassword} onChange={set('ewbPassword')} placeholder="NIC portal password" />
                <button type="button" className="pass-eye" onClick={() => setShowPass(p => !p)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ color: '#dc2626', fontSize: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>{error}</div>}

        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          New GSTINs require admin approval before use.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, padding: '9px 0', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            style={{ flex: 2, padding: '9px 0', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {saving ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── GSTIN detail / edit view ───────────────────────────────────
function GstinDetail({ gstin: g, token, onBack, onUpdated, onRemoved }) {
  const [ewbUsername, setEwbUsername] = useState(g.ewb_username || '');
  const [ewbPassword, setEwbPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const cfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.pending;
  const stateName = STATE_CODES.find(s => s.code === g.state_code)?.name || g.state_code;

  const handleSave = async (e) => {
    e.preventDefault();
    const usernameChanged = ewbUsername.trim() !== (g.ewb_username || '');
    if (!usernameChanged && !ewbPassword) return setError('No changes to save');
    if (!ewbUsername.trim()) return setError('EWB Portal Username is required');
    setSaving(true); setError(''); setSuccess('');
    try {
      const body = {};
      if (usernameChanged) body.ewbUsername = ewbUsername.trim();
      if (ewbPassword)     body.ewbPassword = ewbPassword;
      const r = await fetch(`/api/user/gstins/${g.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) { setSuccess('EWB credentials updated'); setEwbPassword(''); onUpdated(); }
      else setError(d.error || 'Update failed');
    } catch { setError('Server error'); }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove this GSTIN?')) return;
    try {
      const r = await fetch(`/api/user/gstins/${g.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) onRemoved();
      else alert(d.error);
    } catch { alert('Server error'); }
  };

  const handleSetPrimary = async () => {
    try {
      const r = await fetch(`/api/user/gstins/${g.id}/set-primary`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) onUpdated();
      else alert(d.error);
    } catch { alert('Server error'); }
  };

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>GSTIN Details</div>
        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', gap: 3 }}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      {/* Details card */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', marginBottom: 14, border: '1px solid #e2e8f0' }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          {g.is_primary && <Star size={14} color="#2563eb" fill="#2563eb" />}
          {g.gstin}
        </div>
        {g.trade_name && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{g.trade_name}</div>}
        {(g.addr1 || g.place) && (
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
            {[g.addr1, g.addr2, g.place, g.pincode, stateName].filter(Boolean).join(', ')}
          </div>
        )}
        {g.ewb_username && (
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            EWB Username: <span style={{ fontFamily: 'monospace', color: '#334155' }}>{g.ewb_username}</span>
          </div>
        )}
        {g.notes && (
          <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>
            Admin note: {g.notes}
          </div>
        )}
      </div>

      {/* Actions based on status */}
      {g.status === 'approved' && (
        <>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 2 }}>EWB Portal Credentials</div>
            <div className="auth-field">
              <label>EWB Username <span style={{ color: '#ef4444' }}>*</span></label>
              <input value={ewbUsername}
                onChange={e => { setEwbUsername(e.target.value); setError(''); setSuccess(''); }}
                placeholder="NIC portal username" style={{ fontFamily: 'monospace' }} />
            </div>
            <div className="auth-field">
              <label>EWB Password</label>
              <div className="pass-wrap">
                <input type={showPass ? 'text' : 'password'} value={ewbPassword}
                  onChange={e => { setEwbPassword(e.target.value); setError(''); setSuccess(''); }}
                  placeholder="Leave blank to keep current" />
                <button type="button" className="pass-eye" onClick={() => setShowPass(p => !p)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error   && <div style={{ color: '#dc2626', fontSize: 12 }}>{error}</div>}
            {success && <div style={{ color: '#16a34a', fontSize: 12 }}>{success}</div>}
            <button type="submit" disabled={saving}
              style={{ padding: '9px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save EWB Credentials'}
            </button>
          </form>

          {/* Contact us notice */}
          <div style={{ marginTop: 16, padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
              Need to update other details?
            </div>
            <div style={{ fontSize: 12, color: '#78350f', marginBottom: 10, lineHeight: 1.5 }}>
              Once a GSTIN is approved, address and business details can only be updated by our support team.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <a href="tel:+918919066381" style={{ fontSize: 12, color: '#1a56db', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontWeight: 600 }}>
                <Phone size={13} /> +91-8919066381
              </a>
              <a href="mailto:hr@kenasoft.com" style={{ fontSize: 12, color: '#1a56db', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontWeight: 600 }}>
                <Mail size={13} /> hr@kenasoft.com
              </a>
            </div>
          </div>

          {!g.is_primary && (
            <button onClick={handleSetPrimary}
              style={{ marginTop: 10, width: '100%', padding: '9px', border: '1px solid #bfdbfe', borderRadius: 8, background: '#eff6ff', color: '#2563eb', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Set as Primary GSTIN
            </button>
          )}
        </>
      )}

      {g.status === 'pending' && (
        <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
          This GSTIN is pending admin approval. Once approved, it will be available for use. You can remove it below if needed.
        </div>
      )}

      {g.status === 'rejected' && (
        <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12, color: '#7f1d1d', lineHeight: 1.6 }}>
          This GSTIN was rejected. Please contact support to resolve the issue.
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <a href="tel:+918919066381" style={{ fontSize: 12, color: '#1a56db', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontWeight: 600 }}>
              <Phone size={13} /> +91-8919066381
            </a>
            <a href="mailto:hr@kenasoft.com" style={{ fontSize: 12, color: '#1a56db', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontWeight: 600 }}>
              <Mail size={13} /> hr@kenasoft.com
            </a>
          </div>
        </div>
      )}

      {!g.is_primary && (
        <button onClick={handleRemove}
          style={{ marginTop: 12, width: '100%', padding: '9px', border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#dc2626', fontSize: 13, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Trash2 size={14} /> Remove GSTIN
        </button>
      )}
    </div>
  );
}

// ── Main GstinManager ──────────────────────────────────────────
export default function GstinManager({ token, onGstinsChange }) {
  const [gstins, setGstins]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('list'); // 'list' | 'add' | 'detail'
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/user/gstins', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) { setGstins(d.gstins); onGstinsChange?.(d.gstins); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (view === 'add') return (
    <AddGstinForm token={token}
      onAdded={() => { load(); setView('list'); }}
      onCancel={() => setView('list')} />
  );

  if (view === 'detail' && selected) return (
    <GstinDetail gstin={selected} token={token}
      onBack={() => { setView('list'); setSelected(null); }}
      onUpdated={() => { load(); setView('list'); setSelected(null); }}
      onRemoved={() => { load(); setView('list'); setSelected(null); }} />
  );

  // List view
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>My GSTINs</div>
        <button onClick={() => setView('add')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} /> Add GSTIN
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13, padding: '12px 0' }}>Loading...</div>
      ) : gstins.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 10 }}>
          No GSTINs added yet. Click "Add GSTIN" to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gstins.map(g => {
            const cfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.pending;
            const stateName = STATE_CODES.find(s => s.code === g.state_code)?.name || g.state_code;
            return (
              <button key={g.id} onClick={() => { setSelected(g); setView('detail'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${g.is_primary ? '#bfdbfe' : '#e2e8f0'}`,
                  background: g.is_primary ? '#eff6ff' : '#fff',
                  transition: 'box-shadow 0.15s',
                }}>
                {g.is_primary && <Star size={14} color="#2563eb" fill="#2563eb" style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', letterSpacing: 0.5 }}>{g.gstin}</div>
                  {g.trade_name && <div style={{ fontSize: 12, color: '#475569', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.trade_name}</div>}
                  {(g.addr1 || g.place) && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[g.place, stateName].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {cfg.icon} {cfg.label}
                </span>
                <ChevronRight size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
