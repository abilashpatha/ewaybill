import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, BarChart2, MapPin } from 'lucide-react';

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

const fmtRs = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const BAR_COLORS = [
  '#4f46e5','#7c3aed','#2563eb','#0891b2','#059669',
  '#d97706','#dc2626','#db2777','#65a30d','#0284c7',
];

export default function Reports({ auth }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [type,     setType]    = useState('ewb');
  const [groupBy,  setGroupBy] = useState('user_state');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const GROUP_OPTIONS = type === 'ewb'
    ? [
        { value: 'user_state',  label: 'State (Registered)' },
        { value: 'source_state',label: 'State (Source GSTIN)' },
        { value: 'dest_state',  label: 'State (Destination GSTIN)' },
        { value: 'city',        label: 'City / Place' },
      ]
    : [
        { value: 'user_state',  label: 'State (Registered)' },
        { value: 'city',        label: 'City / Place' },
      ];

  // Keep groupBy valid when type changes
  const handleTypeChange = (t) => {
    setType(t);
    if (t === 'transaction' && ['source_state','dest_state'].includes(groupBy)) {
      setGroupBy('user_state');
    }
  };

  const load = useCallback(() => {
    setLoading(true); setError('');
    const p = new URLSearchParams({ type, groupBy });
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    fetch(`/api/admin/reports?${p}`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success) setData(d.data || []);
        else setError(d.error || 'Failed to load report');
        setLoading(false);
      })
      .catch(() => { setError('Network error'); setLoading(false); });
  }, [type, groupBy, dateFrom, dateTo, auth.token]);

  useEffect(() => { load(); }, [load]);

  const maxCount = data.reduce((m, r) => Math.max(m, r.count), 1);

  const labelFor = (key) => {
    if (['user_state','source_state','dest_state'].includes(groupBy)) {
      return STATE_NAMES[key] || `State ${key}`;
    }
    return key || '(Unknown)';
  };

  const totalCount  = data.reduce((s, r) => s + r.count, 0);
  const totalTaxable = type === 'ewb' ? data.reduce((s, r) => s + (r.total_taxable || 0), 0) : 0;
  const totalCharge  = type === 'ewb' ? data.reduce((s, r) => s + (r.total_charge  || 0), 0) : 0;
  const totalCredit  = type === 'transaction' ? data.reduce((s, r) => s + (r.total_credit || 0), 0) : 0;
  const totalDebit   = type === 'transaction' ? data.reduce((s, r) => s + (r.total_debit  || 0), 0) : 0;

  return (
    <div className="admin-section">
      <div className="section-header-row">
        <h2 className="admin-section-title" style={{ marginBottom: 0 }}>📈 Geographic Reports</h2>
        <button className="admin-btn-sm" onClick={load}><RefreshCw size={14} /></button>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="report-controls">
        <div className="report-control-group">
          <label>Report Type</label>
          <div className="toggle-group">
            <button className={`toggle-btn ${type === 'ewb' ? 'active' : ''}`} onClick={() => handleTypeChange('ewb')}>
              📋 E-Waybills
            </button>
            <button className={`toggle-btn ${type === 'transaction' ? 'active' : ''}`} onClick={() => handleTypeChange('transaction')}>
              💳 Transactions
            </button>
          </div>
        </div>
        <div className="report-control-group">
          <label>Group By</label>
          <select className="filter-select" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="report-control-group">
          <label>Date Range</label>
          <div className="date-range-pair">
            <input type="date" className="filter-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
            <span className="date-sep">–</span>
            <input type="date" className="filter-date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
          </div>
        </div>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────── */}
      <div className="report-summary-row">
        <div className="report-stat-card">
          <div className="rsc-value">{totalCount.toLocaleString('en-IN')}</div>
          <div className="rsc-label">{type === 'ewb' ? 'Total EWBs' : 'Total Transactions'}</div>
        </div>
        {type === 'ewb' && (
          <>
            <div className="report-stat-card">
              <div className="rsc-value">₹{Number(totalTaxable).toLocaleString('en-IN')}</div>
              <div className="rsc-label">Total Taxable Value</div>
            </div>
            <div className="report-stat-card">
              <div className="rsc-value">{fmtRs(totalCharge)}</div>
              <div className="rsc-label">Total EWB Charges</div>
            </div>
          </>
        )}
        {type === 'transaction' && (
          <>
            <div className="report-stat-card green">
              <div className="rsc-value">{fmtRs(totalCredit)}</div>
              <div className="rsc-label">Total Credits</div>
            </div>
            <div className="report-stat-card red">
              <div className="rsc-value">{fmtRs(totalDebit)}</div>
              <div className="rsc-label">Total Debits</div>
            </div>
          </>
        )}
        <div className="report-stat-card">
          <div className="rsc-value">{data.length}</div>
          <div className="rsc-label">
            <MapPin size={13} style={{ verticalAlign: 'middle' }} />
            {' '}{['user_state','source_state','dest_state'].includes(groupBy) ? 'States' : 'Cities'}
          </div>
        </div>
      </div>

      {error && <div className="admin-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {loading ? <div className="admin-loading">Loading report…</div> : data.length === 0 ? (
        <div className="admin-card">
          <div className="admin-empty center" style={{ padding: '48px' }}>
            <BarChart2 size={40} color="#cbd5e1" />
            <p style={{ marginTop: '12px', color: '#94a3b8' }}>No data for the selected filters</p>
          </div>
        </div>
      ) : (
        <div className="report-body">
          {/* Bar chart */}
          <div className="admin-card report-chart-card">
            <h3 className="admin-card-title">
              {type === 'ewb' ? 'EWBs by ' : 'Transactions by '}
              {GROUP_OPTIONS.find(o => o.value === groupBy)?.label}
            </h3>
            <div className="report-bars">
              {data.slice(0, 15).map((row, i) => (
                <div key={row.group_key} className="report-bar-row">
                  <div className="report-bar-label" title={labelFor(row.group_key)}>
                    {labelFor(row.group_key)}
                  </div>
                  <div className="report-bar-track">
                    <div
                      className="report-bar-fill"
                      style={{
                        width: `${Math.max(2, (row.count / maxCount) * 100)}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                    />
                  </div>
                  <div className="report-bar-val">{row.count.toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Data table */}
          <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 className="admin-card-title" style={{ margin: 0 }}>Detailed Breakdown</h3>
            </div>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{['user_state','source_state','dest_state'].includes(groupBy) ? 'State' : 'City'}</th>
                    <th>Count</th>
                    {type === 'ewb' && <>
                      <th>Total Taxable Value</th>
                      <th>Total Charges</th>
                    </>}
                    {type === 'transaction' && <>
                      <th>Total Credits</th>
                      <th>Total Debits</th>
                    </>}
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.group_key}>
                      <td className="muted small">{i + 1}</td>
                      <td>
                        <div className="bold small">{labelFor(row.group_key)}</div>
                        {['user_state','source_state','dest_state'].includes(groupBy) && (
                          <div className="muted small mono">Code: {row.group_key}</div>
                        )}
                      </td>
                      <td className="bold">{row.count.toLocaleString('en-IN')}</td>
                      {type === 'ewb' && <>
                        <td>₹{Number(row.total_taxable || 0).toLocaleString('en-IN')}</td>
                        <td>{fmtRs(row.total_charge || 0)}</td>
                      </>}
                      {type === 'transaction' && <>
                        <td style={{ color: '#16a34a' }}>{fmtRs(row.total_credit || 0)}</td>
                        <td style={{ color: '#dc2626' }}>{fmtRs(row.total_debit  || 0)}</td>
                      </>}
                      <td>
                        <div className="share-bar-wrap">
                          <div
                            className="share-bar"
                            style={{ width: `${(row.count / totalCount * 100).toFixed(1)}%` }}
                          />
                          <span className="share-pct">{(row.count / totalCount * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
