import { useState, useEffect, useCallback } from 'react';

const ACTION_LABELS = {
  GENEWAYBILL: 'Generate EWB',
  GSTINDET:    'GSTIN Lookup',
  GETDISTANCE: 'Distance Lookup',
};

const fmt = (str) => {
  if (!str) return '(none)';
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
};

export default function ErrorLogs({ auth }) {
  const [logs,     setLogs]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState({ username: '', action: '' });
  const [expanded, setExpanded] = useState(null);
  const [deleting, setDeleting] = useState(null); // id being deleted
  const [clearing, setClearing] = useState(false);

  const limit = 50;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: pg, limit });
      if (filter.username) q.set('username', filter.username);
      if (filter.action)   q.set('action',   filter.action);
      const r = await fetch(`/api/admin/error-logs?${q}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const d = await r.json();
      if (d.success) { setLogs(d.logs); setTotal(d.total); setPage(pg); }
    } catch {}
    setLoading(false);
  }, [auth.token, filter]);

  useEffect(() => { load(1); }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  async function deleteLog(id) {
    if (!window.confirm('Delete this error log entry?')) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/admin/error-logs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const d = await r.json();
      if (d.success) {
        setLogs(prev => prev.filter(l => l.id !== id));
        setTotal(prev => prev - 1);
        if (expanded === id) setExpanded(null);
      } else {
        alert(d.error || 'Delete failed');
      }
    } catch { alert('Network error'); }
    setDeleting(null);
  }

  async function clearAll() {
    if (!window.confirm(`Clear ALL ${total} error log entries? This cannot be undone.`)) return;
    setClearing(true);
    try {
      const r = await fetch('/api/admin/error-logs/all', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const d = await r.json();
      if (d.success) {
        setLogs([]);
        setTotal(0);
        setExpanded(null);
      } else {
        alert(d.error || 'Clear failed');
      }
    } catch { alert('Network error'); }
    setClearing(false);
  }

  return (
    <div className="admin-section">
      <div className="section-header">
        <h2>⚠️ GSP Error Logs</h2>
        <span className="section-count">{total} total errors</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="admin-input"
          placeholder="Filter by username…"
          value={filter.username}
          onChange={e => setFilter(f => ({ ...f, username: e.target.value }))}
          style={{ flex: 1, minWidth: 140 }}
        />
        <select
          className="admin-input"
          value={filter.action}
          onChange={e => setFilter(f => ({ ...f, action: e.target.value }))}
          style={{ minWidth: 150 }}
        >
          <option value="">All actions</option>
          <option value="GENEWAYBILL">Generate EWB</option>
          <option value="GSTINDET">GSTIN Lookup</option>
          <option value="GETDISTANCE">Distance Lookup</option>
        </select>
        <button className="btn-sm btn-primary" onClick={() => load(1)} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {total > 0 && (
          <button
            className="btn-sm"
            onClick={clearAll}
            disabled={clearing}
            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}
          >
            {clearing ? 'Clearing…' : '🗑 Clear All'}
          </button>
        )}
      </div>

      {logs.length === 0 && !loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          ✅ No errors logged yet.
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 110 }} />
              <col style={{ minWidth: 160 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Serial</th>
                <th>Time</th>
                <th>User</th>
                <th>GSTIN</th>
                <th>Action</th>
                <th>Error</th>
                <th>Details</th>
                <th>Del</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <>
                  <tr key={log.id} style={{ background: '#fff1f2', verticalAlign: 'top' }}>
                    <td>
                      <code style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '2px 6px', borderRadius: 4 }}>
                        {log.request_serial || '—'}
                      </code>
                    </td>
                    <td style={{ fontSize: 11, color: '#475569' }}>
                      {new Date(log.created_at).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{log.username}</div>
                      {log.trade_name && <div style={{ fontSize: 11, color: '#64748b' }}>{log.trade_name}</div>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                      {log.gstin || '—'}
                    </td>
                    <td>
                      <span style={{
                        background: '#fee2e2', color: '#b91c1c',
                        padding: '2px 6px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td>
                      {log.error_code && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 2 }}>
                          {log.error_code}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#1e293b', wordBreak: 'break-word' }}>
                        {log.error_message}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn-sm"
                        style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      >
                        {expanded === log.id ? '▲ Hide' : '▼ Show'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn-sm"
                        onClick={() => deleteLog(log.id)}
                        disabled={deleting === log.id}
                        title="Delete this log entry"
                        style={{
                          fontSize: 13, background: 'transparent', border: '1px solid #fca5a5',
                          color: '#dc2626', borderRadius: 4, cursor: 'pointer', padding: '2px 6px',
                          lineHeight: 1,
                        }}
                      >
                        {deleting === log.id ? '…' : '🗑'}
                      </button>
                    </td>
                  </tr>

                  {expanded === log.id && (
                    <tr key={`${log.id}-detail`} style={{ background: '#fef2f2' }}>
                      <td colSpan={8} style={{ padding: '12px 8px' }}>

                        {/* Full GSP URL */}
                        {log.request_url && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                              🔗 GSP API URL
                            </div>
                            <code style={{
                              display: 'block', background: '#1e293b', color: '#34d399',
                              padding: '6px 10px', borderRadius: 6, fontSize: 12,
                              wordBreak: 'break-all',
                            }}>
                              {log.request_url}
                            </code>
                          </div>
                        )}

                        {/* Headers */}
                        {log.request_headers && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                              📋 REQUEST HEADERS SENT TO GSP
                            </div>
                            <pre style={{
                              margin: 0, padding: '8px 12px', fontSize: 11,
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                              background: '#0f172a', color: '#86efac',
                              borderRadius: 6,
                            }}>
                              {fmt(log.request_headers)}
                            </pre>
                          </div>
                        )}

                        {/* Input + Output side by side */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                              📤 INPUT JSON SENT TO GSP
                            </div>
                            <pre style={{
                              margin: 0, padding: '8px 12px', fontSize: 11,
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                              background: '#0f172a', color: '#7dd3fc',
                              borderRadius: 6, maxHeight: 300, overflowY: 'auto',
                            }}>
                              {fmt(log.request_payload)}
                            </pre>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                              📥 RAW GSP RESPONSE JSON
                            </div>
                            <pre style={{
                              margin: 0, padding: '8px 12px', fontSize: 11,
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                              background: '#1e293b', color: '#fca5a5',
                              borderRadius: 6, maxHeight: 300, overflowY: 'auto',
                            }}>
                              {fmt(log.raw_response)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          <button className="btn-sm" onClick={() => load(page - 1)} disabled={page <= 1}>‹ Prev</button>
          <span style={{ lineHeight: '28px', fontSize: 13 }}>Page {page} / {pages}</span>
          <button className="btn-sm" onClick={() => load(page + 1)} disabled={page >= pages}>Next ›</button>
        </div>
      )}
    </div>
  );
}
