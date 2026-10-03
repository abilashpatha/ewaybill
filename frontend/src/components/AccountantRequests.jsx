import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CheckCircle, XCircle, UserCheck, Clock, RefreshCw, Trash2, Users } from 'lucide-react';
import { showToast } from './Toast';

const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function AccountantRequests({ token, onClose }) {
  const [tab, setTab] = useState('pending'); // 'pending' | 'approved'
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState({}); // id → true while API in flight

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        fetch('/api/accountant/business/pending-requests', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/accountant/business/approved-accountants', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      if (p.success) setPending(p.requests || []);
      if (a.success) setApproved(a.accountants || []);
    } catch { showToast('Failed to load', 'error'); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const review = async (id, action) => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      const r = await fetch(`/api/accountant/business/review/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (d.success) { showToast(action === 'approve' ? 'Access approved' : 'Request rejected', 'success'); load(); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Network error', 'error'); }
    setActing(prev => ({ ...prev, [id]: false }));
  };

  const revoke = async (id) => {
    if (!window.confirm('Revoke this accountant\'s access? They will no longer be able to generate e-waybills for your GSTIN.')) return;
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      const r = await fetch(`/api/accountant/business/revoke/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) { showToast('Access revoked', 'success'); load(); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Network error', 'error'); }
    setActing(prev => ({ ...prev, [id]: false }));
  };

  return (
    <div className="history-screen">
      <div className="history-header">
        <button className="back-btn" onClick={onClose}><ArrowLeft size={18} /> Back</button>
        <h2><Users size={18} /> Accountant Access</h2>
        <button className="btn-sm btn-primary" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          {loading ? <RefreshCw size={13} className="spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', margin: '0 0 16px' }}>
        {[
          { key: 'pending', label: 'Pending Requests', count: pending.length, icon: <Clock size={14} /> },
          { key: 'approved', label: 'Approved Accountants', count: approved.length, icon: <UserCheck size={14} /> },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
            color: tab === t.key ? '#2563eb' : '#64748b', marginBottom: -2,
          }}>
            {t.icon} {t.label}
            {t.count > 0 && (
              <span style={{ background: tab === t.key ? '#2563eb' : '#94a3b8', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="history-empty"><RefreshCw size={28} className="spin" style={{ color: '#94a3b8' }} /></div>}

      {!loading && tab === 'pending' && (
        pending.length === 0 ? (
          <div className="history-empty">
            <Clock size={48} color="#cbd5e1" />
            <p>No pending requests</p>
            <span>When an accountant requests access to your GSTIN, they'll appear here.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(req => (
              <div key={req.id} style={{
                background: '#fff', borderRadius: 12, border: '1.5px solid #fde68a',
                padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                      {req.display_name || req.app_username}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{req.app_username}</div>
                    {req.mobile && <div style={{ fontSize: 12, color: '#64748b' }}>📞 {req.mobile}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px' }}>
                    Pending
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
                  Requesting access to GSTIN: <strong style={{ fontFamily: 'monospace' }}>{req.gstin}</strong>
                  <span style={{ marginLeft: 8, color: '#94a3b8' }}>· {fmt(req.requested_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => review(req.id, 'approve')}
                    disabled={acting[req.id]}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button
                    onClick={() => review(req.id, 'reject')}
                    disabled={acting[req.id]}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {!loading && tab === 'approved' && (
        approved.length === 0 ? (
          <div className="history-empty">
            <UserCheck size={48} color="#cbd5e1" />
            <p>No approved accountants</p>
            <span>Accountants you approve will appear here.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {approved.map(acc => (
              <div key={acc.id} style={{
                background: '#fff', borderRadius: 12, border: '1.5px solid #bbf7d0',
                padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>
                      {acc.display_name || acc.app_username}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{acc.app_username}</div>
                    {acc.mobile && <div style={{ fontSize: 12, color: '#64748b' }}>📞 {acc.mobile}</div>}
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                      GSTIN: <strong style={{ fontFamily: 'monospace' }}>{acc.gstin}</strong>
                      <span style={{ marginLeft: 8, color: '#94a3b8' }}>· Approved {fmt(acc.reviewed_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(acc.id)}
                    disabled={acting[acc.id]}
                    title="Revoke access"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}
                  >
                    <Trash2 size={13} /> Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
