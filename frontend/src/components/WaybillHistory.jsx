import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Share2, Trash2, FileText, ChevronDown, ChevronUp, ArrowLeft, RefreshCw, XCircle, Search, CalendarPlus, AlertTriangle, Loader2 } from 'lucide-react';
import { showToast } from './Toast';

/* ── Validity countdown helper ── */
function ValidityCountdown({ validUpto }) {
  if (!validUpto) return null;

  // Parse DD/MM/YYYY HH:mm:ss or ISO or similar
  let expiry;
  const ddmmMatch = validUpto.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (ddmmMatch) {
    expiry = new Date(`${ddmmMatch[3]}-${ddmmMatch[2]}-${ddmmMatch[1]}T${ddmmMatch[4]}`);
  } else {
    expiry = new Date(validUpto);
  }
  if (isNaN(expiry.getTime())) return null;

  const now = new Date();
  const diffMs = expiry - now;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  let text, color;
  if (diffDays > 3) {
    const d = Math.floor(diffDays);
    text = `${d} day${d !== 1 ? 's' : ''} remaining`;
    color = '#16a34a'; // green
  } else if (diffDays > 1) {
    const d = Math.floor(diffDays);
    text = `${d} day${d !== 1 ? 's' : ''} remaining`;
    color = '#ea580c'; // orange
  } else if (diffDays > 0) {
    const h = Math.floor(diffDays * 24);
    text = h > 0 ? `${h}h remaining — Expires today!` : 'Expires today!';
    color = '#dc2626'; // red
  } else {
    const d = Math.abs(Math.floor(diffDays));
    text = d === 0 ? 'Expired today' : `Expired ${d} day${d !== 1 ? 's' : ''} ago`;
    color = '#dc2626'; // red
  }

  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, color,
      background: color === '#16a34a' ? '#f0fdf4' : color === '#ea580c' ? '#fff7ed' : '#fef2f2',
      padding: '2px 8px', borderRadius: 6, marginTop: 2,
    }}>
      {text}
    </span>
  );
}

