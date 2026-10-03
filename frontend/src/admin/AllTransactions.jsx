import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, FileText, Image, Paperclip, Loader2, Search, X, ArrowUpDown } from 'lucide-react';

const TYPE_LABELS = {
  credit_razorpay: { label: 'UPI Top-up',      color: '#16a34a' },
  credit_admin:    { label: 'Admin Credit',     color: '#2563eb' },
  debit_ewb:       { label: 'EWB Charge',       color: '#dc2626' },
  debit_admin:     { label: 'Admin Debit',      color: '#ea580c' },
  refund:          { label: 'Refund',           color: '#7c3aed' },
};

const TYPE_OPTIONS = [
  { value: '',               label: 'All Types' },
  { value: 'credit_razorpay',label: 'UPI Top-up' },
  { value: 'credit_admin',   label: 'Admin Credit' },
  { value: 'debit_ewb',      label: 'EWB Charge' },
  { value: 'debit_admin',    label: 'Admin Debit' },
  { value: 'refund',         label: 'Refund' },
];

const fmt = (paise) => {
  const sign = paise >= 0 ? '+' : '';
  return sign + '₹' + (Math.abs(paise) / 100).toFixed(2);
};

export default function AllTransactions({ auth }) {
  const [txns, setTxns]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploadingTxnId, setUploadingTxnId] = useState(null);
  const txnFileRef   = useRef();
  const pendingTxnId = useRef(null);

  // Filters & sort
  const [search,   setSearch]   = useState('');
  const [typeF,    setTypeF]    = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [sort,     setSort]     = useState('created_at');
  const [dir,      setDir]      = useState('desc');

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ sort, dir });
    if (search)   p.set('search',    search);
    if (typeF)    p.set('type',      typeF);
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    fetch(`/api/admin/all-transactions?${p}`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => { setTxns(d.transactions || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, typeF, dateFrom, dateTo, sort, dir, auth.token]);

  useEffect(() => { load(); }, [load]);

  const totalCredits = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalDebits  = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const hasFilters = search || typeF || dateFrom || dateTo;
  const clearFilters = () => { setSearch(''); setTypeF(''); setDateFrom(''); setDateTo(''); };

  const toggleSort = (col) => {
    if (sort === col) setDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSort(col); setDir('desc'); }
  };

  const SortBtn = ({ col, label }) => (
    <button className={`sort-th-btn ${sort === col ? 'active' : ''}`} onClick={() => toggleSort(col)}>
      {label} <ArrowUpDown size={12} />
    </button>
  );

  /* ── receipt helpers ── */
  const receiptUrl = (filename) =>
    `/api/admin/receipts/${encodeURIComponent(filename)}?token=${encodeURIComponent(auth.token)}`;

  const openReceiptPicker = (txnId) => {
    pendingTxnId.current = txnId;
    txnFileRef.current?.click();
  };

  const handleReceiptFiles = async (e) => {
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
    if (d.success) load();
    else alert('Upload failed: ' + d.error);
  };

  return (
    <div className="admin-section">
      <input
        ref={txnFileRef} type="file" multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={handleReceiptFiles}
      />

      <div className="section-header-row">
        <h2 className="admin-section-title" style={{ marginBottom: 0 }}>💳 All Transactions</h2>
        <div className="section-header-right">
          <span className="total-badge">{txns.length} shown</span>
          <button className="admin-btn-sm" onClick={load}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="filter-bar">
        <div className="filter-field filter-search">
          <Search size={14} className="filter-icon" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search business, username, GSTIN…"
          />
        </div>
        <select className="filter-select" value={typeF} onChange={e => setTypeF(e.target.value)}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" className="filter-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
        <input type="date" className="filter-date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   title="To date" />
        {hasFilters && (
          <button className="filter-clear-btn" onClick={clearFilters}><X size={14} /> Clear</button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ borderLeftColor: '#16a34a', flex: 1, minWidth: '160px' }}>
          <div className="stat-body">
            <div className="stat-value" style={{ color: '#16a34a' }}>+₹{(totalCredits / 100).toFixed(2)}</div>
            <div className="stat-label">Total Credits (shown)</div>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#dc2626', flex: 1, minWidth: '160px' }}>
          <div className="stat-body">
            <div className="stat-value" style={{ color: '#dc2626' }}>-₹{(totalDebits / 100).toFixed(2)}</div>
            <div className="stat-label">Total Debits (shown)</div>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="admin-loading">Loading transactions…</div> : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th><SortBtn col="trade_name" label="Business" /></th>
                  <th>Type</th>
                  <th><SortBtn col="amount" label="Amount" /></th>
                  <th>Balance After</th>
                  <th>Description</th>
                  <th>Receipts</th>
                  <th><SortBtn col="created_at" label="Date" /></th>
                </tr>
              </thead>
              <tbody>
                {txns.length === 0 && (
                  <tr><td colSpan={7} className="admin-empty center">No transactions found</td></tr>
                )}
                {txns.map(t => {
                  const meta = TYPE_LABELS[t.type] || { label: t.type, color: '#64748b' };
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="bold small">{t.trade_name}</div>
                        <div className="muted small">{t.app_username}</div>
                        {t.place && <div className="muted small">{t.place}{t.state_code ? ` · ${t.state_code}` : ''}</div>}
                      </td>
                      <td>
                        <span className="type-badge" style={{ background: meta.color + '22', color: meta.color }}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="bold" style={{ color: t.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                        {fmt(t.amount)}
                      </td>
                      <td>₹{(t.balance_after / 100).toFixed(2)}</td>
                      <td className="muted small">{t.description}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {t.receipts?.map(r => (
                            <a key={r.id} href={receiptUrl(r.filename)} target="_blank" rel="noreferrer"
                              title={r.orig_name} className="receipt-link-badge">
                              {r.mime_type === 'application/pdf'
                                ? <><FileText size={11} /> PDF</>
                                : <><Image size={11} /> IMG</>}
                            </a>
                          ))}
                          {t.type === 'credit_admin' && (
                            <button className="receipt-add-btn" onClick={() => openReceiptPicker(t.id)}
                              disabled={uploadingTxnId === t.id} title="Attach receipt">
                              {uploadingTxnId === t.id
                                ? <Loader2 size={10} className="spin" />
                                : <Paperclip size={10} />}
                            </button>
                          )}
                          {t.type !== 'credit_admin' && (!t.receipts || t.receipts.length === 0) && (
                            <span className="muted small">—</span>
                          )}
                        </div>
                      </td>
                      <td className="muted small">{new Date(t.created_at).toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
