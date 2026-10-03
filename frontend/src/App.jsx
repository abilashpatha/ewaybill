import { useState, useEffect } from 'react';
import { History, Settings, ArrowLeft, LogOut, Wallet, Clock, Ban, RefreshCw, Bell, Upload, Users } from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import EwayForm from './components/EwayForm';
import EwayResult from './components/EwayResult';
import WaybillHistory from './components/WaybillHistory';
import UpdatePassword from './components/UpdatePassword';
import WalletPanel from './components/WalletPanel';
import EwayVerify from './components/EwayVerify';
import TermsPage from './components/TermsPage';
import AccountantDashboard from './components/AccountantDashboard';
import AccountantRequests from './components/AccountantRequests';
import BulkEwayUpload from './components/BulkEwayUpload';
import Toast, { showToast } from './components/Toast';
import './App.css';

function getSavedAuth() {
  try {
    // localStorage persists across app close/reopen → auto-login on reopen.
    // On Android PWA uninstall, browser clears localStorage → forces re-login on reinstall.
    const token = localStorage.getItem('ewb_token');
    const user  = JSON.parse(localStorage.getItem('ewb_user') || 'null');
    return token && user ? { token, user } : null;
  } catch { return null; }
}

function credPrefill(user) {
  if (!user) return {};
  return {
    fromGstin: user.gstin || '',
    fromTradeName: user.trade_name || '',
    fromAddr1: user.addr1 || '',
    fromAddr2: user.addr2 || '',
    fromPlace: user.place || '',
    fromPincode: user.pincode || '',
    fromStateCode: user.state_code || '29',
  };
}

function fmtBalance(paise) {
  if (paise == null) return '…';
  return '₹' + (paise / 100).toFixed(2);
}

function getActivePrefill(user, gstins) {
  if (!user) return {};
  const approved = (gstins || []).filter(g => g.status === 'approved');
  const primary = approved.find(g => g.is_primary) || approved[0];
  if (primary) {
    return {
      fromGstin: primary.gstin,
      fromTradeName: primary.trade_name || user.trade_name || '',
      fromAddr1: primary.addr1 || user.addr1 || '',
      fromAddr2: primary.addr2 || user.addr2 || '',
      fromPlace: primary.place || user.place || '',
      fromPincode: primary.pincode || user.pincode || '',
      fromStateCode: primary.state_code || user.state_code || '29',
    };
  }
  return credPrefill(user);
}

