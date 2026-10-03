import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, RefreshCw, Building2, UserCog } from 'lucide-react';

export default function PendingApprovals({ auth }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [notes, setNotes] = useState({});

  const load = () => {
    setLoading(true);
    fetch('/api/admin/pending-approvals', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json()).then(d => { setUsers(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const act = async (id, status) => {
    setSaving(s => ({ ...s, [id]: true }));
    await fetch(`/api/admin/users/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ status, notes: notes[id] || '' }),
    });
    setSaving(s => ({ ...s, [id]: false }));
    load();
  };

  return (
    <div className="admin-section">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
        <h2 className="admin-section-title" style={{marginBottom:0}}>✅ Pending Approvals</h2>
        <button className="admin-btn-sm" onClick={load}><RefreshCw size={14} /></button>
      </div>

      {loading && <div className="admin-loading">Loading...</div>}

      {!loading && users.length === 0 && (
        <div className="admin-empty-state">
          <CheckCircle size={48} color="#16a34a" />
          <p>No pending approvals</p>
          <span>All registrations have been reviewed</span>
        </div>
      )}

      <div className="approvals-grid">
        {users.map(u => {
          const isAccountant = u.role === 'accountant';
          return (
            <div key={u.id} className="approval-card">
              <div className="approval-card-header">
                {isAccountant
                  ? <UserCog size={20} color="#7c3aed" />
                  : <Building2 size={20} color="#1a56db" />
                }
                <div>
                  <div className="bold">{isAccountant ? (u.full_name || u.trade_name) : u.trade_name}</div>
                  <div className="muted small">{u.app_username}</div>
                  <div style={{fontSize:11,marginTop:2,padding:'2px 8px',borderRadius:20,display:'inline-block',
                    background: isAccountant ? '#f5f3ff' : '#eff6ff',
                    color: isAccountant ? '#7c3aed' : '#1d4ed8',
                    border: `1px solid ${isAccountant ? '#ddd6fe' : '#bfdbfe'}`}}>
                    {isAccountant ? 'Accountant' : 'Business'}
                  </div>
                </div>
              </div>
              {!isAccountant && <div className="detail-row"><span>GSTIN</span><span className="mono">{u.gstin}</span></div>}
              {u.mobile && <div className="detail-row"><span>Mobile</span><span>{u.mobile}</span></div>}
              <div className="detail-row"><span>Registered</span><span>{new Date(u.created_at).toLocaleDateString('en-IN')}</span></div>
              <textarea
                placeholder="Notes (optional)"
                value={notes[u.id] || ''}
                onChange={e => setNotes(n => ({ ...n, [u.id]: e.target.value }))}
                className="approval-notes"
                rows={2}
              />
              <div className="approval-actions">
                <button className="admin-btn-approve" onClick={() => act(u.id, 'approved')} disabled={saving[u.id]}>
                  <CheckCircle size={14} /> Approve
                </button>
                <button className="admin-btn-danger" onClick={() => act(u.id, 'rejected')} disabled={saving[u.id]}>
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
