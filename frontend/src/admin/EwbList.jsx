import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ArrowUpDown, ChevronLeft, ChevronRight, X, FileText, Image } from 'lucide-react';

const STATE_NAMES = {
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','26':'Dadra & NH','27':'Maharashtra','28':'Andhra Pradesh (Old)',
  '29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu',
  '34':'Puducherry','35':'Andaman & Nicobar','36':'Telangana','37':'Andhra Pradesh',
};

const STATE_OPTIONS = Object.entries(STATE_NAMES).map(([code, name]) => ({ code, name }));

const fmt = (v) => '₹' + (v / 100).toFixed(2);

export default function EwbList({ auth }) {
  const [ewbs, setEwbs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  const [search,     setSearch]    = useState('');
  const [fromState,  setFromState] = useState('');
  const [toState,    setToState]   = useState('');
  const [dateFrom,   setDateFrom]  = useState('');
  const [dateTo,     setDateTo]    = useState('');
  const [sort,       setSort]      = useState('created_at');
  const [dir,        setDir]       = useState('desc');
  const [page,       setPage]      = useState(1);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ sort, dir, page, limit: LIMIT });
    if (search)    p.set('search',     search);
    if (fromState) p.set('from_state', fromState);
    if (toState)   p.set('to_state',   toState);
    if (dateFrom)  p.set('date_from',  dateFrom);
    if (dateTo)    p.set('date_to',    dateTo);
    fetch(`/api/admin/ewb-list?${p}`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => { setEwbs(d.ewbs || []); setTotal(d.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, fromState, toState, dateFrom, dateTo, sort, dir, page, auth.token]);

  useEffect(() => { load(); }, [load]);

  const toggleSort = (col) => {
    if (sort === col) setDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSort(col); setDir('desc'); }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch(''); setFromState(''); setToState('');
    setDateFrom(''); setDateTo(''); setSort('created_at'); setDir('desc'); setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = search || fromState || toState || dateFrom || dateTo;

  const SortBtn = ({ col, label }) => (
    <button className={`sort-th-btn ${sort === col ? 'active' : ''}`} onClick={() => toggleSort(col)}>
      {label} <ArrowUpDown size={12} />
    </button>
  );

  return (
    <div className="admin-section">
      <div className="section-header-row">
        <h2 className="admin-section-title" style={{ marginBottom: 0 }}>📋 E-Waybill List</h2>
        <div className="section-header-right">
          <span className="total-badge">{total} total</span>
          <button className="admin-btn-sm" onClick={load}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <div className="filter-field filter-search">
          <Search size={14} className="filter-icon" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search EWB no, business, GSTIN…"
          />
        </div>
        <select className="filter-select" value={fromState} onChange={e => { setFromState(e.target.value); setPage(1); }}>
          <option value="">All Source States</option>
          {STATE_OPTIONS.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <select className="filter-select" value={toState} onChange={e => { setToState(e.target.value); setPage(1); }}>
          <option value="">All Dest States</option>
          {STATE_OPTIONS.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <input type="date" className="filter-date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} title="From date" />
        <input type="date" className="filter-date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} title="To date" />
        {hasFilters && (
          <button className="filter-clear-btn" onClick={clearFilters} title="Clear all filters">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="admin-loading">Loading…</div> : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th><SortBtn col="ewb_no" label="EWB No" /></th>
                  <th>Doc No</th>
                  <th><SortBtn col="trade_name" label="Business" /></th>
                  <th>From (State)</th>
                  <th>To (State)</th>
                  <th><SortBtn col="taxable_amt" label="Taxable Amt" /></th>
                  <th><SortBtn col="charge" label="Charge" /></th>
                  <th>Total</th>
                  <th>Docs</th>
                  <th>Mode</th>
                  <th><SortBtn col="created_at" label="Date" /></th>
                </tr>
              </thead>
              <tbody>
                {ewbs.length === 0 && (
                  <tr><td colSpan={11} className="admin-empty center">No e-waybills found</td></tr>
                )}
                {ewbs.map(e => (
                  <tr key={e.id}>
                    <td><span className="mono bold small">{e.ewb_no}</span></td>
                    <td className="mono small">{e.doc_no || '—'}</td>
                    <td>
                      <div className="bold small">{e.trade_name}</div>
                      <div className="muted small">{e.app_username}</div>
                      {e.place && <div className="muted small">{e.place}</div>}
                    </td>
                    <td>
                      <div className="mono small">{e.from_gstin}</div>
                      {e.from_gstin?.length >= 2 && (
                        <div className="muted small">{STATE_NAMES[e.from_gstin.slice(0,2)] || e.from_gstin.slice(0,2)}</div>
                      )}
                    </td>
                    <td>
                      <div className="mono small">{e.to_gstin}</div>
                      {e.to_gstin?.length >= 2 && (
                        <div className="muted small">{STATE_NAMES[e.to_gstin.slice(0,2)] || e.to_gstin.slice(0,2)}</div>
                      )}
                    </td>
                    <td className="bold small">₹{Number(e.taxable_amt || 0).toLocaleString('en-IN')}</td>
                    <td className="small">{fmt(e.charge)}{e.gst_rate > 0 && <div className="muted small">+{e.gst_rate}% GST</div>}</td>
                    <td className="small bold">{e.total_charge ? fmt(e.total_charge) : '—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {e.invoice_filename && (
                          <a href={`/api/eway/invoice/${encodeURIComponent(e.invoice_filename)}?token=${encodeURIComponent(auth.token)}`}
                             target="_blank" rel="noreferrer" className="receipt-link-badge" title="Invoice">
                            <FileText size={11}/> INV
                          </a>
                        )}
                        {e.scan_filename && (
                          <a href={`/api/eway/scan/${encodeURIComponent(e.scan_filename)}?token=${encodeURIComponent(auth.token)}`}
                             target="_blank" rel="noreferrer" className="receipt-link-badge" title="Original scan">
                            <Image size={11}/> SCAN
                          </a>
                        )}
                        {!e.invoice_filename && !e.scan_filename && <span className="muted small">—</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`mode-badge ${e.mode}`}>{e.mode}</span>
                    </td>
                    <td className="muted small">{new Date(e.created_at).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="pagination-bar">
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="page-info">Page {page} of {totalPages}</span>
          <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
