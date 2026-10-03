import { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Upload, FileText, CheckCircle, XCircle, Loader2, Download } from 'lucide-react';
import { showToast } from './Toast';

const CSV_COLUMNS = [
  'docType','docNo','docDate','toGstin','toTradeName','toAddr1','toAddr2',
  'toPlace','toPincode','toStateCode','productName','hsnCode','quantity',
  'qtyUnit','taxableAmount','cgstRate','sgstRate','igstRate','cessRate',
  'transportMode','vehicleNo','transporterName','transporterId','transDistance','vehicleType',
];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, '').trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function downloadTemplate() {
  const header = CSV_COLUMNS.join(',');
  const sample = 'INV,INV001,' + new Date().toISOString().split('T')[0] + ',29ABCDE1234F1Z5,ABC Traders,123 Main St,,Hyderabad,500001,36,Goods,1001,100,NOS,10000,9,9,0,0,1,TS09AB1234,Fast Logistics,29TRANS12345,50,R';
  const csv = header + '\n' + sample;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'ewb_bulk_template.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function BulkEwayUpload({ token, fromProfile, onClose }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'running' | 'done'
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [parseError, setParseError] = useState('');
  const fileRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers: h, rows: r, error } = parseCsv(e.target.result);
      if (error) { setParseError(error); return; }
      if (r.length > 50) { setParseError('Maximum 50 rows per upload'); return; }
      setHeaders(h);
      setRows(r);
      setStep('preview');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleFile(file);
    else setParseError('Please upload a .csv file');
  };

  const buildFormRow = (row) => ({
    ...fromProfile,
    supplyType: 'O',
    subSupplyType: '1',
    docType:     row.docType     || 'INV',
    docNo:       row.docNo       || '',
    docDate:     row.docDate     || new Date().toISOString().split('T')[0],
    toGstin:     row.toGstin     || '',
    toTradeName: row.toTradeName || '',
    toAddr1:     row.toAddr1     || '',
    toAddr2:     row.toAddr2     || '',
    toPlace:     row.toPlace     || '',
    toPincode:   row.toPincode   || '',
    toStateCode: row.toStateCode || '29',
    productName: row.productName || '',
    productDesc: row.productName || '',
    hsnCode:     row.hsnCode     || '',
    quantity:    row.quantity    || '',
    qtyUnit:     row.qtyUnit     || 'NOS',
    taxableAmount: row.taxableAmount || '',
    cgstRate:    row.cgstRate    || '0',
    sgstRate:    row.sgstRate    || '0',
    igstRate:    row.igstRate    || '0',
    cessRate:    row.cessRate    || '0',
    transportMode:   row.transportMode   || '1',
    vehicleNo:       (row.vehicleNo || '').replace(/[\s-]/g, '').toUpperCase(),
    transporterName: row.transporterName || '',
    transporterId:   row.transporterId   || '',
    transDistance:   row.transDistance   || '',
    vehicleType:     row.vehicleType     || 'R',
  });

  const runBulk = async () => {
    setStep('running');
    setProgress(0);
    const formRows = rows.map(buildFormRow);
    const batchSize = 5;
    const allResults = [];

    for (let i = 0; i < formRows.length; i += batchSize) {
      const batch = formRows.slice(i, i + batchSize);
      try {
        const r = await fetch('/api/eway/bulk-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rows: batch }),
        });
        const d = await r.json();
        if (d.results) {
          d.results.forEach((res, idx) => allResults.push({ ...res, index: i + idx, docNo: rows[i + idx]?.docNo || '' }));
        }
      } catch (err) {
        batch.forEach((_, idx) => allResults.push({ index: i + idx, docNo: rows[i + idx]?.docNo || '', success: false, error: err.message }));
      }
      setProgress(Math.min(100, Math.round(((i + batchSize) / formRows.length) * 100)));
    }

    setResults(allResults);
    setStep('done');
    const ok = allResults.filter(r => r.success).length;
    showToast(`Bulk complete: ${ok}/${allResults.length} generated`, ok === allResults.length ? 'success' : 'info');
  };

  const exportResults = () => {
    const header = 'Row,Doc No,EWB No,Valid Upto,Status,Error';
    const csvRows = results.map(r =>
      `${r.index + 1},"${r.docNo}","${r.ewbNo || ''}","${r.validUpto || ''}","${r.success ? 'Success' : 'Failed'}","${r.error || ''}"`
    );
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'bulk_ewb_results.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="history-screen">
      <div className="history-header">
        <button className="back-btn" onClick={onClose}><ArrowLeft size={18} /> Back</button>
        <h2><Upload size={18} /> Bulk E-Waybill Generation</h2>
      </div>

      {step === 'upload' && (
        <div style={{ maxWidth: 520, margin: '24px auto', padding: '0 16px' }}>
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed #cbd5e1', borderRadius: 16, padding: '48px 24px',
              textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
          >
            <Upload size={40} color="#94a3b8" style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>
              Drop CSV file here or click to browse
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Max 50 rows · .csv format only</div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          {parseError && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
              {parseError}
            </div>
          )}

          <div style={{ marginTop: 20, padding: '14px 16px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#1d4ed8', marginBottom: 8 }}>📋 CSV Format</div>
            <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
              Columns (in order): <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>
                {CSV_COLUMNS.slice(0, 6).join(', ')}…
              </code>
            </div>
            <button
              onClick={downloadTemplate}
              style={{ marginTop: 10, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #3b82f6', background: '#fff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={13} /> Download Template CSV
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div style={{ padding: '0 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 14, color: '#475569' }}>
              <strong>{rows.length} row{rows.length !== 1 ? 's' : ''}</strong> ready to generate
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-sm" onClick={() => { setStep('upload'); setRows([]); }}>← Re-upload</button>
              <button
                onClick={runBulk}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                ⚡ Generate {rows.length} E-Waybills
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['#','Doc No','Doc Date','To GSTIN','Product','HSN','Qty','Taxable Amt','Vehicle No'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.docNo}</td>
                    <td style={{ padding: '8px 12px' }}>{r.docDate}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{r.toGstin}</td>
                    <td style={{ padding: '8px 12px' }}>{r.productName}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.hsnCode}</td>
                    <td style={{ padding: '8px 12px' }}>{r.quantity} {r.qtyUnit}</td>
                    <td style={{ padding: '8px 12px' }}>₹{parseFloat(r.taxableAmount || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.vehicleNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'running' && (
        <div style={{ maxWidth: 400, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <Loader2 size={48} className="spin" color="#2563eb" style={{ marginBottom: 16 }} />
          <div style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', marginBottom: 8 }}>Generating E-Waybills…</div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>Please wait. Do not close this screen.</div>
          <div style={{ background: '#e2e8f0', borderRadius: 8, height: 10, overflow: 'hidden' }}>
            <div style={{ background: '#2563eb', height: '100%', width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>{progress}%</div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ padding: '0 4px' }}>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120, padding: '14px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{results.filter(r => r.success).length}</div>
              <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Generated</div>
            </div>
            <div style={{ flex: 1, minWidth: 120, padding: '14px 16px', background: results.filter(r => !r.success).length > 0 ? '#fef2f2' : '#f8fafc', border: `1px solid ${results.filter(r => !r.success).length > 0 ? '#fecaca' : '#e2e8f0'}`, borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: results.filter(r => !r.success).length > 0 ? '#dc2626' : '#94a3b8' }}>{results.filter(r => !r.success).length}</div>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Failed</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn-sm" onClick={exportResults} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> Export Results CSV
            </button>
            <button className="btn-sm" onClick={() => { setStep('upload'); setRows([]); setResults([]); }}>
              ↑ Upload Another File
            </button>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['#','Doc No','EWB No','Valid Upto','Status','Error'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9', background: r.success ? '#f0fdf4' : '#fff' }}>
                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{r.index + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.docNo}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: r.success ? '#16a34a' : '#94a3b8', fontWeight: r.success ? 700 : 400 }}>{r.ewbNo || '—'}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11 }}>{r.validUpto || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.success
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600 }}><CheckCircle size={13} /> Success</span>
                        : <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontWeight: 600 }}><XCircle size={13} /> Failed</span>
                      }
                    </td>
                    <td style={{ padding: '8px 12px', color: '#dc2626', fontSize: 11, maxWidth: 200, wordBreak: 'break-word' }}>{r.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