export default function App() {
  const [auth, setAuth]               = useState(getSavedAuth);
  const [userGstins, setUserGstins]   = useState([]);
  const [step, setStep]               = useState(1);
  const [prefill, setPrefill]         = useState(null);
  const [savedFormValues, setSavedFormValues] = useState(null);
  const [verifyData, setVerifyData]   = useState(null); // holds validated form for verify step
  const [result, setResult]           = useState(null);
  const [formData, setFormData]       = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWallet, setShowWallet]   = useState(false);
  const [showTerms, setShowTerms]     = useState(false);
  const [loading, setLoading]         = useState(false);
  // wallet balance cached for header display
  const [walletBalance, setWalletBalance] = useState(
    auth?.user?.wallet_balance ?? null
  );
  // per-EWB charge (paise) — total including GST, fetched once on mount
  const [ewbCharge, setEwbCharge]     = useState(2000);
  const [ewbChargeInfo, setEwbChargeInfo] = useState(null); // { paise, gstRate, gstPaise, totalPaise }
  // scan filename from last OCR extraction
  const [scanFilename, setScanFilename] = useState('');
  // low balance popup
  const [showLowBalance, setShowLowBalance] = useState(false);
  // offline detection
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  // pending approval check
  const [checkingStatus, setCheckingStatus] = useState(false);
  // notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showAccountantRequests, setShowAccountantRequests] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  // Validate stored token on every app load — if invalid/expired, force logout
  useEffect(() => {
    const saved = getSavedAuth();
    if (!saved) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${saved.token}` } })
      .then(r => {
        if (r.status === 401 || r.status === 403) {
          localStorage.removeItem('ewb_token');
          localStorage.removeItem('ewb_user');
          setAuth(null);
        }
      })
      .catch(() => {}); // network offline — keep session, will fail on next API call
  }, []);

  const fetchCharge = () => {
    fetch('/api/eway/charge', { cache: 'no-store', headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : {} })
      .then(r => r.json())
      .then(d => { if (d.success) { setEwbCharge(d.totalPaise ?? d.paise); setEwbChargeInfo(d); } })
      .catch(() => {});
  };

  // Fetch charge on mount
  useEffect(() => { fetchCharge(); }, []);

  // Re-fetch charge every time user is on step 1 or after login (catches admin price changes)
  useEffect(() => { if (step === 1 && auth) fetchCharge(); }, [step, auth?.token]);

  // ── Offline detection ──
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  // ── Close notification panel on outside click ──
  useEffect(() => {
    if (!showNotifPanel) return;
    const handleClick = (e) => {
      if (!e.target.closest('[data-notif-panel]')) setShowNotifPanel(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [showNotifPanel]);

  // ── Auto-poll for pending approval status every 30 seconds ──
  useEffect(() => {
    if (!auth?.token || auth?.user?.status !== 'pending') return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${auth.token}` } });
        if (r.ok) {
          const d = await r.json();
          if (d.success && d.user && d.user.status !== 'pending') {
            const updatedUser = { ...auth.user, ...d.user };
            localStorage.setItem('ewb_user', JSON.stringify(updatedUser));
            setAuth(prev => ({ ...prev, user: updatedUser }));
            if (d.user.status === 'approved') {
              showToast('Your account has been approved! You can now generate E-Waybills.', 'success', 5000);
            }
          }
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [auth?.token, auth?.user?.status]);

  // ── Fetch approved GSTINs for the logged-in user ──
  const fetchGstins = async (token) => {
    try {
      const r = await fetch('/api/user/gstins', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setUserGstins(d.gstins.filter(g => g.status === 'approved'));
    } catch {}
  };

  // ── Fetch notifications on login / app load ──
  const fetchNotifications = async (token) => {
    try {
      const r = await fetch('/api/auth/notifications', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        if (d.success) {
          setNotifications(d.notifications || []);
          // Show toast for each unread notification
          const unread = (d.notifications || []).filter(n => !n.is_read);
          unread.forEach(n => {
            const type = n.type === 'approval' ? 'success' : n.type === 'rejection' || n.type === 'suspension' ? 'error' : 'info';
            showToast(`${n.title}: ${n.message}`, type, 5000);
          });
          // Mark all as read after showing
          if (unread.length > 0) {
            fetch('/api/auth/notifications/read-all', {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}` },
            }).then(() => {
              setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
            }).catch(() => {});
          }
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (auth?.token && auth?.user?.status !== 'pending') {
      fetchNotifications(auth.token);
      if (auth?.user?.role === 'user') fetchGstins(auth.token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, auth?.user?.status]);

  // ── Check approval status ──
  const checkApprovalStatus = async () => {
    if (!auth?.token) return;
    setCheckingStatus(true);
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${auth.token}` } });
      if (r.ok) {
        const d = await r.json();
        if (d.success && d.user) {
          const updatedUser = { ...auth.user, ...d.user };
          localStorage.setItem('ewb_user', JSON.stringify(updatedUser));
          setAuth({ ...auth, user: updatedUser });
        }
      }
    } catch {}
    setCheckingStatus(false);
  };

  const LOW_BALANCE_THRESHOLD = 10000; // ₹100 in paise

  const handleLogin = (user, token) => {
    setAuth({ user, token });
    const bal = user.wallet_balance ?? null;
    setWalletBalance(bal);
    setStep(1);
    // Fetch notifications and GSTINs after login
    if (user.status !== 'pending') {
      fetchNotifications(token);
      if (user.role === 'user') fetchGstins(token);
    }
    // Show low balance popup if balance < ₹100 (only for regular users, not admin/employee)
    if (user.role === 'user' && bal !== null && bal < LOW_BALANCE_THRESHOLD) {
      setShowLowBalance(true);
    }
  };

  // Also check on app open if already logged in
  useEffect(() => {
    if (auth?.user?.role === 'user' && auth.user.wallet_balance != null && auth.user.wallet_balance < LOW_BALANCE_THRESHOLD) {
      setShowLowBalance(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('ewb_token');
    localStorage.removeItem('ewb_user');
    setAuth(null); setStep(1); setPrefill(null); setResult(null);
    setWalletBalance(null); setNotifications([]); setShowNotifPanel(false);
    setUserGstins([]);
  };

  const handleExtracted = (fields, scanFn) => {
    // For OCR: use scanned fromGstin as-is; override other from-fields only from matched GSTIN
    const scannedGstin = fields.fromGstin || '';
    const matchedGstin = userGstins.find(g => g.gstin === scannedGstin && g.status === 'approved');
    const profileFields = matchedGstin ? {
      fromGstin: matchedGstin.gstin,
      fromTradeName: matchedGstin.trade_name,
      fromAddr1: matchedGstin.addr1,
      fromAddr2: matchedGstin.addr2,
      fromPlace: matchedGstin.place,
      fromPincode: matchedGstin.pincode,
      fromStateCode: matchedGstin.state_code,
    } : (scannedGstin ? {} : Object.fromEntries(Object.entries(credPrefill(auth?.user)).filter(([, v]) => v !== '')));
    setPrefill({ ...fields, ...profileFields });
    setScanFilename(scanFn || '');
    setSavedFormValues(null);
    setStep(1);
  };

  const goToForm = () => {
    // Merge: saved values (if any) on top of active prefill (primary GSTIN or profile)
    const creds = Object.fromEntries(
      Object.entries(getActivePrefill(auth?.user, userGstins)).filter(([, v]) => v !== '')
    );
    setPrefill({ ...creds, ...(savedFormValues || {}) });
    setStep(1);
  };

  // Called when form validation passes → go to verify screen
  const handleVerify = (fData) => {
    setVerifyData({ ...fData, scan_filename: scanFilename });
    setStep(2);
  };

  // Called when verify screen successfully generates the e-waybill
  const handleGenerated = (data, fData) => {
    setResult(data);
    setFormData(fData);
    // Update wallet balance from EWB response
    if (data.walletBalance != null) {
      setWalletBalance(data.walletBalance);
      const updatedUser = { ...auth.user, wallet_balance: data.walletBalance };
      localStorage.setItem('ewb_user', JSON.stringify(updatedUser));
      setAuth(prev => ({ ...prev, user: updatedUser }));
    }
    setStep(3);
  };

  const reset = () => { setPrefill(null); setVerifyData(null); setResult(null); setFormData(null); setScanFilename(''); setSavedFormValues(null); setStep(1); };

  const STEPS = ['Fill Details', 'Verify Details', 'Generated'];

  if (!auth) return <AuthScreen onLogin={handleLogin} />;

  // ── Terms & Conditions full-page view ──
  if (showTerms) return <TermsPage onClose={() => setShowTerms(false)} />;

  // ── Pending Approval screen ──
  if (auth.user.status === 'pending') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-inner">
            <div className="logo"><img src="/logo.svg" alt="E-Waybill" className="logo-img" /><span>E-Waybill Generator</span></div>
            <div className="header-actions">
              <button className="header-btn header-btn-logout" onClick={handleLogout} title="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>
        <main className="main-content">
          <div className="col-center">
            <div className="status-screen pending-screen">
              <div className="status-icon"><Clock size={56} color="#f59e0b" /></div>
              <h2>Account Pending Approval</h2>
              <p>Your business registration is under review. Our team will verify your details and approve your account shortly.</p>
              <div className="status-details">
                <div className="status-row"><span>Business</span><strong>{auth.user.trade_name}</strong></div>
                <div className="status-row"><span>GSTIN</span><strong className="mono">{auth.user.gstin}</strong></div>
                <div className="status-row"><span>Status</span><strong style={{color:'#f59e0b'}}>Pending Review</strong></div>
              </div>
              <p className="status-hint">Contact your admin if approval takes longer than expected.</p>
              <button className="btn-primary" onClick={checkApprovalStatus} disabled={checkingStatus} style={{ marginBottom: 10 }}>
                {checkingStatus ? <><RefreshCw size={14} className="spin" /> Checking...</> : <><RefreshCw size={14} /> Check Status</>}
              </button>
              <button className="btn-outline" onClick={handleLogout}><LogOut size={14}/> Sign Out</button>
            </div>
          </div>
        </main>
        <footer className="app-footer">
          <p>E-Waybill Generator &copy; 2026 | Kena Software Solutions Pvt. Ltd.</p>
          <p className="footer-support">
            📞 <a href="tel:+918919066381">+91-8919066381</a>
            &nbsp;|&nbsp;
            ✉ <a href="mailto:hr@kenasoft.com">hr@kenasoft.com</a>
          </p>
        </footer>
      </div>
    );
  }

  // ── Suspended / Rejected screen ──
  if (auth.user.status === 'suspended' || auth.user.status === 'rejected') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-inner">
            <div className="logo"><img src="/logo.svg" alt="E-Waybill" className="logo-img" /><span>E-Waybill Generator</span></div>
            <div className="header-actions">
              <button className="header-btn header-btn-logout" onClick={handleLogout} title="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>
        <main className="main-content">
          <div className="col-center">
            <div className="status-screen suspended-screen">
              <div className="status-icon"><Ban size={56} color="#dc2626" /></div>
              <h2>Account {auth.user.status === 'rejected' ? 'Rejected' : 'Suspended'}</h2>
              <p>
                {auth.user.status === 'rejected'
                  ? 'Your registration was not approved. Please contact admin for details.'
                  : 'Your account has been suspended. Please contact admin for assistance.'}
              </p>
              <div className="status-details">
                <div className="status-row"><span>Business</span><strong>{auth.user.trade_name}</strong></div>
                <div className="status-row"><span>Status</span>
                  <strong style={{color:'#dc2626'}}>{auth.user.status}</strong>
                </div>
              </div>
              <button className="btn-outline" onClick={handleLogout}><LogOut size={14}/> Sign Out</button>
            </div>
          </div>
        </main>
        <footer className="app-footer">
          <p>E-Waybill Generator &copy; 2026 | Kena Software Solutions Pvt. Ltd.</p>
          <p className="footer-support">
            📞 <a href="tel:+918919066381">+91-8919066381</a>
            &nbsp;|&nbsp;
            ✉ <a href="mailto:hr@kenasoft.com">hr@kenasoft.com</a>
          </p>
        </footer>
      </div>
    );
  }

  // ── Accountant: dedicated dashboard ──
  if (auth.user.role === 'accountant') {
    return (
      <>
        <AccountantDashboard user={auth.user} onLogout={handleLogout} />
        <Toast />
      </>
    );
  }

  if (showSettings) return (
    <UpdatePassword
      user={auth.user} token={auth.token}
      onBack={() => setShowSettings(false)}
      onUpdated={(updatedUser) => {
        const newAuth = { ...auth, user: updatedUser };
        setAuth(newAuth);
        localStorage.setItem('ewb_user', JSON.stringify(updatedUser));
        setShowSettings(false);
      }}
    />
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.svg" alt="E-Waybill" className="logo-img" />
            <span>E-Waybill Generator</span>
          </div>
          <div className="header-actions">
            <span className="header-user">{auth.user.trade_name}</span>

            {/* Notification Bell */}
            <div style={{ position: 'relative' }} data-notif-panel>
              <button
                className="header-btn"
                onClick={() => { setShowNotifPanel(prev => !prev); setShowHistory(false); setShowSettings(false); setShowWallet(false); }}
                title="Notifications"
              >
                <Bell size={16} />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span style={{
                    position:'absolute', top:2, right:2, width:16, height:16,
                    background:'#dc2626', borderRadius:'50%', color:'#fff',
                    fontSize:10, fontWeight:700, display:'flex', alignItems:'center',
                    justifyContent:'center', lineHeight:1,
                  }}>{notifications.filter(n => !n.is_read).length}</span>
                )}
              </button>

              {/* Notification dropdown */}
              {showNotifPanel && (
                <div className="notif-dropdown">
                  <div style={{
                    padding:'12px 16px', borderBottom:'1px solid #e5e7eb',
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                  }}>
                    <strong style={{ fontSize:15, color:'#111827' }}>Notifications</strong>
                    {notifications.filter(n => !n.is_read).length > 0 && (
                      <button
                        onClick={() => {
                          fetch('/api/auth/notifications/read-all', {
                            method: 'PUT',
                            headers: { Authorization: `Bearer ${auth.token}` },
                          }).then(() => {
                            setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
                          }).catch(() => {});
                        }}
                        style={{
                          border:'none', background:'none', color:'#2563eb',
                          fontSize:12, fontWeight:600, cursor:'pointer',
                        }}
                      >Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding:'24px 16px', textAlign:'center', color:'#9ca3af', fontSize:14 }}>
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.is_read) {
                            fetch(`/api/auth/notifications/${n.id}/read`, {
                              method: 'PUT',
                              headers: { Authorization: `Bearer ${auth.token}` },
                            }).then(() => {
                              setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: 1 } : x));
                            }).catch(() => {});
                          }
                        }}
                        style={{
                          padding:'12px 16px', borderBottom:'1px solid #f3f4f6',
                          cursor:'pointer', background: n.is_read ? '#fff' : '#eff6ff',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{
                            width:8, height:8, borderRadius:'50%', flexShrink:0,
                            background: n.type === 'approval' ? '#16a34a' : n.type === 'rejection' || n.type === 'suspension' ? '#dc2626' : '#2563eb',
                          }} />
                          <strong style={{ fontSize:13, color:'#111827' }}>{n.title}</strong>
                        </div>
                        <div style={{ fontSize:12, color:'#6b7280', marginLeft:16 }}>{n.message}</div>
                        <div style={{ fontSize:11, color:'#9ca3af', marginLeft:16, marginTop:4 }}>
                          {new Date(n.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Accountant Requests (business users only) */}
            {auth.user.role === 'user' && (
              <button
                className="header-btn"
                onClick={() => { setShowAccountantRequests(true); setShowHistory(false); setShowSettings(false); setShowWallet(false); }}
                title="Accountant Requests"
              >
                <Users size={16} /><span>Accountants</span>
              </button>
            )}

            {/* Wallet Balance Button */}
            <button
              className="header-btn header-wallet-btn"
              onClick={() => { setShowWallet(true); setShowHistory(false); setShowSettings(false); }}
              title="My Wallet"
            >
              <Wallet size={15} />
              <span className="wallet-bal-display">{fmtBalance(walletBalance)}</span>
            </button>

            <button className="header-btn" onClick={() => { setShowHistory(true); setShowSettings(false); setShowWallet(false); }} title="History">
              <History size={16} /><span>History</span>
            </button>
            <button className="header-btn" onClick={() => { setShowSettings(true); setShowHistory(false); setShowWallet(false); }} title="Settings">
              <Settings size={16} />
            </button>
            <button className="header-btn header-btn-logout" onClick={handleLogout} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Offline banner */}
      {isOffline && (
        <div className="offline-banner">
          You are offline. Internet required to generate E-Waybills.
        </div>
      )}

      {/* Wallet Panel */}
      {showWallet && (
        <WalletPanel
          auth={auth}
          ewbCharge={ewbCharge}
          ewbChargeInfo={ewbChargeInfo}
          onClose={() => setShowWallet(false)}
          onBalanceChange={(bal) => {
            setWalletBalance(bal);
            const updatedUser = { ...auth.user, wallet_balance: bal };
            localStorage.setItem('ewb_user', JSON.stringify(updatedUser));
            setAuth(prev => ({ ...prev, user: updatedUser }));
          }}
        />
      )}

      {showHistory && <WaybillHistory onClose={() => setShowHistory(false)} token={auth.token} onBalanceUpdate={(bal) => setWalletBalance(bal)} />}

      {showAccountantRequests && (
        <AccountantRequests
          token={auth.token}
          onClose={() => setShowAccountantRequests(false)}
        />
      )}

      {!showHistory && !showWallet && !showAccountantRequests && (
        <>
          <div className="steps-bar">
            {STEPS.map((s, i) => (
              <div key={i} className={`step ${step > i+1 ? 'done' : ''} ${step === i+1 ? 'active' : ''}`}>
                <span className="step-num">{step > i+1 ? '✓' : i+1}</span>
                <span className="step-label">{s}</span>
              </div>
            ))}
          </div>
          <div className="ewb-charge-info">
            💳 ₹{((ewbChargeInfo?.paise ?? ewbCharge) / 100).toFixed(2)}{ewbChargeInfo?.gstRate > 0 ? ` + ${ewbChargeInfo.gstRate}% GST` : ''} per e-waybill
          </div>

          <main className="main-content">
            {step === 1 && (
              <div className="col-full">
                {prefill && Object.values(prefill).some(v => v) && (
                  <div className="prefill-notice">✓ Form auto-filled with your business details. Verify before submitting.</div>
                )}
                {walletBalance != null && walletBalance < ewbCharge && (
                  <div className="low-balance-warning">
                    ⚠ Low wallet balance ({fmtBalance(walletBalance)}). Each e-waybill costs ₹{((ewbChargeInfo?.paise ?? ewbCharge) / 100).toFixed(2)}{ewbChargeInfo?.gstRate > 0 ? ` + ${ewbChargeInfo.gstRate}% GST` : ''}.{' '}
                    <button className="btn-link" onClick={() => setShowWallet(true)}>Add Money →</button>
                  </div>
                )}
                {auth.user.role === 'user' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <button
                      className="btn-sm"
                      onClick={() => setShowBulkUpload(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 13, color: '#4f46e5', borderColor: '#6366f1',
                        background: '#eef2ff', fontWeight: 600,
                      }}
                    >
                      <Upload size={14} /> Bulk Upload
                    </button>
                  </div>
                )}
                <EwayForm
                  prefill={prefill}
                  onVerify={handleVerify}
                  token={auth.token}
                  ewbCharge={ewbCharge}
                  ewbChargeInfo={ewbChargeInfo}
                  userGstin={auth.user?.gstin || ''}
                  userProfile={getActivePrefill(auth?.user, userGstins)}
                  gstins={userGstins}
                  onScanExtracted={handleExtracted}
                  loading={loading}
                  setLoading={setLoading}
                />
              </div>
            )}
            {step === 2 && verifyData && (
              <div className="col-full">
                <EwayVerify
                  formData={verifyData}
                  onConfirm={handleGenerated}
                  onBack={() => { setPrefill({ ...getActivePrefill(auth?.user, userGstins), ...verifyData }); setStep(1); }}
                  token={auth.token}
                  walletBalance={walletBalance}
                  ewbCharge={ewbCharge}
                  ewbChargeInfo={ewbChargeInfo}
                />
              </div>
            )}
            {step === 3 && (
              <div className="col-center">
                <EwayResult result={result} formData={formData} token={auth?.token} />
                <div className="result-nav">
                  <button className="btn-outline" onClick={() => { setPrefill({ ...getActivePrefill(auth?.user, userGstins), ...formData }); setStep(1); }}><ArrowLeft size={14} /> Edit Waybill</button>
                  <button className="btn-primary" onClick={reset}>+ New E-Waybill</button>
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* Low balance popup */}
      {showLowBalance && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:2000, padding:20,
        }} onClick={() => setShowLowBalance(false)}>
          <div style={{
            background:'#fff', borderRadius:16, width:'100%', maxWidth:380,
            boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ background:'linear-gradient(135deg,#f59e0b,#d97706)', padding:'18px 20px' }}>
              <div style={{ color:'#fff', fontWeight:700, fontSize:17 }}>⚠ Low Wallet Balance</div>
              <div style={{ color:'rgba(255,255,255,0.85)', fontSize:13, marginTop:3 }}>
                Current balance: <strong>{fmtBalance(walletBalance)}</strong>
              </div>
            </div>
            <div style={{ padding:'18px 20px' }}>
              <p style={{ margin:'0 0 14px', fontSize:14, color:'#374151', lineHeight:1.6 }}>
                Your wallet balance is below ₹100. Please recharge to continue generating e-waybills. Contact our support team:
              </p>
              <div style={{ background:'#f8fafc', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:15, marginBottom:8 }}>
                  📞 <a href="tel:+918919066381" style={{ color:'#2563eb', fontWeight:600, textDecoration:'none' }}>+91-8919066381</a>
                </div>
                <div style={{ fontSize:15 }}>
                  ✉ <a href="mailto:hr@kenasoft.com" style={{ color:'#2563eb', fontWeight:600, textDecoration:'none' }}>hr@kenasoft.com</a>
                </div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setShowLowBalance(false)} style={{
                  flex:1, padding:'11px 0', borderRadius:8, border:'1.5px solid #d1d5db',
                  background:'#fff', color:'#374151', fontWeight:600, fontSize:14, cursor:'pointer',
                }}>Dismiss</button>
                <button onClick={() => { setShowLowBalance(false); setShowWallet(true); }} style={{
                  flex:1, padding:'11px 0', borderRadius:8, border:'none',
                  background:'linear-gradient(135deg,#2563eb,#1d4ed8)',
                  color:'#fff', fontWeight:600, fontSize:14, cursor:'pointer',
                }}>Add Money</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>
          E-Waybill Generator &copy; 2026 | Kena Software Solutions Pvt. Ltd. |{' '}
          <button className="footer-link" onClick={() => setShowTerms(true)}>
            Terms &amp; Conditions
          </button>
        </p>
        <p className="footer-support">
          📞 <a href="tel:+918919066381">+91-8919066381</a>
          &nbsp;|&nbsp;
          ✉ <a href="mailto:hr@kenasoft.com">hr@kenasoft.com</a>
        </p>
      </footer>

      {showBulkUpload && (
        <BulkEwayUpload
          token={auth.token}
          fromProfile={getActivePrefill(auth?.user, userGstins)}
          onClose={() => setShowBulkUpload(false)}
        />
      )}

      <Toast />
    </div>
  );
}
