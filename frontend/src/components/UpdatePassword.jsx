import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, Eye, EyeOff, Loader2, KeyRound, Users, Check, X, UserMinus } from 'lucide-react';
import GstinManager from './GstinManager';

export default function UpdatePassword({ user, token, onBack, onUpdated }) {
  const [mobile,      setMobile]      = useState(user?.mobile || '');
  const [appPassword, setAppPassword] = useState('');
  const [showAppPass, setShowAppPass] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    const mobileChanged = mobile.trim() !== (user?.mobile || '');
    if (!mobileChanged && !appPassword) return setError('No changes to save');

    if (mobile.trim() && !/^[6-9][0-9]{9}$/.test(mobile.trim()))
      return setError('Valid 10-digit mobile number is required');
    if (appPassword && appPassword.length < 6)
      return setError('App password must be at least 6 characters');

    const body = {};
    if (mobileChanged)  body.mobile      = mobile.trim();
    if (appPassword)    body.appPassword = appPassword;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Updated successfully!');
        localStorage.setItem('ewb_user', JSON.stringify(data.user));
        onUpdated?.(data.user);
        setAppPassword('');
      } else {
        setError(data.error || 'Update failed');
      }
    } catch {
      setError('Server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <h2><KeyRound size={18} /> Settings</h2>
      </div>

      <div className="settings-body">

        {/* ── User info ── */}
        <div className="settings-card">
          <div className="settings-user-info">
            <div className="settings-avatar">{user?.app_username?.[0]?.toUpperCase() || 'U'}</div>
            <div>
              <div className="settings-username">{user?.app_username}</div>
              {user?.mobile && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>📞 {user.mobile}</div>}
            </div>
          </div>
        </div>

        {/* ── Account settings ── */}
        <form className="settings-card" onSubmit={handleSubmit}>
          <h3 className="settings-section-title">Account</h3>

          <div className="auth-field">
            <label>Mobile Number</label>
            <input
              type="tel"
              value={mobile}
              onChange={e => { setMobile(e.target.value); setError(''); }}
              placeholder="10-digit mobile number"
              maxLength={10}
              inputMode="numeric"
            />
          </div>

          <h3 className="settings-section-title" style={{ marginTop: 20 }}>Change App Password</h3>
          <div className="auth-field">
            <label>New Password</label>
            <div className="pass-wrap">
              <input
                type={showAppPass ? 'text' : 'password'}
                value={appPassword}
                onChange={e => { setAppPassword(e.target.value); setError(''); }}
                placeholder="Leave blank to keep current"
              />
              <button type="button" className="pass-eye" onClick={() => setShowAppPass(p => !p)}>
                {showAppPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error   && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button className="btn-auth-primary" type="submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        {/* ── GSTIN cards ── */}
        <div className="settings-card">
          <GstinManager token={token} />
        </div>

        {/* ── Accountant Access Management ── */}
        <AccountantAccessSection token={token} />

      </div>
    </div>
  );
}

function AccountantAccessSection({ token }) {
  const [pending, setPending]     = useState([]);
  const [approved, setApproved]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  const API = useCallback((path, opts = {}) =>
    fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) } }).then(r => r.json()),
  [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, ar] = await Promise.all([
        API('/api/accountant/business/pending-requests'),
        API('/api/accountant/business/approved-accountants'),
      ]);
      if (pr.success) setPending(pr.requests);
      if (ar.success) setApproved(ar.accountants);
    } catch {}
    setLoading(false);
  }, [API]);

  useEffect(() => { load(); }, [load]);

  const review = async (id, action) => {
    try {
      const data = await API(`/api/accountant/business/review/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
      if (data.success) { setActionMsg(data.message || 'Done'); load(); }
      else setActionMsg(data.error || 'Failed');
    } catch { setActionMsg('Server error'); }
    setTimeout(() => setActionMsg(''), 3000);
  };

  const revoke = async (id) => {
    try {
      const data = await API(`/api/accountant/business/revoke/${id}`, { method: 'POST' });
      if (data.success) load();
    } catch {}
  };

  if (loading) return null;
  if (pending.length === 0 && approved.length === 0) return null;

  return (
    <div className="settings-card">
      <h3 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Users size={16} /> Accountant Access
      </h3>
      {actionMsg && <div style={{ fontSize: 13, color: '#16a34a', marginBottom: 8 }}>{actionMsg}</div>}

      {pending.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pending Requests</div>
          {pending.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{r.display_name || r.full_name || r.app_username}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>GSTIN: {r.gstin} • {r.mobile}</div>
              </div>
              <button onClick={() => review(r.id, 'approve')} style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={13} /> Approve
              </button>
              <button onClick={() => review(r.id, 'reject')} style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <X size={13} /> Reject
              </button>
            </div>
          ))}
        </>
      )}

      {approved.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginTop: pending.length > 0 ? 16 : 0, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Active Accountants</div>
          {approved.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{a.display_name || a.full_name || a.app_username}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>GSTIN: {a.gstin} • {a.mobile}</div>
              </div>
              <button onClick={() => revoke(a.id)} style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <UserMinus size={13} /> Revoke
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
