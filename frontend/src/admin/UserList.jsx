import { useState, useEffect, useRef } from 'react';
import { Search, RefreshCw, IndianRupee, CheckCircle, XCircle, Loader2, Paperclip, X, FileText, Image, Gift, Pencil, KeyRound, AlertTriangle } from 'lucide-react';

const STATUS_COLORS = { approved: '#16a34a', pending: '#f59e0b', suspended: '#ef4444', rejected: '#94a3b8' };
const fmt = (paise) => '₹' + (paise / 100).toFixed(2);
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
const TXN_LABELS = {
  credit_admin:    'Admin Credit',
  credit_razorpay: 'UPI Top-up',
  debit_ewb:       'E-Waybill Charge',
  free_ewb:        'E-Waybill (Free)',
};

export default function UserList({ auth }) {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('user');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [walletTab, setWalletTab]   = useState('credit'); // 'credit' | 'debit' | 'creds'
  const [freeUntilDate, setFreeUntilDate] = useState('');
  const [savingFreeUntil, setSavingFreeUntil] = useState(false);
  const [disablingFree, setDisablingFree]     = useState(false);
  const [creditAmt, setCreditAmt]   = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [debitAmt, setDebitAmt]     = useState('');
  const [debitNote, setDebitNote]   = useState('');
  const [receipts, setReceipts]     = useState([]);   // File[] chosen by admin
  const [previews, setPreviews]     = useState([]);   // {url, name, isPdf}[]
  const [saving, setSaving]         = useState(false);
  const [uploadingTxnId, setUploadingTxnId] = useState(null); // txn-level upload
  const fileRef    = useRef();
  const txnFileRef = useRef();        // hidden input for per-txn upload
  const pendingTxnId = useRef(null);  // tracks which txn the picker was opened for

  /* ── load user list ── */
  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ role: filter });
    if (search) params.append('search', search);
    fetch(`/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  /* ── load detail for selected user ── */
  const loadDetail = (id) => {
    setSelected(id); setDetail(null);
    fetch(`/api/admin/users/${id}/details`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json()).then(d => {
        setDetail(d);
        // Pre-fill free_until date picker if already set
        const fu = d?.user?.free_until;
        if (fu) {
          const localDate = new Date(fu).toISOString().slice(0, 10); // YYYY-MM-DD
          setFreeUntilDate(localDate);
        } else {
          setFreeUntilDate('');
        }
      });
  };

  /* ── approve / suspend ── */
  const updateStatus = async (id, status) => {
    setSaving(true);
    await fetch(`/api/admin/users/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ status }),
    });
    setSaving(false); load(); if (detail) loadDetail(id);
  };

  /* ── set free-until date ── */
  const saveFreeUntil = async (id) => {
    setSavingFreeUntil(true);
    const res = await fetch(`/api/admin/users/${id}/free-until`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ free_until: freeUntilDate || null }),
    });
    const d = await res.json();
    setSavingFreeUntil(false);
    if (d.success) { load(); loadDetail(id); }
    else alert('Error: ' + d.error);
  };

  /* ── disable ALL free access immediately ── */
  const disableFreeAccess = async (id) => {
    if (!window.confirm('Disable free access immediately? Charges will apply from now.')) return;
    setDisablingFree(true);
    await Promise.all([
      fetch(`/api/admin/users/${id}/free-until`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ free_until: null }),
      }),
      fetch(`/api/admin/users/${id}/free-ewb`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ free: false }),
      }),
    ]);
    setFreeUntilDate('');
    setDisablingFree(false);
    load(); loadDetail(id);
  };

  /* ── toggle free EWB ── */
  const toggleFree = async (id, currentFree) => {
    const next = !currentFree;
    const label = next ? 'FREE (no charge)' : 'paid (charges apply)';
    if (!window.confirm(`Mark this business as ${label}?`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${id}/free-ewb`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ free: next }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) { load(); loadDetail(id); }
    else alert('Error: ' + d.error);
  };

  /* ── receipt file picker ── */
  const handleReceiptFiles = (e) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    e.target.value = '';
  };

  const addFiles = (files) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const valid = files.filter(f => allowed.includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) alert('Only JPG/PNG/WEBP/PDF under 5 MB accepted.');
    const newPreviews = valid.map(f => ({
      url: f.type === 'application/pdf' ? null : URL.createObjectURL(f),
      name: f.name,
      isPdf: f.type === 'application/pdf',
    }));
    setReceipts(prev => [...prev, ...valid].slice(0, 5));
    setPreviews(prev => [...prev, ...newPreviews].slice(0, 5));
  };

  const removeReceipt = (i) => {
    if (previews[i]?.url) URL.revokeObjectURL(previews[i].url);
    setReceipts(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const clearReceipts = () => {
    previews.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); });
    setReceipts([]); setPreviews([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── per-transaction receipt upload ── */
  const openTxnReceiptPicker = (txnId) => {
    pendingTxnId.current = txnId;
    txnFileRef.current?.click();
  };

  const handleTxnReceiptFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !pendingTxnId.current) return;
    const txnId = pendingTxnId.current;
    setUploadingTxnId(txnId);
    const fd = new FormData();
    files.forEach(f => fd.append('receipts', f));
    const res = await fetch(`/api/admin/transactions/${txnId}/receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
      body: fd,
    });
    const d = await res.json();
    setUploadingTxnId(null);
    if (d.success) {
      loadDetail(selected); // refresh detail to show new receipts
    } else {
      alert('Upload failed: ' + d.error);
    }
  };

  /* ── Edit business details ── */
  const [editForm, setEditForm]   = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMsg, setEditMsg]     = useState('');

  const openEditTab = (user) => {
    setWalletTab('edit');
    setEditMsg('');
    setEditForm({
      trade_name: user.trade_name || '',
      full_name:  user.full_name  || '',
      mobile:     user.mobile     || '',
      addr1:      user.addr1      || '',
      addr2:      user.addr2      || '',
      place:      user.place      || '',
      pincode:    user.pincode    || '',
      state_code: user.state_code || '29',
    });
  };

  const doSaveEdit = async (id) => {
    setSavingEdit(true); setEditMsg('');
    const res = await fetch(`/api/admin/users/${id}/details`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(editForm),
    });
    const d = await res.json();
    setSavingEdit(false);
    if (d.success) {
      setEditMsg('✓ Details updated successfully');
      load(); loadDetail(id);
    } else {
      setEditMsg('Error: ' + d.error);
    }
  };

  /* ── NIC credentials update (admin) ── */
  const [credsForm, setCredsForm] = useState({ gstin: '', ewbUsername: '', ewbPassword: '' });
  const [savingCreds, setSavingCreds] = useState(false);

  const openCredsTab = (user) => {
    setWalletTab('creds');
    setCredsForm({ gstin: user.gstin || '', ewbUsername: user.ewb_username || '', ewbPassword: '' });
  };

  const doSaveCreds = async (id) => {
    if (!credsForm.gstin && !credsForm.ewbUsername && !credsForm.ewbPassword)
      return alert('Enter at least one field to update');
    setSavingCreds(true);
    const res = await fetch(`/api/admin/users/${id}/credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({
        gstin:       credsForm.gstin       || undefined,
        ewbUsername: credsForm.ewbUsername !== undefined ? credsForm.ewbUsername : undefined,
        ewbPassword: credsForm.ewbPassword || undefined,
      }),
    });
    const d = await res.json();
    setSavingCreds(false);
    if (d.success) {
      alert(`Credentials updated for ${d.user.app_username}`);
      setCredsForm(p => ({ ...p, ewbPassword: '' }));
      load(); loadDetail(id);
    } else {
      alert('Error: ' + d.error);
    }
  };

  /* ── credit wallet (multipart) ── */
  const doCredit = async (id) => {
    if (!creditAmt || parseFloat(creditAmt) <= 0) return alert('Enter a valid amount');
    setSaving(true);
    const fd = new FormData();
    fd.append('amount', creditAmt);
    fd.append('note', creditNote || 'Admin credit');
    receipts.forEach(f => fd.append('receipts', f));

    const res = await fetch(`/api/admin/users/${id}/credit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
      body: fd,
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      const msg = d.receiptCount
        ? `Credited! New balance: ${fmt(d.balance)} · ${d.receiptCount} receipt(s) saved.`
        : `Credited! New balance: ${fmt(d.balance)}`;
      alert(msg);
      setCreditAmt(''); setCreditNote(''); clearReceipts();
      load(); if (detail) loadDetail(id);
    } else {
      alert('Error: ' + d.error);
    }
  };

  /* ── debit wallet ── */
  const doDebit = async (id) => {
    if (!debitAmt || parseFloat(debitAmt) <= 0) return alert('Enter a valid amount to debit');
    if (!window.confirm(`Deduct ₹${debitAmt} from this user's wallet?\nReason: ${debitNote || '(none)'}`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${id}/debit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ amount: debitAmt, note: debitNote || 'Admin adjustment' }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      alert(`Debited ₹${debitAmt}. New balance: ${fmt(d.balance)}`);
      setDebitAmt(''); setDebitNote('');
      load(); if (detail) loadDetail(id);
    } else {
      alert('Error: ' + d.error);
    }
  };

  /* ── receipt URL helper (opens file in new tab) ── */
  const receiptUrl = (filename) =>
    `/api/admin/receipts/${encodeURIComponent(filename)}?token=${encodeURIComponent(auth.token)}`;

  return (
    <div className="admin-section">
      {/* Hidden file input for per-transaction receipt upload */}
      <input
        ref={txnFileRef} type="file" multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={handleTxnReceiptFiles}
      />

      <h2 className="admin-section-title">👥 User Management</h2>

      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <Search size={14} />
          <input
            placeholder="Search by name, GSTIN, username…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="admin-select">
          <option value="user">Businesses</option>
          <option value="accountant">Accountants</option>
          <option value="employee">Employees</option>
        </select>
        <button className="admin-btn-sm" onClick={load}><RefreshCw size={14} /></button>
      </div>

      <div className="admin-grid-2" style={{ alignItems: 'flex-start' }}>

        {/* ── User table ── */}
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <div className="admin-loading">Loading…</div> : (
            <table className="admin-table" style={{ margin: 0 }}>
              <thead><tr><th>{filter === 'accountant' ? 'Name' : 'Business'}</th><th>Status</th><th>Balance</th></tr></thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={3} className="admin-empty center">No users found</td></tr>
                )}
                {users.map(u => (
                  <tr
                    key={u.id}
                    className={selected === u.id ? 'row-selected' : ''}
                    onClick={() => loadDetail(u.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div className="bold" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {u.full_name || u.trade_name}
                        {u.free_ewb ? (
                          <span style={{ fontSize: '10px', fontWeight: '700', color: '#fff', background: '#16a34a',
                            borderRadius: '4px', padding: '1px 5px', letterSpacing: '0.05em' }}>FREE</span>
                        ) : null}
                        {u.role === 'user' && !u.has_ewb_password ? (
                          <span title="NIC password not set — user cannot generate e-waybills"
                            style={{ fontSize: '10px', fontWeight: '700', color: '#fff', background: '#dc2626',
                              borderRadius: '4px', padding: '1px 5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <KeyRound size={9} /> NO PWD
                          </span>
                        ) : null}
                      </div>
                      <div className="muted mono small">{u.app_username}</div>
                    </td>
                    <td>
                      <span className="status-dot" style={{ background: STATUS_COLORS[u.status] || '#94a3b8' }} />
                      {u.status}
                    </td>
                    <td className="bold">{fmt(u.wallet_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selected && (
          <div className="admin-card">
            {!detail ? <div className="admin-loading">Loading details…</div> : (
              <>
                <h3 className="admin-card-title">{detail.user?.trade_name}</h3>

                {/* ── NIC password missing warning ── */}
                {detail.user?.role === 'user' && !detail.user?.has_ewb_password && (
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '10px', marginBottom: '12px', padding: '10px 12px',
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#dc2626' }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                      <span><strong>NIC password not set.</strong> This user cannot generate e-waybills until credentials are saved.</span>
                    </div>
                    <button
                      onClick={() => openCredsTab(detail.user)}
                      style={{
                        flexShrink: 0, padding: '4px 10px', fontSize: '12px', fontWeight: '600',
                        background: '#dc2626', color: '#fff', border: 'none',
                        borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                      }}
                    >
                      <KeyRound size={12} /> Fix Now
                    </button>
                  </div>
                )}

                <div className="detail-row"><span>Username</span><span>{detail.user?.app_username}</span></div>
                <div className="detail-row"><span>GSTIN</span><span className="mono">{detail.user?.gstin}</span></div>
                <div className="detail-row"><span>Status</span>
                  <span style={{ color: STATUS_COLORS[detail.user?.status] }}>{detail.user?.status}</span>
                </div>
                <div className="detail-row"><span>Balance</span>
                  <span className="bold">{fmt(detail.user?.wallet_balance || 0)}</span>
                </div>
                <div className="detail-row"><span>E-Waybills</span><span>{detail.ewbs?.length || 0} recent</span></div>
                <div className="detail-row">
                  <span>EWB Charge</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {detail.user?.free_ewb ? (
                      <span style={{ color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Gift size={13} /> Free (no charge)
                      </span>
                    ) : (
                      <span style={{ color: '#64748b' }}>Standard charge applies</span>
                    )}
                  </span>
                </div>

                {/* ── Status actions ── */}
                <div className="admin-action-group">
                  {detail.user?.status !== 'approved' && (
                    <button className="admin-btn-approve" onClick={() => updateStatus(detail.user.id, 'approved')} disabled={saving}>
                      <CheckCircle size={14} /> Approve
                    </button>
                  )}
                  {detail.user?.status !== 'suspended' && (
                    <button className="admin-btn-danger" onClick={() => updateStatus(detail.user.id, 'suspended')} disabled={saving}>
                      <XCircle size={14} /> Suspend
                    </button>
                  )}
                </div>

                {/* ── Free EWB toggle ── */}
                <div style={{ marginTop: '10px' }}>
                  {detail.user?.free_ewb ? (
                    <button
                      className="admin-btn-sm"
                      style={{ width: '100%', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                               display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={() => toggleFree(detail.user.id, true)}
                      disabled={saving}
                    >
                      <XCircle size={13} /> Remove Free EWB — apply standard charge
                    </button>
                  ) : (
                    <button
                      className="admin-btn-sm"
                      style={{ width: '100%', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                               display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={() => toggleFree(detail.user.id, false)}
                      disabled={saving}
                    >
                      <Gift size={13} /> Mark as Free EWB — no charge deducted
                    </button>
                  )}
                </div>

                {/* ── Free Access Control ── */}
                {(() => {
                  const isFreeUntilActive = detail.user?.free_until && new Date(detail.user.free_until) > new Date();
                  const isFreeEwb         = !!detail.user?.free_ewb;
                  const anyFreeActive     = isFreeUntilActive || isFreeEwb;
                  return (
                    <div style={{ marginTop: '12px', padding: '12px', background: anyFreeActive ? '#f0fdf4' : '#f8fafc', borderRadius: '8px', border: `1px solid ${anyFreeActive ? '#bbf7d0' : '#e2e8f0'}` }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: anyFreeActive ? '#15803d' : '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Gift size={14} />
                          Free Access
                        </div>
                        {/* Disable Now — only when any free access is active */}
                        {anyFreeActive && (
                          <button
                            onClick={() => disableFreeAccess(detail.user.id)}
                            disabled={disablingFree}
                            style={{
                              padding: '4px 10px', fontSize: '12px', fontWeight: '600',
                              background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                              borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                            }}
                          >
                            {disablingFree ? <Loader2 size={12} className="spin" /> : <XCircle size={12} />}
                            Disable Now
                          </button>
                        )}
                      </div>

                      {/* Status */}
                      {isFreeUntilActive ? (
                        <div style={{ fontSize: '12px', color: '#16a34a', marginBottom: '8px' }}>
                          ✅ <strong>Active</strong> — free until <strong>{new Date(detail.user.free_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                        </div>
                      ) : isFreeEwb ? (
                        <div style={{ fontSize: '12px', color: '#16a34a', marginBottom: '8px' }}>
                          ✅ <strong>Permanent free EWB</strong> active
                        </div>
                      ) : detail.user?.free_until ? (
                        <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>
                          ⛔ Expired on {new Date(detail.user.free_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>No free period set — standard charges apply</div>
                      )}

                      {/* Date picker to set/extend free period */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="date"
                          value={freeUntilDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={e => setFreeUntilDate(e.target.value)}
                          style={{ flex: 1, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button
                          className="admin-btn-sm admin-btn-green"
                          onClick={() => saveFreeUntil(detail.user.id)}
                          disabled={savingFreeUntil || !freeUntilDate}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {savingFreeUntil ? <Loader2 size={13} className="spin" /> : <Gift size={13} />}
                          Set Free Until
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
                        While active: EWB, cancellation, OCR &amp; distance all free
                      </div>
                    </div>
                  );
                })()}

                {/* ── Per-User Feature Pricing ── */}
                {(() => {
                  const flags = {
                    ewb_generation_free: !!detail.user?.ewb_generation_free,
                    cancel_free:         !!detail.user?.cancel_free,
                    extend_free:         !!detail.user?.extend_free,
                  };
                  const featureRows = [
                    { key: 'ewb_generation_free', label: 'E-Waybill Generation' },
                    { key: 'cancel_free',          label: 'Cancellation' },
                    { key: 'extend_free',          label: 'Validity Extension' },
                  ];
                  const saveFlags = async (updated) => {
                    try {
                      const r = await fetch(`/api/admin/users/${detail.user.id}/feature-flags`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
                        body: JSON.stringify(updated),
                      });
                      const d = await r.json();
                      if (d.success) {
                        setDetail(prev => ({ ...prev, user: { ...prev.user, ...updated } }));
                        setUsers(prev => prev.map(u => u.id === detail.user.id ? { ...u, ...updated } : u));
                      }
                    } catch {}
                  };
                  return (
                    <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: '#475569', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🎛️ Feature Pricing
                        <span style={{ fontWeight: 400, fontSize: '11px', color: '#94a3b8' }}>(overridden by Free Access when active)</span>
                      </div>
                      {featureRows.map(({ key, label }) => {
                        const isFree = flags[key];
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#334155' }}>{label}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => saveFlags({ ...flags, [key]: true })}
                                style={{
                                  padding: '3px 10px', fontSize: '11px', fontWeight: '600', borderRadius: '5px', cursor: 'pointer',
                                  background: isFree ? '#f0fdf4' : '#f1f5f9', color: isFree ? '#16a34a' : '#94a3b8',
                                  border: `1px solid ${isFree ? '#86efac' : '#e2e8f0'}`,
                                }}
                              >Free</button>
                              <button
                                onClick={() => saveFlags({ ...flags, [key]: false })}
                                style={{
                                  padding: '3px 10px', fontSize: '11px', fontWeight: '600', borderRadius: '5px', cursor: 'pointer',
                                  background: !isFree ? '#fef2f2' : '#f1f5f9', color: !isFree ? '#dc2626' : '#94a3b8',
                                  border: `1px solid ${!isFree ? '#fca5a5' : '#e2e8f0'}`,
                                }}
                              >Chargeable</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── Wallet Credit / Debit tabs ── */}
                <div className="admin-credit-form">
                  <div className="wallet-action-tabs">
                    <button
                      className={`wallet-tab ${walletTab === 'credit' ? 'active-credit' : ''}`}
                      onClick={() => setWalletTab('credit')}
                    >💰 Add Money</button>
                    <button
                      className={`wallet-tab ${walletTab === 'debit' ? 'active-debit' : ''}`}
                      onClick={() => setWalletTab('debit')}
                    >➖ Deduct</button>
                    <button
                      className={`wallet-tab ${walletTab === 'creds' ? 'active-credit' : ''}`}
                      onClick={() => openCredsTab(detail.user)}
                      style={walletTab === 'creds' ? { borderColor: '#0891b2', color: '#0891b2', background: '#e0f2fe' } : {}}
                    >🔑 NIC Creds</button>
                    <button
                      className={`wallet-tab ${walletTab === 'edit' ? 'active-credit' : ''}`}
                      onClick={() => openEditTab(detail.user)}
                      style={walletTab === 'edit' ? { borderColor: '#7c3aed', color: '#7c3aed', background: '#ede9fe' } : {}}
                    ><Pencil size={13} /> Edit</button>
                  </div>

                  {walletTab === 'credit' && (
                    <>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                        <input
                          type="number" min="1" placeholder="Amount (₹)"
                          value={creditAmt} onChange={e => setCreditAmt(e.target.value)}
                          style={{ flex: 1, minWidth: '80px' }}
                        />
                        <input
                          placeholder="Note / reference"
                          value={creditNote} onChange={e => setCreditNote(e.target.value)}
                          style={{ flex: 2, minWidth: '100px' }}
                        />
                      </div>

                      {/* Receipt attachment area */}
                      <div className="receipt-upload-area">
                        <div className="receipt-upload-header">
                          <Paperclip size={13} />
                          <span>Attach payment receipts <span className="muted">(optional · max 5, JPG/PNG/PDF, 5 MB each)</span></span>
                          <button
                            className="receipt-browse-btn"
                            onClick={() => fileRef.current?.click()}
                            disabled={receipts.length >= 5}
                            title="Add files"
                          >
                            + Add
                          </button>
                          <input
                            ref={fileRef} type="file" multiple
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            style={{ display: 'none' }}
                            onChange={handleReceiptFiles}
                          />
                        </div>
                        {previews.length > 0 && (
                          <div className="receipt-thumb-row">
                            {previews.map((p, i) => (
                              <div key={i} className="receipt-thumb">
                                {p.isPdf
                                  ? <div className="receipt-thumb-pdf"><FileText size={20} /><span>{p.name.slice(0, 12)}</span></div>
                                  : <img src={p.url} alt={p.name} className="receipt-thumb-img" />
                                }
                                <button className="receipt-thumb-remove" onClick={() => removeReceipt(i)} title="Remove">
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        className="admin-btn-sm admin-btn-green"
                        style={{ marginTop: '8px', width: '100%' }}
                        onClick={() => doCredit(detail.user.id)}
                        disabled={saving}
                      >
                        {saving ? <><Loader2 size={14} className="spin" /> Crediting…</> : <><IndianRupee size={14} /> Credit Wallet</>}
                      </button>
                    </>
                  )}

                  {walletTab === 'debit' && (
                    <>
                      <div className="debit-warning">
                        ⚠ This will deduct from the user's wallet balance. Use to reverse a wrong credit or apply a fee.
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                        <input
                          type="number" min="1" placeholder="Amount to deduct (₹)"
                          value={debitAmt} onChange={e => setDebitAmt(e.target.value)}
                          style={{ flex: 1, minWidth: '80px' }}
                        />
                        <input
                          placeholder="Reason (required)"
                          value={debitNote} onChange={e => setDebitNote(e.target.value)}
                          style={{ flex: 2, minWidth: '100px' }}
                        />
                      </div>
                      <button
                        className="admin-btn-sm admin-btn-danger"
                        style={{ marginTop: '8px', width: '100%' }}
                        onClick={() => doDebit(detail.user.id)}
                        disabled={saving || !debitAmt || !debitNote.trim()}
                      >
                        {saving ? <><Loader2 size={14} className="spin" /> Processing…</> : <>➖ Deduct ₹{debitAmt || '0'} from Wallet</>}
                      </button>
                    </>
                  )}

                  {walletTab === 'edit' && (
                    <>
                      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', marginBottom: '8px' }}>
                        Update business name, address and contact details. Changes apply immediately.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                          { key: 'trade_name', label: 'Business / Trade Name', placeholder: 'ABC Enterprises' },
                          { key: 'full_name',  label: 'Owner / Contact Name',  placeholder: 'Ravi Kumar' },
                          { key: 'mobile',     label: 'Mobile Number',         placeholder: '9876543210' },
                          { key: 'addr1',      label: 'Address Line 1',        placeholder: 'Door No, Street' },
                          { key: 'addr2',      label: 'Address Line 2',        placeholder: 'Area / Locality' },
                          { key: 'place',      label: 'City / Place',          placeholder: 'Hyderabad' },
                          { key: 'pincode',    label: 'Pincode',               placeholder: '500001' },
                        ].map(({ key, label, placeholder }) => (
                          <div key={key}>
                            <label style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>{label}</label>
                            <input
                              value={editForm[key] || ''}
                              onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                              placeholder={placeholder}
                              maxLength={key === 'pincode' ? 6 : key === 'mobile' ? 10 : 100}
                              style={{ width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>State</label>
                          <select
                            value={editForm.state_code || '29'}
                            onChange={e => setEditForm(p => ({ ...p, state_code: e.target.value }))}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                          >
                            {[
                              ['01','Jammu and Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],
                              ['04','Chandigarh'],['05','Uttarakhand'],['06','Haryana'],
                              ['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],
                              ['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],
                              ['13','Nagaland'],['14','Manipur'],['15','Mizoram'],
                              ['16','Tripura'],['17','Meghalaya'],['18','Assam'],
                              ['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],
                              ['22','Chhattisgarh'],['23','Madhya Pradesh'],['24','Gujarat'],
                              ['26','Dadra and Nagar Haveli'],['27','Maharashtra'],
                              ['28','Andhra Pradesh (Old)'],['29','Karnataka'],['30','Goa'],
                              ['31','Lakshadweep'],['32','Kerala'],['33','Tamil Nadu'],
                              ['34','Puducherry'],['35','Andaman & Nicobar'],
                              ['36','Telangana'],['37','Andhra Pradesh'],
                            ].map(([code, name]) => (
                              <option key={code} value={code}>{code} — {name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {editMsg && (
                        <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: '600',
                          color: editMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
                          {editMsg}
                        </div>
                      )}
                      <button
                        className="admin-btn-sm"
                        style={{ marginTop: '10px', width: '100%', background: '#7c3aed', color: '#fff',
                                 border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onClick={() => doSaveEdit(detail.user.id)}
                        disabled={savingEdit}
                      >
                        {savingEdit ? <><Loader2 size={13} className="spin" /> Saving…</> : <><Pencil size={13} /> Save Details</>}
                      </button>
                    </>
                  )}

                  {walletTab === 'creds' && (
                    <>
                      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', marginBottom: '8px' }}>
                        Update the business's NIC e-waybill portal login credentials. These are used for every EWB API call.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>GSTIN</label>
                          <input
                            value={credsForm.gstin}
                            onChange={e => setCredsForm(p => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                            placeholder="e.g. 36XXXXX1234X1ZX"
                            maxLength={15}
                            style={{ width: '100%', fontFamily: 'monospace', letterSpacing: 1, boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>NIC Portal Username</label>
                          <input
                            value={credsForm.ewbUsername}
                            onChange={e => setCredsForm(p => ({ ...p, ewbUsername: e.target.value }))}
                            placeholder="NIC username (usually GSTIN)"
                            style={{ width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>NIC Portal Password</label>
                          <input
                            type="password"
                            value={credsForm.ewbPassword}
                            onChange={e => setCredsForm(p => ({ ...p, ewbPassword: e.target.value }))}
                            placeholder="Leave blank to keep current"
                            style={{ width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                      <button
                        className="admin-btn-sm"
                        style={{ marginTop: '10px', width: '100%', background: '#0891b2', color: '#fff',
                                 border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onClick={() => doSaveCreds(detail.user.id)}
                        disabled={savingCreds}
                      >
                        {savingCreds ? <><Loader2 size={13} className="spin" /> Saving…</> : <>🔑 Save NIC Credentials</>}
                      </button>
                    </>
                  )}
                </div>

                {/* ── Transaction history ── */}
                {detail.transactions?.length > 0 && (
                  <div style={{ marginTop: '18px' }}>
                    <div className="bold small" style={{ marginBottom: '8px' }}>💳 Recent Transactions</div>
                    {detail.transactions.slice(0, 10).map(t => (
                      <div key={t.id} className="mini-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ color: t.type.includes('credit') ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                            {t.type.includes('credit') ? '+' : '−'}{fmt(Math.abs(t.amount))}
                          </span>
                          <span className="muted small">{fmtDate(t.created_at)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: '6px' }}>
                          <span className="muted small">{TXN_LABELS[t.type] || t.type} · {t.description}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            {/* Existing receipt links */}
                            {t.receipts?.length > 0 && (
                              <div className="receipt-link-row">
                                {t.receipts.map(r => (
                                  <a
                                    key={r.id}
                                    href={receiptUrl(r.filename)}
                                    target="_blank" rel="noreferrer"
                                    title={r.orig_name}
                                    className="receipt-link-badge"
                                  >
                                    {r.mime_type === 'application/pdf'
                                      ? <><FileText size={11} /> PDF</>
                                      : <><Image size={11} /> IMG</>
                                    }
                                  </a>
                                ))}
                              </div>
                            )}
                            {/* Add receipt to existing transaction */}
                            {t.type === 'credit_admin' && (
                              <button
                                className="receipt-add-btn"
                                onClick={() => openTxnReceiptPicker(t.id)}
                                disabled={uploadingTxnId === t.id}
                                title="Attach receipt to this transaction"
                              >
                                {uploadingTxnId === t.id
                                  ? <Loader2 size={10} className="spin" />
                                  : <Paperclip size={10} />
                                }
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Recent E-Waybills ── */}
                {detail.ewbs?.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div className="bold small" style={{ marginBottom: '8px' }}>🧾 Recent E-Waybills</div>
                    {detail.ewbs.slice(0, 5).map(e => (
                      <div key={e.id} className="mini-row">
                        <span className="mono" style={{ color: '#1a56db' }}>{e.ewb_no}</span>
                        <span className="muted">{fmtDate(e.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
