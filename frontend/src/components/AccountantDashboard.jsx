import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Search, CheckCircle, Clock, XCircle,
  RefreshCw, Trash2, FileText, ChevronRight, AlertCircle,
  Loader2, X, LogOut, Bell, User, Receipt
} from 'lucide-react';
import EwayForm from './EwayForm';
import EwayVerify from './EwayVerify';
import EwayResult from './EwayResult';
import WaybillHistory from './WaybillHistory';

const API = (path, opts = {}) => {
  const token = localStorage.getItem('ewb_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  }).then(r => r.json());
};

const STATUS_BADGE = {
  approved: { label: 'Active', color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  pending:  { label: 'Pending', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  rejected: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  );
}

export default function AccountantDashboard({ user: initialUser, onLogout }) {
  const [view, setView] = useState('gstins'); // 'gstins' | 'generate' | 'history' | 'settings'
  const [liveUser, setLiveUser] = useState(initialUser); // refreshed from server
  const [gstins, setGstins] = useState([]);
  const [loadingGstins, setLoadingGstins] = useState(true);
  const [gstinError, setGstinError] = useState(null);
  const [selectedGstin, setSelectedGstin] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);

  // EWB generation multi-step state
  const [ewbStep, setEwbStep] = useState(1); // 1=form, 2=verify, 3=result
  const [ewbFormData, setEwbFormData] = useState(null);
  const [ewbResult, setEwbResult] = useState(null);
  const token = localStorage.getItem('ewb_token');

  // Always refresh user from server on mount — localStorage may have stale status
  useEffect(() => {
    API('/api/auth/me').then(d => {
      if (d.success && d.user) {
        setLiveUser(d.user);
        localStorage.setItem('ewb_user', JSON.stringify(d.user));
      }
    }).catch(() => {});
  }, []);

  const user = liveUser; // use live user for all renders

  const fetchGstins = useCallback(async () => {
    setLoadingGstins(true);
    setGstinError(null);
    try {
      const data = await API('/api/accountant/my-gstins');
      if (data.success) setGstins(data.gstins);
      else setGstinError(data.error || 'Failed to load GSTINs');
    } catch (e) { setGstinError('Network error'); }
    setLoadingGstins(false);
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await API('/api/auth/notifications');
      if (data.success) setNotifications(data.notifications.filter(n => !n.is_read));
    } catch {}
  }, []);

  useEffect(() => { fetchGstins(); fetchNotifications(); }, [fetchGstins, fetchNotifications]);


  const approvedGstins = gstins.filter(g => g.status === 'approved');
  const isApprovedAccount = user.status === 'approved';

  const handleGenerate = (gstin) => {
    setSelectedGstin(gstin);
    setEwbStep(1);
    setEwbFormData(null);
    setEwbResult(null);
    setView('generate');
  };

  const handleHistory = (gstin) => {
    setSelectedGstin(gstin);
    setView('history');
  };

  const handleRemove = async (id) => {
    try {
      await API(`/api/accountant/access/${id}`, { method: 'DELETE' });
      fetchGstins();
      setShowRemoveConfirm(null);
    } catch {}
  };

  const markAllRead = async () => {
    await API('/api/auth/notifications/read-all', { method: 'PUT' });
    setNotifications([]);
    setShowNotif(false);
    fetchGstins();
  };

  return (
    <div className="app">
      {/* Header — same CSS class as main app */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.svg" alt="E-Waybill" className="logo-img" />
            <span>E-Waybill</span>
          </div>
          <div className="header-actions">
            <span className="header-user">{user.full_name || user.trade_name || user.app_username}</span>
            <div style={{ position: 'relative' }}>
              <button className="header-btn" onClick={() => setShowNotif(p => !p)} title="Notifications">
                <Bell size={16} />
                {notifications.length > 0 && (
                  <span style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, background: '#dc2626', borderRadius: '50%', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotif && (
                <div className="notif-dropdown" style={{ minWidth: 280 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 15, color: '#111827' }}>Notifications</strong>
                    {notifications.length > 0 && (
                      <button onClick={markAllRead} style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No notifications yet</div>
                  ) : notifications.map(n => (
                    <div key={n.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{n.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="header-btn" onClick={onLogout}>
              <LogOut size={15} /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="main-content" style={{ paddingTop: 20, paddingBottom: 80 }}>

      {/* Pending account notice */}
      {user.status === 'pending' && (
        <div style={{ marginBottom: 16, padding: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, display: 'flex', gap: 10 }}>
          <Clock size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, color: '#92400e', fontSize: 14 }}>Account Pending Approval</div>
            <div style={{ fontSize: 13, color: '#78350f', marginTop: 2 }}>
              Your accountant account is being reviewed by admin. Once approved, you can request access to business GSTINs.
            </div>
          </div>
        </div>
      )}

      {/* Main navigation */}
      {view !== 'generate' && view !== 'history' && (
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', background: '#fff', borderRadius: '10px 10px 0 0', marginBottom: 0 }}>
          {[
            { key: 'gstins', label: 'My GSTINs', icon: <Building2 size={15} /> },
            { key: 'settings', label: 'Profile', icon: <User size={15} /> },
          ].map(t => (
            <button key={t.key} onClick={() => setView(t.key)} style={{
              padding: '12px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: view === t.key ? '2px solid #4338ca' : '2px solid transparent',
              color: view === t.key ? '#4338ca' : '#6b7280',
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: -2,
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      {/* GSTINS view */}
      {view === 'gstins' && (
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Business GSTINs</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {approvedGstins.length} active • {gstins.filter(g => g.status === 'pending').length} pending
              </div>
            </div>
            {isApprovedAccount && (
              <button onClick={() => setShowRequestModal(true)} style={{
                background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Plus size={15} /> Add GSTIN
              </button>
            )}
          </div>

          {loadingGstins ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
              <Loader2 size={24} className="spin" />
            </div>
          ) : gstinError ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <AlertCircle size={40} color="#fca5a5" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, color: '#dc2626', fontWeight: 600 }}>Error loading GSTINs</div>
              <div style={{ fontSize: 13, color: '#ef4444', marginTop: 4 }}>{gstinError}</div>
              <button onClick={fetchGstins} style={{ marginTop: 12, padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Retry
              </button>
            </div>
          ) : gstins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
              <Building2 size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>No GSTINs yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Request access to a business GSTIN to start generating e-waybills</div>
              {isApprovedAccount && (
                <button onClick={() => setShowRequestModal(true)} style={{
                  marginTop: 16, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  + Request Access
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {gstins.map(g => (
                <GstinCard
                  key={g.id}
                  gstin={g}
                  onGenerate={() => handleGenerate(g)}
                  onHistory={() => handleHistory(g)}
                  onRemove={() => setShowRemoveConfirm(g)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile view */}
      {view === 'settings' && (
        <AccountantProfile user={liveUser} onUserUpdate={u => { setLiveUser(u); localStorage.setItem('ewb_user', JSON.stringify(u)); }} />
      )}

      {/* Generate EWB — multi-step flow */}
      {view === 'generate' && selectedGstin && (
        <div className="col-center">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <button className="btn-text" onClick={() => {
              if (ewbStep > 1 && ewbStep < 3) { setEwbStep(s => s - 1); return; }
              setView('gstins'); setSelectedGstin(null); setEwbStep(1);
            }}>← Back</button>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Acting as: <strong>{selectedGstin.gstin}</strong> — {selectedGstin.business_trade_name}
            </div>
          </div>
          {ewbStep === 1 && (
            <EwayForm
              prefill={{
                fromGstin:      selectedGstin.gstin,
                fromTradeName:  selectedGstin.business_trade_name || '',
                fromAddr1:      selectedGstin.addr1 || '',
                fromAddr2:      selectedGstin.addr2 || '',
                fromPlace:      selectedGstin.place || '',
                fromPincode:    selectedGstin.pincode || '',
                fromStateCode:  selectedGstin.state_code || '29',
              }}
              onVerify={(fData) => { setEwbFormData({ ...fData, actingGstin: selectedGstin.gstin }); setEwbStep(2); }}
              onBack={() => { setView('gstins'); setSelectedGstin(null); }}
              token={token}
              userGstin={selectedGstin.gstin}
              userProfile={{
                fromGstin:      selectedGstin.gstin,
                fromTradeName:  selectedGstin.business_trade_name || '',
                fromAddr1:      selectedGstin.addr1 || '',
                fromAddr2:      selectedGstin.addr2 || '',
                fromPlace:      selectedGstin.place || '',
                fromPincode:    selectedGstin.pincode || '',
                fromStateCode:  selectedGstin.state_code || '29',
              }}
              gstins={[]}
              hideChargeInfo={true}
            />
          )}
          {ewbStep === 2 && ewbFormData && (
            <EwayVerify
              formData={ewbFormData}
              onConfirm={(data) => { setEwbResult(data); setEwbStep(3); }}
              onBack={() => setEwbStep(1)}
              token={token}
              hideChargeInfo={true}
            />
          )}
          {ewbStep === 3 && ewbResult && (
            <div>
              <EwayResult result={ewbResult} formData={ewbFormData} token={token} />
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="btn-primary" onClick={() => { setEwbStep(1); setEwbFormData(null); setEwbResult(null); }} style={{ flex: 1 }}>
                  + New E-Waybill
                </button>
                <button className="btn-secondary" onClick={() => handleHistory(selectedGstin)} style={{ flex: 1 }}>
                  View History
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {view === 'history' && (
        <div className="col-center">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <button className="btn-back" onClick={() => { setView('gstins'); setSelectedGstin(null); }}>← Back</button>
            {selectedGstin && (
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                <strong>{selectedGstin.gstin}</strong> — {selectedGstin.business_trade_name}
              </div>
            )}
          </div>
          <WaybillHistory
            token={token}
            filterGstin={selectedGstin?.gstin}
          />
        </div>
      )}

      {/* Request access modal */}
      {showRequestModal && (
        <RequestAccessModal
          onClose={() => setShowRequestModal(false)}
          onRequested={() => { fetchGstins(); setShowRequestModal(false); }}
        />
      )}

      {/* Remove confirm modal */}
      {showRemoveConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }} onClick={() => setShowRemoveConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 500, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: '#d1d5db', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 8 }}>Remove GSTIN Access</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
              Remove access to <strong>{showRemoveConfirm.gstin}</strong>? You can request access again later.
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn-secondary" onClick={() => setShowRemoveConfirm(null)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn-primary" onClick={() => handleRemove(showRemoveConfirm.id)} style={{ flex: 1, background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}

// GSTIN card
function GstinCard({ gstin, onGenerate, onHistory, onRemove }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: gstin.status === 'approved' ? '#eff6ff' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={20} color={gstin.status === 'approved' ? '#3b82f6' : '#9ca3af'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace', color: '#111827' }}>{gstin.gstin}</span>
            <StatusBadge status={gstin.status} />
          </div>
          <div style={{ fontSize: 13, color: '#374151', marginTop: 3, fontWeight: 500 }}>{gstin.business_trade_name || '—'}</div>
          {gstin.place && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{gstin.place}</div>}
          <div style={{ fontSize: 11, color: '#d1d5db', marginTop: 4 }}>
            {gstin.status === 'approved' ? `Active since ${new Date(gstin.reviewed_at).toLocaleDateString('en-IN')}` :
             gstin.status === 'pending' ? `Requested ${new Date(gstin.requested_at).toLocaleDateString('en-IN')}` :
             `Rejected${gstin.notes ? ` — ${gstin.notes}` : ''}`}
          </div>
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 4 }}>
          <Trash2 size={16} />
        </button>
      </div>

      {gstin.status === 'approved' && (
        <div style={{ borderTop: '1px solid #f3f4f6', display: 'flex' }}>
          <button onClick={onGenerate} style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#1e3a5f',
            borderRight: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <FileText size={14} /> Generate EWB
          </button>
          <button onClick={onHistory} style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#6b7280',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Receipt size={14} /> History
          </button>
        </div>
      )}

      {gstin.status === 'pending' && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px', background: '#fffbeb' }}>
          <div style={{ fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} /> Waiting for business owner or admin to approve your request
          </div>
        </div>
      )}

      {gstin.status === 'rejected' && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px', background: '#fef2f2' }}>
          <div style={{ fontSize: 12, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <XCircle size={13} /> Access denied{gstin.notes ? `: ${gstin.notes}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// Request access modal
function RequestAccessModal({ onClose, onRequested }) {
  const [gstin, setGstin] = useState('');
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const checkGstin = async () => {
    const g = gstin.trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g)) {
      return setError('Invalid GSTIN format');
    }
    setError('');
    setChecking(true);
    try {
      const data = await API(`/api/accountant/gstin-info/${g}`);
      if (data.success) {
        setPreview(data.info);
      } else {
        setError(data.error || 'GSTIN not found in our system');
        setPreview(null);
      }
    } catch {
      setError('Server error');
    }
    setChecking(false);
  };

  const handleRequest = async () => {
    setError('');
    setSubmitting(true);
    try {
      const data = await API('/api/accountant/request-access', {
        method: 'POST',
        body: JSON.stringify({ gstin: gstin.trim().toUpperCase() }),
      });
      if (data.success) {
        setSuccess(data.message || 'Request submitted!');
        setTimeout(onRequested, 1500);
      } else {
        setError(data.error || 'Failed to submit request');
      }
    } catch {
      setError('Server error');
    }
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 500, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#d1d5db', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Request GSTIN Access</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
        </div>

        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Enter the GSTIN of a business registered in our system to request e-waybill access
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#16a34a', marginBottom: 12 }}>{success}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={gstin}
            onChange={e => { setGstin(e.target.value.toUpperCase()); setPreview(null); setError(''); }}
            placeholder="Enter GSTIN (e.g. 29AAAAA0000A1Z5)"
            maxLength={15}
            style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
          />
          <button onClick={checkGstin} disabled={checking || gstin.length < 15} style={{
            padding: '10px 14px', border: 'none', borderRadius: 8, background: '#f3f4f6', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {checking ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
            {checking ? '...' : 'Check'}
          </button>
        </div>

        {preview && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <CheckCircle size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#166534' }}>{preview.tradeName}</div>
                <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>{preview.gstin}{preview.place ? ` — ${preview.place}` : ''}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  This business is registered. Your request will be sent to the business owner for approval.
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={handleRequest} disabled={!preview || submitting} style={{
            flex: 2, padding: 12, border: 'none', borderRadius: 8,
            background: preview ? '#1e3a5f' : '#9ca3af', color: '#fff', cursor: preview ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {submitting ? <Loader2 size={14} className="spin" /> : null}
            {submitting ? 'Submitting...' : 'Request Access'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Accountant profile view
function AccountantProfile({ user, onUserUpdate }) {
  const [form, setForm] = useState({ fullName: user.full_name || user.trade_name || '', mobile: user.mobile || '', appPassword: '', newPassword: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const payload = { fullName: form.fullName, mobile: form.mobile };
      if (form.newPassword) payload.appPassword = form.newPassword;
      const data = await API('/api/auth/update-profile', { method: 'PUT', body: JSON.stringify(payload) });
      if (data.success) {
        setMsg('Profile updated');
        if (onUserUpdate) onUserUpdate(data.user);
      } else {
        setMsg(data.error || 'Update failed');
      }
    } catch {
      setMsg('Server error');
    }
    setSaving(false);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 16 }}>Profile</div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Account Info</div>
        <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Username</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{user.app_username}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Role</span>
            <span style={{ fontWeight: 600, color: '#3b82f6' }}>Accountant</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Status</span>
            <StatusBadge status={user.status} />
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Edit Profile</div>
        {msg && <div style={{ fontSize: 13, color: msg === 'Profile updated' ? '#16a34a' : '#dc2626', background: msg === 'Profile updated' ? '#f0fdf4' : '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{msg}</div>}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Full Name</label>
          <input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Mobile Number</label>
          <input type="tel" value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} maxLength={10} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>New Password (leave blank to keep current)</label>
          <input type="password" value={form.newPassword} onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="New password" style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <button onClick={handleSave} disabled={saving} style={{ padding: '12px', border: 'none', borderRadius: 8, background: '#1e3a5f', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="spin" /> : null}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
