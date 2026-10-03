import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, FileText, ChevronDown, ChevronUp, Building2 } from 'lucide-react';

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
const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

// Build list of months (last 24 months)
function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    opts.push({ value: `${y}-${m}`, label });
  }
  return opts;
}

// Build financial year quarter options
function getQuarterOptions() {
  const opts = [];
  const now = new Date();
  const currentFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  for (let fy = currentFy; fy >= currentFy - 2; fy--) {
    ['Q4', 'Q3', 'Q2', 'Q1'].forEach(q => {
      opts.push({ value: `${fy}-${q}`, label: `${q} FY ${fy}-${String(fy + 1).slice(2)}` });
    });
  }
  return opts;
}

// Returns the most recently completed quarter value (e.g. '2025-Q4')
function getDefaultQtrPeriod() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const fy = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  if (month >= 4 && month <= 6)  return `${fy - 1}-Q4`; // Q1 running → prev Q4
  if (month >= 7 && month <= 9)  return `${fy}-Q1`;     // Q2 running → Q1
  if (month >= 10 && month <= 12) return `${fy}-Q2`;    // Q3 running → Q2
  return `${fy}-Q3`;                                     // Q4 running → Q3
}

// Build financial year options (last 5 years)
function getFyOptions() {
  const opts = [];
  const now = new Date();
  const currentFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  for (let fy = currentFy; fy >= currentFy - 4; fy--) {
    opts.push({ value: `${fy}-${String(fy + 1).slice(2)}`, label: `FY ${fy}-${String(fy + 1).slice(2)}` });
  }
  return opts;
}

// Returns the most recently completed FY (e.g. '2025-26' when current month is Apr-Jun of next FY)
function getDefaultFyPeriod() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const fy = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  // If we're in Q1 of new FY (Apr-Jun), very little data in current FY — default to previous
  if (month >= 4 && month <= 6) return `${fy - 1}-${String(fy).slice(2)}`;
  return `${fy}-${String(fy + 1).slice(2)}`;
}

const PERIOD_TYPES = [
  { id: 'month',   label: '📅 Monthly' },
  { id: 'quarter', label: '📆 Quarterly' },
  { id: 'year',    label: '🗓️ Financial Year' },
  { id: 'custom',  label: '🎯 Custom Range' },
];