export default function WaybillHistory({ onClose, token, onBalanceUpdate, filterGstin }) {
  const [history,  setHistory]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [fetching,   setFetching]   = useState({}); // ewbNo → true while re-fetching PDF
  const [cancelling,  setCancelling]  = useState({}); // ewbNo → true while cancelling
  const [extending,   setExtending]   = useState({}); // ewbNo → true while extending
  const [cancelCharge, setCancelCharge] = useState(null);
  const [cancelModal,  setCancelModal]  = useState(null); // { ewbNo } | null
  const [extendModal,  setExtendModal]  = useState(null); // { ewbNo } | null
  const [manualCancelModal, setManualCancelModal] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'cancelled'
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month'

  const limit = 20;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    setLoadError(null);
    try {
      const gsParam = filterGstin ? `&gstin=${encodeURIComponent(filterGstin)}` : '';
      const r = await fetch(`/api/eway/history?page=${pg}&limit=${limit}${gsParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) { setHistory(d.logs); setTotal(d.total); setPage(pg); }
      else { setLoadError(d.error || 'Failed to load history'); }
    } catch (e) { setLoadError('Network error loading history'); }
    setLoading(false);
  }, [token, filterGstin]);

  useEffect(() => { load(1); }, [load]);

  // Fetch cancel charge once on mount
  useEffect(() => {
    fetch('/api/eway/cancel-charge', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setCancelCharge(d); })
      .catch(() => {});
  }, [token]);

  const pages = Math.max(1, Math.ceil(total / limit));

  // Detect Capacitor Android (app) vs regular browser
  const isCapacitor = !!(window.Capacitor?.isNativePlatform?.());

  /**
   * Universal file downloader.
   * - Capacitor APK: calls window.Android.downloadFile(base64, filename, mime)
   *   → saves to Downloads folder, shows native notification, tap opens file.
   * - Browser: blob URL + <a download> → browser download bar / notification.
   */
  const downloadFileNative = (blob, filename) => new Promise((resolve, reject) => {
    if (isCapacitor && window.Android?.downloadFile) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const base64 = reader.result.split(',')[1];
          window.Android.downloadFile(base64, filename, blob.type || 'application/pdf');
          resolve();
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } else {
      // Browser (or Capacitor without bridge fallback): blob URL
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      resolve();
    }
  });

  const [downloading, setDownloading] = useState({});
  const downloadPdf = async (ewbNo) => {
    setDownloading(d => ({ ...d, [ewbNo]: true }));
    try {
      const url = `/api/eway/pdf/${ewbNo}?token=${encodeURIComponent(token)}`;
      const r   = await fetch(url);
      if (!r.ok) { showToast('PDF not saved — tap "Fetch PDF from GSP" to regenerate.', 'error'); return; }
      const blob = await r.blob();
      await downloadFileNative(blob, `EWaybill-${ewbNo}.pdf`);
      if (!isCapacitor) showToast('PDF downloaded ✓');
    } catch (e) {
      showToast('Download failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setDownloading(d => ({ ...d, [ewbNo]: false }));
    }
  };

  const [invoiceDownloading, setInvoiceDownloading] = useState({});
  const downloadInvoice = async (filename) => {
    setInvoiceDownloading(d => ({ ...d, [filename]: true }));
    try {
      const url = `/api/eway/invoice/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
      const r   = await fetch(url);
      if (!r.ok) { showToast('Invoice not found on server.', 'error'); return; }
      const blob = await r.blob();
      await downloadFileNative(blob, filename);
      if (!isCapacitor) showToast('Invoice downloaded ✓');
    } catch (e) {
      showToast('Download failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      setInvoiceDownloading(d => ({ ...d, [filename]: false }));
    }
  };

  // Call GSP GETEWBDT → regenerate PDF → save on server
  const fetchFromGsp = async (ewbNo) => {
    setFetching(f => ({ ...f, [ewbNo]: true }));
    try {
      const r = await fetch(`/api/eway/fetch-pdf/${ewbNo}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) {
        // Refresh list to show updated PDF availability
        load(page);
      } else {
        alert(d.error || 'Failed to fetch from GSP');
      }
    } catch { alert('Network error'); }
    setFetching(f => ({ ...f, [ewbNo]: false }));
  };

  const cancelEwb = async (ewbNo, code, remark) => {
    setCancelModal(null);
    setCancelling(c => ({ ...c, [ewbNo]: true }));
    try {
      const r = await fetch(`/api/eway/cancel/${ewbNo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cancelRsnCode: code, cancelRmrk: remark }),
      });
      const d = await r.json();
      if (d.success) {
        if (d.newBalance != null && onBalanceUpdate) onBalanceUpdate(d.newBalance);
        load(page);
      } else {
        alert(d.error || 'Cancellation failed');
      }
    } catch { alert('Network error'); }
    setCancelling(c => ({ ...c, [ewbNo]: false }));
  };

  const extendEwb = async (ewbNo, formData) => {
    setExtendModal(null);
    setExtending(e => ({ ...e, [ewbNo]: true }));
    try {
      const r = await fetch(`/api/eway/extend/${ewbNo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      const d = await r.json();
      if (d.success) {
        showToast('Validity extended successfully');
        load(page);
      } else {
        alert(d.error || 'Extension failed');
      }
    } catch { alert('Network error'); }
    setExtending(e => ({ ...e, [ewbNo]: false }));
  };

  const sharePdf = async (item) => {
    const filename = `EWaybill-${item.ewb_no}.pdf`;
    const text = `E-Waybill\nEWB No: ${item.ewb_no}\nDoc: ${item.doc_no}\nValid Till: ${item.validUpto || '—'}`;
    const pdfUrl = `/api/eway/pdf/${item.ewb_no}?token=${encodeURIComponent(token)}`;

    // APK mode: fetch PDF → base64 → Android bridge share sheet
    if (window.Android?.sharePdf) {
      try {
        const r = await fetch(pdfUrl);
        if (!r.ok) { alert('PDF not found'); return; }
        const blob = await r.blob();
        const reader = new FileReader();
        reader.onload = () => window.Android.sharePdf(reader.result.split(',')[1], filename);
        reader.readAsDataURL(blob);
      } catch { alert('Failed to share PDF'); }
      return;
    }

    // Browser: Web Share API with file
    try {
      const r = await fetch(pdfUrl);
      if (r.ok) {
        const blob = await r.blob();
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: filename, text, files: [file] });
          return;
        }
      }
    } catch (e) { if (e?.name === 'AbortError') return; }

    // Fallback: text-only share
    if (navigator.share) {
      try { await navigator.share({ title: `E-Waybill ${item.ewb_no}`, text }); }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
  };

  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const rupee = (p) => p ? `₹${(p / 100).toLocaleString('en-IN')}` : '—';

  /* ── Client-side filtering ── */
  const filteredHistory = useMemo(() => {
    let list = history;

    // Search filter: EWB number or doc number
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(item =>
        (item.ewb_no && String(item.ewb_no).toLowerCase().includes(q)) ||
        (item.doc_no && item.doc_no.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter === 'active') list = list.filter(item => !item.cancelled);
    else if (statusFilter === 'cancelled') list = list.filter(item => item.cancelled);

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoff;
      if (dateFilter === 'today') cutoff = startOfDay;
      else if (dateFilter === 'week') cutoff = new Date(startOfDay.getTime() - 6 * 86400000);
      else if (dateFilter === 'month') cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      if (cutoff) list = list.filter(item => item.created_at && new Date(item.created_at) >= cutoff);
    }

    return list;
  }, [history, searchQuery, statusFilter, dateFilter]);

  /* ── CSV Export ── */
  const exportCsv = () => {
    const headers = ['EWB No', 'Doc No', 'From GSTIN', 'To GSTIN', 'Amount', 'Date', 'Status'];
    const rows = filteredHistory.map(item => [
      item.ewb_no || '',
      item.doc_no || '',
      item.from_gstin || '',
      item.to_gstin || '',
      parseFloat(item.taxable_amt || 0).toFixed(2),
      item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '',
      item.cancelled ? 'Cancelled' : 'Active',
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const today = new Date().toISOString().split('T')[0];
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ewb_history_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="history-screen">
      <div className="history-header">
        <button className="back-btn" onClick={onClose}><ArrowLeft size={18} /> Back</button>
        <h2><FileText size={18} /> Waybill History ({total})</h2>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn-sm" onClick={() => setManualCancelModal(true)}
            style={{ fontSize: 11, color: '#dc2626', borderColor: '#fecaca', whiteSpace: 'nowrap' }}>
            <XCircle size={12} /> Manual Cancel
          </button>
          <button className="btn-sm btn-primary" onClick={() => load(page)} disabled={loading}>
            {loading ? 'Loading…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Search, Filter & Export bar */}
      {history.length > 0 && (
        <div className="history-filter-bar">
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search EWB or Doc no."
              style={{
                width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, fontSize: 13,
                border: '1.5px solid #e2e8f0', background: '#f8fafc', outline: 'none',
                boxSizing: 'border-box', color: '#1e293b',
              }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '7px 10px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#1e293b',
              outline: 'none', cursor: 'pointer', appearance: 'auto',
            }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{
              padding: '7px 10px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#1e293b',
              outline: 'none', cursor: 'pointer', appearance: 'auto',
            }}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <button
            className="btn-sm"
            onClick={exportCsv}
            style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
            title="Export filtered history as CSV"
          >
            <Download size={13} /> Export CSV
          </button>
          {(searchQuery || statusFilter !== 'all' || dateFilter !== 'all') && (
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {filteredHistory.length} of {history.length} shown
            </span>
          )}
        </div>
      )}

      {loading && history.length === 0 && (
        <div className="history-empty"><span style={{ color: '#64748b' }}>Loading…</span></div>
      )}

      {!loading && loadError && (
        <div className="history-empty">
          <FileText size={56} color="#fca5a5" />
          <p style={{ color: '#dc2626' }}>Error loading history</p>
          <span style={{ color: '#ef4444' }}>{loadError}</span>
        </div>
      )}

      {!loading && !loadError && history.length === 0 && (
        <div className="history-empty">
          <FileText size={56} color="#cbd5e1" />
          <p>No waybills generated yet.</p>
          <span>Your generated e-waybills will appear here.</span>
        </div>
      )}

      {!loading && history.length > 0 && filteredHistory.length === 0 && (
        <div className="history-empty">
          <Search size={40} color="#cbd5e1" />
          <p>No waybills match your filters.</p>
          <span>Try adjusting search or filter criteria.</span>
        </div>
      )}

      {filteredHistory.length > 0 && (
        <div className="history-list">
          {filteredHistory.map(item => {
            const hasPdf = !!item.ewb_pdf_filename;
            return (
              <div key={item.ewb_no} className={`history-item${item.cancelled ? ' history-item--cancelled' : ''}`}>
                <div className="history-item-header" onClick={() => setExpanded(p => p === item.ewb_no ? null : item.ewb_no)}>
                  <div className="history-item-main">
                    <span className="ewb-badge">EWB: {item.ewb_no}</span>
                    {item.cancelled
                      ? <span className="ewb-cancelled-badge">CANCELLED</span>
                      : <span className="history-route">{item.from_gstin?.slice(0, 2)} → {item.to_gstin?.slice(0, 2)}</span>
                    }
                    <span className="history-meta">
                      {item.doc_no} &bull; {fmt(item.created_at)}
                      {item.total_charge > 0 && ` · ${rupee(item.total_charge)}`}
                    </span>
                  </div>
                  {expanded === item.ewb_no ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {expanded === item.ewb_no && (
                  <div className="history-item-details">
                    {item.scan_filename && (
                      <div className="history-scan-thumb">
                        <img
                          src={`/api/eway/scan/${encodeURIComponent(item.scan_filename)}?token=${encodeURIComponent(token)}`}
                          alt="Original scan"
                          className="scan-thumb-img"
                        />
                        <span className="scan-thumb-label">Original Scan</span>
                      </div>
                    )}

                    <div className="history-detail-grid">
                      <div className="history-detail-row"><span>EWB No</span><span>{item.ewb_no}</span></div>
                      <div className="history-detail-row"><span>Doc No</span><span>{item.doc_no}</span></div>
                      <div className="history-detail-row"><span>From GSTIN</span><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.from_gstin}</span></div>
                      <div className="history-detail-row"><span>To GSTIN</span><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.to_gstin || 'URP'}</span></div>
                      <div className="history-detail-row"><span>Taxable Amt</span><span>₹{parseFloat(item.taxable_amt || 0).toLocaleString('en-IN')}</span></div>
                      <div className="history-detail-row"><span>Service Charge</span><span>{item.total_charge > 0 ? rupee(item.total_charge) : 'Free'}</span></div>
                      <div className="history-detail-row"><span>Generated</span><span>{fmt(item.created_at)}</span></div>
                      <div className="history-detail-row">
                        <span>PDF</span>
                        <span style={{ color: hasPdf ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {hasPdf ? '✓ Available' : '✗ Not saved'}
                        </span>
                      </div>
                      <div className="history-detail-row">
                        <span>Status</span>
                        <span style={{ color: item.cancelled ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {item.cancelled ? `Cancelled${item.cancelled_at ? ` on ${fmt(item.cancelled_at)}` : ''}` : 'Active'}
                        </span>
                      </div>
                      {!item.cancelled && (item.valid_upto || item.validUpto) && (
                        <div className="history-detail-row">
                          <span>Validity</span>
                          <span>
                            {item.valid_upto || item.validUpto}
                            <br />
                            <ValidityCountdown validUpto={item.valid_upto || item.validUpto} />
                          </span>
                        </div>
                      )}
                      {item.cancelled && item.cancel_reason && (
                        <div className="history-detail-row">
                          <span>Cancel Reason</span>
                          <span style={{ color: '#dc2626' }}>{item.cancel_reason}</span>
                        </div>
                      )}
                    </div>

                    <div className="history-item-actions">
                      {!item.cancelled && hasPdf && (
                        <>
                          <button
                            className="btn-outline-sm result-action-link"
                            onClick={() => downloadPdf(item.ewb_no)}
                            disabled={downloading[item.ewb_no]}
                          >
                            <Download size={13} /> {downloading[item.ewb_no] ? 'Saving…' : 'Download'}
                          </button>
                          <button className="btn-share-sm" onClick={() => sharePdf(item)}>
                            <Share2 size={13} /> Share
                          </button>
                        </>
                      )}
                      {!item.cancelled && !hasPdf && (
                        <button
                          className="btn-primary"
                          style={{ fontSize: 12, padding: '4px 10px', width: 'auto' }}
                          onClick={() => fetchFromGsp(item.ewb_no)}
                          disabled={fetching[item.ewb_no]}
                        >
                          <RefreshCw size={13} /> {fetching[item.ewb_no] ? 'Fetching…' : 'Fetch PDF from GSP'}
                        </button>
                      )}
                      {item.invoice_filename && (
                        <button className="btn-invoice-sm"
                          onClick={() => downloadInvoice(item.invoice_filename)}
                          disabled={invoiceDownloading[item.invoice_filename]}
                        >
                          {invoiceDownloading[item.invoice_filename]
                            ? <><Loader2 size={13} className="spin" /> Downloading…</>
                            : <><Download size={13} /> Invoice</>}
                        </button>
                      )}
                      {!item.cancelled && hasPdf && (
                        <button
                          className="btn-sm"
                          style={{ fontSize: 11, color: '#64748b' }}
                          onClick={() => fetchFromGsp(item.ewb_no)}
                          disabled={fetching[item.ewb_no]}
                          title="Re-fetch latest data from GSP and regenerate PDF"
                        >
                          <RefreshCw size={12} /> {fetching[item.ewb_no] ? '…' : 'Refresh'}
                        </button>
                      )}
                      {!item.cancelled && (
                        <button
                          className="btn-sm"
                          style={{ fontSize: 11, color: '#2563eb', borderColor: '#bfdbfe', whiteSpace: 'nowrap' }}
                          onClick={() => setExtendModal({ ewbNo: item.ewb_no })}
                          disabled={extending[item.ewb_no]}
                          title="Extend validity of this E-Waybill"
                        >
                          <CalendarPlus size={13} /> {extending[item.ewb_no] ? 'Extending…' : 'Extend Date'}
                        </button>
                      )}
                      {!item.cancelled && (
                        <button
                          className="btn-cancel-sm"
                          onClick={() => setCancelModal({ ewbNo: item.ewb_no })}
                          disabled={cancelling[item.ewb_no]}
                          title="Cancel this E-Waybill on GSP"
                        >
                          <XCircle size={13} /> {cancelling[item.ewb_no] ? 'Cancelling…' : 'Cancel EWB'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          <button className="btn-sm" onClick={() => load(page - 1)} disabled={page <= 1 || loading}>‹ Prev</button>
          <span style={{ lineHeight: '28px', fontSize: 13 }}>Page {page} / {pages}</span>
          <button className="btn-sm" onClick={() => load(page + 1)} disabled={page >= pages || loading}>Next ›</button>
        </div>
      )}

      {cancelModal && (
        <CancelModal
          ewbNo={cancelModal.ewbNo}
          cancelCharge={cancelCharge}
          onConfirm={(code, remark) => cancelEwb(cancelModal.ewbNo, code, remark)}
          onClose={() => setCancelModal(null)}
        />
      )}

      {extendModal && (
        <ExtendModal
          ewbNo={extendModal.ewbNo}
          onConfirm={(formData) => extendEwb(extendModal.ewbNo, formData)}
          onClose={() => setExtendModal(null)}
        />
      )}

      {manualCancelModal && (
        <ManualCancelModal
          token={token}
          onDone={() => { setManualCancelModal(false); load(page); }}
          onClose={() => setManualCancelModal(false)}
        />
      )}
    </div>
  );
}

const CANCEL_REASONS = [
  { code: 1, label: 'Duplicate' },
  { code: 2, label: 'Order Cancelled' },
  { code: 3, label: 'Data Entry Mistake' },
  { code: 4, label: 'Others' },
];

function CancelModal({ ewbNo, cancelCharge, onConfirm, onClose }) {
  const [reasonCode, setReasonCode] = useState(2);
  const [remark, setRemark] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'confirm'

  const hasFee = cancelCharge && !cancelCharge.free && cancelCharge.totalPaise > 0;
  const feeAmt = hasFee ? `₹${(cancelCharge.paise / 100).toFixed(2)}` : null;
  const totalAmt = hasFee ? `₹${(cancelCharge.totalPaise / 100).toFixed(2)}` : null;
  const reasonLabel = CANCEL_REASONS.find(r => r.code === reasonCode)?.label;

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d1d5db' }} />
        </div>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0',
        }}>
          <XCircle size={20} color="#fff" />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Cancel E-Waybill</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>EWB No: {ewbNo}</div>
          </div>
        </div>

        <div style={{ padding: '16px 16px 32px' }}>
          {step === 'form' ? (
            <>
              {/* Reason dropdown */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Cancellation Reason <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={reasonCode}
                  onChange={e => setReasonCode(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1.5px solid #d1d5db', fontSize: 14, background: '#f9fafb',
                    outline: 'none', cursor: 'pointer', color: '#111827',
                    appearance: 'auto',
                  }}
                >
                  {CANCEL_REASONS.map(r => (
                    <option key={r.code} value={r.code}>{r.code}. {r.label}</option>
                  ))}
                </select>
              </div>

              {/* Remark */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Remark <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  placeholder="Enter any additional notes…"
                  maxLength={100}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1.5px solid #d1d5db', fontSize: 14, background: '#f9fafb',
                    outline: 'none', boxSizing: 'border-box', color: '#111827',
                  }}
                />
              </div>

              {/* Fee warning */}
              {hasFee && (
                <div style={{
                  background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 16, fontSize: 13,
                }}>
                  <div style={{ fontWeight: 600, color: '#c2410c', marginBottom: 2 }}>💳 Cancellation Fee</div>
                  <div style={{ color: '#7c2d12' }}>
                    {feeAmt}{cancelCharge.gstRate > 0 ? ` + ${cancelCharge.gstRate}% GST = ${totalAmt}` : ''} will be deducted from your wallet.
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, border: '1.5px solid #d1d5db',
                  background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}>
                  Back
                </button>
                <button onClick={() => setStep('confirm')} style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}>
                  Next →
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Confirmation step */}
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                padding: '14px 16px', marginBottom: 18,
              }}>
                <div style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 8, fontWeight: 600 }}>
                  ⚠️ This action cannot be undone!
                </div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                  <div><strong>EWB No:</strong> {ewbNo}</div>
                  <div><strong>Reason:</strong> {reasonCode}. {reasonLabel}</div>
                  {remark && <div><strong>Remark:</strong> {remark}</div>}
                  {hasFee && <div style={{ color: '#c2410c', marginTop: 6 }}><strong>Fee:</strong> {totalAmt} will be deducted</div>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('form')} style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, border: '1.5px solid #d1d5db',
                  background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}>
                  ← Edit
                </button>
                <button onClick={() => onConfirm(reasonCode, remark)} style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}>
                  Confirm Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const STATE_CODES = [
  { code: '01', name: 'J&K' }, { code: '02', name: 'Himachal Pradesh' },
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
  { code: '26', name: 'Dadra & NH' }, { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' }, { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' }, { code: '35', name: 'Andaman & Nicobar' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
];

const EXTEND_REASONS = [
  { code: 1, label: 'Natural Calamity' },
  { code: 2, label: 'Law & Order Situation' },
  { code: 3, label: 'Transhipment' },
  { code: 4, label: 'Accident' },
  { code: 5, label: 'Others' },
];

const modalWrap  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, padding: 0 };
const modalBox   = { background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, boxShadow: '0 -4px 40px rgba(0,0,0,0.2)', maxHeight: '92vh', overflowY: 'auto' };
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151' };
const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13, background: '#f9fafb', outline: 'none', color: '#111827', width: '100%', boxSizing: 'border-box' };
const grid2      = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 };

// ── Extend Date Modal ──────────────────────────────────────────
function ExtendModal({ ewbNo, onConfirm, onClose }) {
  const [form, setForm] = useState({
    vehicleNo: '', fromPlace: '', fromState: '36',
    remainingDistance: '', extnRsnCode: '5', extnRemarks: '',
    consignmentStatus: 'M', transitType: 'R',
  });
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d1d5db' }} />
        </div>
        <div style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0' }}>
          <CalendarPlus size={20} color="#fff" />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Extend E-Waybill Validity</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>EWB No: {ewbNo}</div>
          </div>
        </div>
        <div style={{ padding: '16px 16px 32px' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Vehicle No <span style={{ color: '#ef4444' }}>*</span></label>
            <input style={inputStyle} value={form.vehicleNo} onChange={set('vehicleNo')} placeholder="e.g. TS09AB1234" />
          </div>
          <div style={grid2}>
            <div style={fieldStyle}>
              <label style={labelStyle}>From Place <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inputStyle} value={form.fromPlace} onChange={set('fromPlace')} placeholder="City / Place" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>From State <span style={{ color: '#ef4444' }}>*</span></label>
              <select style={inputStyle} value={form.fromState} onChange={set('fromState')}>
                {STATE_CODES.map(s => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={grid2}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Remaining Distance (km)</label>
              <input style={inputStyle} type="number" min="0" value={form.remainingDistance} onChange={set('remainingDistance')} placeholder="km" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Extension Reason <span style={{ color: '#ef4444' }}>*</span></label>
              <select style={inputStyle} value={form.extnRsnCode} onChange={set('extnRsnCode')}>
                {EXTEND_REASONS.map(r => <option key={r.code} value={r.code}>{r.code}. {r.label}</option>)}
              </select>
            </div>
          </div>
          <div style={grid2}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Consignment Status</label>
              <select style={inputStyle} value={form.consignmentStatus} onChange={set('consignmentStatus')}>
                <option value="M">M - Movement</option>
                <option value="T">T - Transit (Multi-vehicle)</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Transit Type</label>
              <select style={inputStyle} value={form.transitType} onChange={set('transitType')}>
                <option value="R">Road</option>
                <option value="W">Waterway</option>
                <option value="A">Air</option>
              </select>
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Remarks</label>
            <input style={inputStyle} value={form.extnRemarks} onChange={set('extnRemarks')} placeholder="Additional notes (optional)" maxLength={100} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: '1.5px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={() => {
                if (!form.vehicleNo.trim()) return alert('Vehicle number is required');
                if (!form.fromPlace.trim()) return alert('From place is required');
                onConfirm({ ...form, remainingDistance: parseInt(form.remainingDistance) || 0, extnRsnCode: parseInt(form.extnRsnCode), fromState: form.fromState });
              }}
              style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Extend Validity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Manual Cancel Modal ────────────────────────────────────────
function ManualCancelModal({ token, onDone, onClose }) {
  const [ewbNo,      setEwbNo]      = useState('');
  const [reasonCode, setReasonCode] = useState(2);
  const [remark,     setRemark]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const handleSubmit = async () => {
    if (!ewbNo.trim()) return setError('EWB number is required');
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/eway/cancel-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ewbNo: ewbNo.trim(), cancelRsnCode: reasonCode, cancelRmrk: remark }),
      });
      const d = await r.json();
      if (d.success) { showToast('E-Waybill cancelled successfully'); onDone(); }
      else setError(d.error || 'Cancellation failed');
    } catch { setError('Network error'); }
    setLoading(false);
  };

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d1d5db' }} />
        </div>
        <div style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 0' }}>
          <AlertTriangle size={20} color="#fff" />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Manual Cancel E-Waybill</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Cancel by EWB number</div>
          </div>
        </div>
        <div style={{ padding: '16px 16px 32px' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>E-Waybill Number <span style={{ color: '#ef4444' }}>*</span></label>
            <input style={inputStyle} value={ewbNo} onChange={e => { setEwbNo(e.target.value); setError(''); }} placeholder="Enter EWB number" inputMode="numeric" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Cancellation Reason <span style={{ color: '#ef4444' }}>*</span></label>
            <select style={inputStyle} value={reasonCode} onChange={e => setReasonCode(Number(e.target.value))}>
              {CANCEL_REASONS.map(r => <option key={r.code} value={r.code}>{r.code}. {r.label}</option>)}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Remark <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>(optional)</span></label>
            <input style={inputStyle} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Additional notes" maxLength={100} />
          </div>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
            ⚠️ This will cancel the EWB on the GSP portal. This action cannot be undone.
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: '1.5px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Back
            </button>
            <button onClick={handleSubmit} disabled={loading} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: loading ? '#9ca3af' : 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Cancelling…' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
