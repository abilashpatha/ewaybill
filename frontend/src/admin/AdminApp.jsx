import { useState, useEffect } from 'react';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';
import UserList from './UserList';
import PendingApprovals from './PendingApprovals';
import EmployeeManager from './EmployeeManager';
import AllTransactions from './AllTransactions';
import AdminSettings from './AdminSettings';
import EwbList from './EwbList';
import Reports from './Reports';
import GstReport from './GstReport';
import ErrorLogs from './ErrorLogs';
import GstinRequests from './GstinRequests';
import AccountantRequests from './AccountantRequests';
import '../admin/admin.css';

function getSavedAdminAuth() {
  try {
    const token = localStorage.getItem('ewb_token');
    const user = JSON.parse(localStorage.getItem('ewb_user') || 'null');
    if (token && user && (user.role === 'super_admin' || user.role === 'employee')) {
      return { token, user };
    }
    return null;
  } catch { return null; }
}

export default function AdminApp() {
  const [auth, setAuth]           = useState(getSavedAdminAuth);
  const [tab,  setTab]            = useState('dashboard');
  const [empPerms, setEmpPerms]   = useState([]);   // for employee role only

  const handleLogin = (user, token) => {
    if (user.role !== 'super_admin' && user.role !== 'employee') {
      alert('This account does not have admin access.');
      return;
    }
    setAuth({ user, token });
  };

  const handleLogout = () => {
    localStorage.removeItem('ewb_token');
    localStorage.removeItem('ewb_user');
    setAuth(null);
  };

  // Validate stored token on load — auto-logout if expired/invalid
  useEffect(() => {
    if (!auth) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => { if (r.status === 401 || r.status === 403) handleLogout(); })
      .catch(() => {});
  }, []);

  // Fetch employee's permissions when they log in
  useEffect(() => {
    if (!auth) return;
    fetch('/api/admin/my-permissions', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setEmpPerms(d.permissions); })
      .catch(() => {});
  }, [auth]);

  if (!auth) return <AdminLogin onLogin={handleLogin} />;

  const isSuperAdmin = auth.user.role === 'super_admin';
  const hasPerm = (p) => isSuperAdmin || empPerms.includes(p);

  const TABS = [
    { id: 'dashboard',    label: '📊 Dashboard',         show: isSuperAdmin },
    { id: 'approvals',    label: '✅ Pending Approvals',  show: true },
    { id: 'users',        label: '👥 Users',              show: hasPerm('view_user_list') },
    { id: 'employees',    label: '👤 Employees',           show: isSuperAdmin },
    { id: 'transactions', label: '💳 Transactions',        show: hasPerm('view_all_transactions') },
    { id: 'ewblist',      label: '📋 EWB List',            show: hasPerm('view_ewb_list') },
    { id: 'reports',      label: '📈 Reports',             show: hasPerm('view_reports') },
    { id: 'gst-report',   label: '🧾 GST Filing',          show: hasPerm('view_reports') },
    { id: 'gstin-requests',     label: '🏢 GSTIN Requests',        show: true },
    { id: 'accountant-requests', label: '🧑‍💼 Accountant Access',   show: true },
    { id: 'error-logs',   label: '⚠️ Error Logs',           show: isSuperAdmin },
    { id: 'settings',     label: '⚙️ Settings',            show: isSuperAdmin },
  ].filter(t => t.show);

  // Reset to a visible tab if current tab got hidden after perm change
  const visibleIds = TABS.map(t => t.id);
  const activeTab = visibleIds.includes(tab) ? tab : (visibleIds[0] || 'approvals');

  return (
    <div className="admin-app">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand">
            <span>⚡</span>
            <span>E-Waybill Admin Panel</span>
            <span className={`admin-role-badge ${isSuperAdmin ? 'super' : 'emp'}`}>
              {isSuperAdmin ? 'Super Admin' : 'Employee'}
            </span>
          </div>
          <div className="admin-header-right">
            <span className="admin-user-name">{auth.user.trade_name}</span>
            <button className="admin-logout-btn" onClick={handleLogout}>Sign Out</button>
          </div>
        </div>
      </header>

      <div className="admin-layout">
        <nav className="admin-sidebar">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`admin-nav-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
          <div className="admin-sidebar-footer">
            <a href="/" className="admin-nav-btn">← Back to App</a>
            <div className="admin-support-info">
              <a href="tel:+918919066381">📞 +91-8919066381</a>
              <a href="mailto:hr@kenasoft.com">✉ hr@kenasoft.com</a>
            </div>
          </div>
        </nav>

        <main className="admin-main">
          {activeTab === 'dashboard'    && <AdminDashboard auth={auth} />}
          {activeTab === 'approvals'    && <PendingApprovals auth={auth} />}
          {activeTab === 'users'        && <UserList auth={auth} />}
          {activeTab === 'employees'    && <EmployeeManager auth={auth} />}
          {activeTab === 'transactions' && <AllTransactions auth={auth} />}
          {activeTab === 'ewblist'      && <EwbList auth={auth} />}
          {activeTab === 'reports'      && <Reports auth={auth} />}
          {activeTab === 'gst-report'   && <GstReport auth={auth} />}
          {activeTab === 'gstin-requests'     && <GstinRequests auth={auth} />}
          {activeTab === 'accountant-requests' && <AccountantRequests auth={auth} />}
          {activeTab === 'error-logs'   && <ErrorLogs auth={auth} />}
          {activeTab === 'settings'     && <AdminSettings auth={auth} />}
        </main>
      </div>
    </div>
  );
}