export default function GstReport({ auth }) {
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [error,      setError]     = useState('');
  const [expanded,   setExpanded]  = useState(null);

  const [periodType,  setPeriodType]  = useState('month');
  const [monthPeriod, setMonthPeriod] = useState(getMonthOptions()[0]?.value || '');
  const [qtrPeriod,   setQtrPeriod]   = useState(getDefaultQtrPeriod);
  const [fyPeriod,    setFyPeriod]    = useState(getDefaultFyPeriod);
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');

  const monthOpts   = getMonthOptions();
  const quarterOpts = getQuarterOptions();
  const fyOpts      = getFyOptions();

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ period_type: periodType });
    if (periodType === 'month')   p.set('period', monthPeriod);
    if (periodType === 'quarter') p.set('period', qtrPeriod);
    if (periodType === 'year')    p.set('period', fyPeriod);
    if (periodType === 'custom')  { p.set('date_from', dateFrom); p.set('date_to', dateTo); }
    return p;
  }, [periodType, monthPeriod, qtrPeriod, fyPeriod, dateFrom, dateTo]);

  const load = useCallback(() => {
    if (periodType === 'custom' && (!dateFrom || !dateTo)) {
      setError('Please select both From and To dates for custom range.');
      return;
    }
    setLoading(true); setError(''); setData(null);
    const p = buildParams();
    fetch(`/api/admin/gst-report?${p}`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success) setData(d);
        else setError(d.error || 'Failed to load report');
        setLoading(false);
      })
      .catch(() => { setError('Network error'); setLoading(false); });
  }, [buildParams, periodType, dateFrom, dateTo, auth.token]);

  useEffect(() => {
    if (periodType !== 'custom') load();
  }, [periodType, monthPeriod, qtrPeriod, fyPeriod]); // eslint-disable-line

  const downloadCsv = () => {
    const p = buildParams();
    p.set('format', 'csv');
    const url = `/api/admin/gst-report?${p}&_token=${encodeURIComponent(auth.token)}`;
    // Fetch with auth header → create blob
    fetch(`/api/admin/gst-report?${p}`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `GST_Report_${data?.period?.label?.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert('Failed to download CSV'));
  };

  const { invoices = [], summary = {}, period = {}, company = {} } = data || {};

  return (
    <div className="admin-section">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="section-header-row" style={{ marginBottom: '20px' }}>
        <div>
          <h2 className="admin-section-title" style={{ marginBottom: '4px' }}>🧾 GST Filing Report</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Generate service charge invoices summary for GSTR-1 / GST portal filing
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="admin-btn-sm" onClick={load} title="Refresh">
            <RefreshCw size={14} />
          </button>
          {data && invoices.length > 0 && (
            <button className="admin-btn-primary-sm" onClick={downloadCsv}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', fontSize: '13px',
                       background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              <Download size={13} /> Download CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Period Selector ─────────────────────────────────────────────── */}
      <div className="admin-card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {PERIOD_TYPES.map(pt => (
            <button
              key={pt.id}
              onClick={() => setPeriodType(pt.id)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                border: periodType === pt.id ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                background: periodType === pt.id ? '#eef2ff' : '#fff',
                color: periodType === pt.id ? '#4f46e5' : '#475569',
                fontWeight: periodType === pt.id ? '600' : '400',
              }}
            >{pt.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {periodType === 'month' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>Month</label>
              <select className="filter-select" value={monthPeriod} onChange={e => setMonthPeriod(e.target.value)}>
                {monthOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {periodType === 'quarter' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>Quarter</label>
              <select className="filter-select" value={qtrPeriod} onChange={e => setQtrPeriod(e.target.value)}>
                {quarterOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {periodType === 'year' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>Financial Year</label>
              <select className="filter-select" value={fyPeriod} onChange={e => setFyPeriod(e.target.value)}>
                {fyOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {periodType === 'custom' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>From Date</label>
                <input type="date" className="filter-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>To Date</label>
                <input type="date" className="filter-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <button className="admin-btn-primary-sm" onClick={load}
                style={{ padding: '7px 16px', background: '#4f46e5', color: '#fff', border: 'none',
                         borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                Apply
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="admin-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {loading && <div className="admin-loading">Loading GST report…</div>}

      {data && (
        <>
          {/* ── Company Info Banner ───────────────────────────────────── */}
          <div className="admin-card" style={{
            marginBottom: '16px', padding: '12px 16px',
            background: '#f8fafc', borderLeft: '4px solid #4f46e5',
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          }}>
            <Building2 size={18} color="#4f46e5" />
            <div style={{ fontSize: '13px' }}>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>{company.name}</span>
              {company.gstin && <span style={{ marginLeft: '12px', color: '#64748b' }}>GSTIN: <b>{company.gstin}</b></span>}
              <span style={{ marginLeft: '12px', color: '#64748b' }}>
                State: <b>{STATE_NAMES[company.stateCode] || company.stateCode}</b>
              </span>
              <span style={{ marginLeft: '12px', color: '#64748b' }}>SAC: <b>{company.sacCode}</b></span>
              {!company.gstin && (
                <span style={{ marginLeft: '12px', color: '#f59e0b', fontWeight: '500' }}>
                  ⚠ Set company GSTIN in Settings
                </span>
              )}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#4f46e5', fontWeight: '600' }}>
              {period.label}
            </div>
          </div>

          {/* ── Summary Cards ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total Invoices',    val: summary.totalInvoices?.toLocaleString('en-IN'), color: '#4f46e5' },
              { label: 'Taxable Value',     val: fmtRs(summary.totalBasePaise || 0),            color: '#0891b2' },
              { label: 'Total GST',         val: fmtRs(summary.totalGstPaise || 0),             color: '#7c3aed' },
              { label: 'CGST',             val: fmtRs(summary.totalCgstPaise || 0),            color: '#059669' },
              { label: 'SGST',             val: fmtRs(summary.totalSgstPaise || 0),            color: '#059669' },
              { label: 'IGST',             val: fmtRs(summary.totalIgstPaise || 0),            color: '#d97706' },
              { label: 'Total Revenue',    val: fmtRs(summary.totalPaise || 0),               color: '#dc2626', bold: true },
            ].map(c => (
              <div key={c.label} className="admin-card" style={{ padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: c.bold ? '18px' : '16px', fontWeight: '700', color: c.color }}>{c.val}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* ── Intra/Inter State split ───────────────────────────────── */}
          {summary.totalInvoices > 0 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div className="admin-card" style={{ padding: '10px 16px', flex: 1, minWidth: '200px',
                background: '#f0fdf4', borderLeft: '3px solid #16a34a' }}>
                <span style={{ fontSize: '13px', color: '#15803d' }}>
                  <b>{summary.intraStateCount}</b> Intra-state supplies → CGST + SGST applicable
                </span>
              </div>
              <div className="admin-card" style={{ padding: '10px 16px', flex: 1, minWidth: '200px',
                background: '#fef3c7', borderLeft: '3px solid #d97706' }}>
                <span style={{ fontSize: '13px', color: '#92400e' }}>
                  <b>{summary.interStateCount}</b> Inter-state supplies → IGST applicable
                </span>
              </div>
            </div>
          )}

          {invoices.length === 0 ? (
            <div className="admin-card">
              <div className="admin-empty center" style={{ padding: '48px' }}>
                <FileText size={40} color="#cbd5e1" />
                <p style={{ marginTop: '12px', color: '#94a3b8' }}>
                  No e-waybill service invoices found for <b>{period.label}</b>
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Download note ────────────────────────────────────── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  <b>{invoices.length}</b> service invoices •&nbsp;
                  Period: <b>{period.startDate}</b> to <b>{period.endDate}</b>
                </div>
                <button onClick={downloadCsv}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', fontSize: '13px',
                           background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer',
                           fontWeight: '500' }}>
                  <Download size={13} /> Export CSV for GST Portal
                </button>
              </div>

              {/* ── Invoice Table ─────────────────────────────────────── */}
              <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-scroll">
                  <table className="admin-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '36px' }}>#</th>
                        <th>Invoice No</th>
                        <th>Date</th>
                        <th>EWB No</th>
                        <th>Customer</th>
                        <th>GSTIN</th>
                        <th>Place</th>
                        <th>SAC</th>
                        <th style={{ textAlign: 'right' }}>Taxable (₹)</th>
                        <th style={{ textAlign: 'right' }}>GST%</th>
                        <th style={{ textAlign: 'right' }}>CGST (₹)</th>
                        <th style={{ textAlign: 'right' }}>SGST (₹)</th>
                        <th style={{ textAlign: 'right' }}>IGST (₹)</th>
                        <th style={{ textAlign: 'right' }}>Total (₹)</th>
                        <th style={{ width: '36px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <>
                          <tr key={inv.invoiceNo}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setExpanded(expanded === inv.srNo ? null : inv.srNo)}>
                            <td className="muted small">{inv.srNo}</td>
                            <td><span className="bold small mono">{inv.invoiceNo}</span></td>
                            <td className="small">{fmtDate(inv.invoiceDate)}</td>
                            <td><span className="small mono">{inv.ewbNo}</span></td>
                            <td>
                              <div className="bold small">{inv.customerName}</div>
                            </td>
                            <td><span className="small mono">{inv.customerGstin}</span></td>
                            <td className="small">{inv.customerPlace}</td>
                            <td className="small mono">{inv.sacCode}</td>
                            <td style={{ textAlign: 'right' }} className="small">
                              {(inv.basePaise / 100).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right' }} className="small">{inv.gstRate}%</td>
                            <td style={{ textAlign: 'right', color: inv.cgstPaise > 0 ? '#059669' : '#cbd5e1' }} className="small">
                              {(inv.cgstPaise / 100).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right', color: inv.sgstPaise > 0 ? '#059669' : '#cbd5e1' }} className="small">
                              {(inv.sgstPaise / 100).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right', color: inv.igstPaise > 0 ? '#d97706' : '#cbd5e1' }} className="small">
                              {(inv.igstPaise / 100).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right' }} className="bold small">
                              {(inv.totalPaise / 100).toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'center', color: '#94a3b8' }}>
                              {expanded === inv.srNo ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </td>
                          </tr>
                          {expanded === inv.srNo && (
                            <tr key={`${inv.srNo}-detail`}>
                              <td colSpan={15}
                                style={{ background: '#f8fafc', padding: '10px 16px', borderTop: 'none' }}>
                                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '12px', color: '#475569' }}>
                                  <div><b>Supply Type:</b> {inv.isIntra ? '🟢 Intra-state (CGST+SGST)' : '🟡 Inter-state (IGST)'}</div>
                                  <div><b>Place of Supply:</b> {STATE_NAMES[inv.placeOfSupply] || inv.placeOfSupply} [{inv.placeOfSupply}]</div>
                                  <div><b>Service:</b> {inv.description}</div>
                                  <div><b>EWB No:</b> {inv.ewbNo}</div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f1f5f9', fontWeight: '700' }}>
                        <td colSpan={8} style={{ textAlign: 'right', paddingRight: '12px', fontSize: '12px' }}>
                          TOTAL ({invoices.length} invoices)
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '12px' }}>
                          {(summary.totalBasePaise / 100).toFixed(2)}
                        </td>
                        <td></td>
                        <td style={{ textAlign: 'right', color: '#059669', fontSize: '12px' }}>
                          {(summary.totalCgstPaise / 100).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', color: '#059669', fontSize: '12px' }}>
                          {(summary.totalSgstPaise / 100).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', color: '#d97706', fontSize: '12px' }}>
                          {(summary.totalIgstPaise / 100).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '12px' }}>
                          {(summary.totalPaise / 100).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Filing Note ───────────────────────────────────────── */}
              <div style={{
                marginTop: '16px', padding: '12px 16px', background: '#eff6ff',
                borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af',
              }}>
                <b>📌 Filing Note:</b> This report covers service charges billed for E-Waybill generation.
                Use the <b>Export CSV</b> button to download the data and upload to the GST portal under
                GSTR-1 (B2B outward supplies) for the period <b>{period.label}</b>.
                SAC code <b>{company.sacCode}</b> — IT / Software services.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
