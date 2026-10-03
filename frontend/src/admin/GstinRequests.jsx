import { useState, useEffect } from 'react';

const STATE_CODES = [
  { code: '01', name: 'Jammu and Kashmir' }, { code: '02', name: 'Himachal Pradesh' },
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
  { code: '26', name: 'Dadra and Nagar Haveli' }, { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' }, { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' }, { code: '35', name: 'Andaman & Nicobar' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
];

export default function GstinRequests({ auth }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviewMap, setReviewMap] = useState({}); // id -> { notes, trade_name, addr1, addr2, place, pincode, state_code }
  const [expandedId, setExpandedId] = useState(null);
  const [submitting, setSubmitting] = useState({});
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/gstin-requests?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const d = await r.json();
      if (d.success) setRequests(d.requests);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const getReview = (id) => reviewMap[id] || { notes: '', trade_name: '', addr1: '', addr2: '', place: '', pincode: '', state_code: '' };
  const setReview = (id, field, val) => setReviewMap(prev => ({ ...prev, [id]: { ...getReview(id), [field]: val } }));

  const handleDecision = async (id, status) => {
    setSubmitting(prev => ({ ...prev, [id]: true }));
    setMsg('');
    try {
      const r = await fetch(`/api/admin/gstin-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status, ...getReview(id) }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg(`GSTIN ${status === 'approved' ? 'approved' : 'rejected'} successfully`);
        setExpandedId(null);
        load();
      } else {
        setMsg(d.error || 'Failed');
      }
    } catch {
      setMsg('Server error');
    }
    setSubmitting(prev => ({ ...prev, [id]: false }));
  };

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>GSTIN Requests</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {['pending', 'approved', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setMsg(''); }}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px solid',
                borderColor: statusFilter === s ? '#2563eb' : '#e2e8f0',
                background: statusFilter === s ? '#eff6ff' : '#fff',
                color: statusFilter === s ? '#2563eb' : '#64748b',
                fontWeight: statusFilter === s ? 700 : 400,
                cursor: 'pointer', fontSize: 13, textTransform: 'capitalize',
              }}
            >{s}</button>
          ))}
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.includes('success') || msg.includes('approved') || msg.includes('rejected') ? '#f0fdf4' : '#fef2f2', color: msg.includes('success') || msg.includes('approved') || msg.includes('rejected') ? '#16a34a' : '#dc2626', fontSize: 13 }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', padding: 20 }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={{ color: '#94a3b8', padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: 10 }}>
          No {statusFilter} GSTIN requests
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map(req => {
            const rv = getReview(req.id);
            const isExpanded = expandedId === req.id;
            return (
              <div key={req.id} style={{
                background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                {/* Header row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{req.gstin}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      User: <strong>{req.app_username}</strong> ({req.user_trade_name})
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Requested: {new Date(req.created_at).toLocaleString()}
                    </div>
                    {req.notes && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                        Notes: {req.notes}
                      </div>
                    )}
                  </div>

                  <span style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                    background: req.status === 'approved' ? '#f0fdf4' : req.status === 'rejected' ? '#fef2f2' : '#fffbeb',
                    color: req.status === 'approved' ? '#16a34a' : req.status === 'rejected' ? '#dc2626' : '#d97706',
                  }}>
                    {req.status}
                  </span>

                  {statusFilter === 'pending' && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                        background: isExpanded ? '#f1f5f9' : '#fff', cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      {isExpanded ? 'Hide' : 'Review'}
                    </button>
                  )}
                </div>

                {/* Expandable review panel */}
                {isExpanded && statusFilter === 'pending' && (
                  <div style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                      Fill in GSTIN details (optional — can be done later):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {[
                        { field: 'trade_name', label: 'Trade Name' },
                        { field: 'addr1', label: 'Address Line 1' },
                        { field: 'addr2', label: 'Address Line 2' },
                        { field: 'place', label: 'City / Place' },
                        { field: 'pincode', label: 'Pincode' },
                      ].map(({ field, label }) => (
                        <div key={field}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 3 }}>{label}</label>
                          <input
                            type="text"
                            value={rv[field]}
                            onChange={e => setReview(req.id, field, e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                          />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 3 }}>State</label>
                        <select
                          value={rv.state_code}
                          onChange={e => setReview(req.id, 'state_code', e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                        >
                          <option value="">-- Select --</option>
                          {STATE_CODES.map(s => (
                            <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 3 }}>Notes (optional)</label>
                      <input
                        type="text"
                        value={rv.notes}
                        onChange={e => setReview(req.id, 'notes', e.target.value)}
                        placeholder="Reason for rejection or any notes"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                      <button
                        onClick={() => handleDecision(req.id, 'approved')}
                        disabled={submitting[req.id]}
                        style={{
                          padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none',
                          borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                          opacity: submitting[req.id] ? 0.6 : 1,
                        }}
                      >
                        {submitting[req.id] ? 'Saving...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleDecision(req.id, 'rejected')}
                        disabled={submitting[req.id]}
                        style={{
                          padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none',
                          borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                          opacity: submitting[req.id] ? 0.6 : 1,
                        }}
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => setExpandedId(null)}
                        style={{
                          padding: '8px 16px', background: '#fff', color: '#374151',
                          border: '1.5px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 14,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
