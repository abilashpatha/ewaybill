import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, RefreshCw, UserCog } from 'lucide-react';

export default function AccountantRequests({ auth }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState({});
  const [notes, setNotes]       = useState({});
  const [filter, setFilter]     = useState('pending'); // 'pending' | 'all'

  const load = () => {
    setLoading(true);
    fetch('/api/accountant/admin/all-requests', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => { setRequests(d.requests || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setSaving(s => ({ ...s, [id]: true }));
    await fetch(`/api/accountant/admin/review/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ action, notes: notes[id] || '' }),
    });
    setSaving(s => ({ ...s, [id]: false }));
    load();
  };

  const visible = filter === 'pending' ? requests.filter(r => r.status === 'pending') : requests;

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="admin-section-title" style={{ marginBottom: 0 }}>🧑‍💼 Accountant GSTIN Access Requests</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            <option value="pending">Pending only</option>
            <option value="all">All requests</option>
          </select>
          <button className="admin-btn-sm" onClick={load}><RefreshCw size={14} /></button>
        </div>
      </div>

      {loading && <div className="admin-loading">Loading...</div>}

      {!loading && visible.length === 0 && (
        <div className="admin-empty-state">
          <UserCog size={48} color="#7c3aed" />
          <p>No {filter === 'pending' ? 'pending' : ''} access requests</p>
          <span>Accountants request access to business GSTINs here</span>
        </div>
      )}

      <div className="approvals-grid">
        {visible.map(r => (
          <div key={r.id} className="approval-card">
            <div className="approval-card-header">
              <UserCog size={20} color="#7c3aed" />
              <div>
                <div className="bold">{r.display_name || r.full_name || r.app_username}</div>
                <div className="muted small">@{r.app_username} • {r.mobile}</div>
              </div>
              <span style={{
                marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: r.status === 'approved' ? '#f0fdf4' : r.status === 'rejected' ? '#fef2f2' : '#fffbeb',
                color:      r.status === 'approved' ? '#16a34a' : r.status === 'rejected' ? '#dc2626' : '#d97706',
                border: `1px solid ${r.status === 'approved' ? '#86efac' : r.status === 'rejected' ? '#fecaca' : '#fde68a'}`,
                fontWeight: 600,
              }}>{r.status}</span>
            </div>

            <div className="detail-row"><span>GSTIN</span><span className="mono">{r.gstin}</span></div>
            <div className="detail-row"><span>Business</span><span>{r.business_name || r.business_username || '—'}</span></div>
            <div className="detail-row"><span>Requested</span><span>{new Date(r.requested_at).toLocaleDateString('en-IN')}</span></div>
            {r.notes && <div className="detail-row"><span>Notes</span><span style={{ color: '#6b7280' }}>{r.notes}</span></div>}

            {r.status === 'pending' && (
              <>
                <textarea
                  placeholder="Notes (optional)"
                  value={notes[r.id] || ''}
                  onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                  className="approval-notes"
                  rows={2}
                />
                <div className="approval-actions">
                  <button className="admin-btn-approve" onClick={() => act(r.id, 'approve')} disabled={saving[r.id]}>
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button className="admin-btn-danger" onClick={() => act(r.id, 'reject')} disabled={saving[r.id]}>
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
