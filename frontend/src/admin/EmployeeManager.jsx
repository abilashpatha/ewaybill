import { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, Loader2, Eye, EyeOff, Shield, ChevronDown, ChevronUp, Check } from 'lucide-react';

const ALL_PERMISSIONS = [
  { key: 'manage_approvals',       label: 'Pending Approvals',   desc: 'Can view and approve/reject business registrations' },
  { key: 'view_user_list',         label: 'User List',           desc: 'Can view all registered businesses and their details' },
  { key: 'view_all_transactions',  label: 'All Transactions',    desc: 'Can view system-wide wallet transaction ledger' },
  { key: 'view_ewb_list',          label: 'E-Waybill List',      desc: 'Can view, search, and filter all generated EWBs' },
  { key: 'view_reports',           label: 'Geographic Reports',  desc: 'Can view reports grouped by state, city, and district' },
];

function PermissionsPanel({ auth, employee, onClose }) {
  const [perms,   setPerms]   = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    fetch(`/api/admin/employees/${employee.id}/permissions`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.success) setPerms(d.permissions); setLoading(false); })
      .catch(() => setLoading(false));
  }, [employee.id, auth.token]);

  const toggle = (key) => {
    setPerms(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key]);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    const res = await fetch(`/api/admin/employees/${employee.id}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ permissions: perms }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) setSaved(true);
  };

  return (
    <div className="perm-panel">
      <div className="perm-panel-header">
        <Shield size={15} />
        <span>Permissions for <strong>{employee.trade_name}</strong></span>
        <button className="perm-close-btn" onClick={onClose}>×</button>
      </div>
      {loading ? <div className="admin-loading" style={{ padding: '16px' }}>Loading…</div> : (
        <>
          <div className="perm-list">
            {ALL_PERMISSIONS.map(p => (
              <label key={p.key} className={`perm-row ${perms.includes(p.key) ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={perms.includes(p.key)}
                  onChange={() => toggle(p.key)}
                  className="perm-checkbox"
                />
                <div className="perm-info">
                  <div className="perm-label">{p.label}</div>
                  <div className="perm-desc">{p.desc}</div>
                </div>
                {perms.includes(p.key) && <Check size={14} className="perm-check-icon" />}
              </label>
            ))}
          </div>
          <div className="perm-footer">
            <button className="admin-btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>
              {saving ? <Loader2 size={14} className="spin" /> : <Shield size={14} />}
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Permissions'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function EmployeeManager({ auth }) {
  const [employees, setEmployees] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState({ appUsername: '', appPassword: '', tradeName: '' });
  const [showPass,  setShowPass]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [permFor,   setPermFor]   = useState(null); // employee object whose perms are open

  const load = () => {
    setLoading(true);
    fetch('/api/admin/users?role=employee', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json()).then(d => { setEmployees(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createEmployee = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.appUsername || !form.appPassword || !form.tradeName) return setError('All fields required');
    setSaving(true);
    const res = await fetch('/api/admin/create-employee', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) { setSuccess('Employee created!'); setForm({ appUsername:'', appPassword:'', tradeName:'' }); load(); }
    else setError(d.error || 'Failed');
  };

  const suspendEmployee = async (id, currentStatus) => {
    const newStatus = currentStatus === 'approved' ? 'suspended' : 'approved';
    await fetch(`/api/admin/users/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">👤 Employee Management</h2>
      <div className="admin-grid-2" style={{ alignItems: 'flex-start' }}>

        {/* Create form */}
        <div className="admin-card">
          <h3 className="admin-card-title">Create Employee Account</h3>
          <p className="settings-hint">After creating, click the shield icon to set what each employee can access.</p>
          {error   && <div className="admin-error">{error}</div>}
          {success && <div className="admin-success">{success}</div>}
          <form onSubmit={createEmployee} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <div className="admin-field"><label>Full Name</label>
              <input value={form.tradeName} onChange={e => setForm(p=>({...p,tradeName:e.target.value}))} placeholder="Employee name" /></div>
            <div className="admin-field"><label>Username</label>
              <input value={form.appUsername} onChange={e => setForm(p=>({...p,appUsername:e.target.value}))} placeholder="Login username" /></div>
            <div className="admin-field">
              <label>Password</label>
              <div className="pass-wrap">
                <input type={showPass?'text':'password'} value={form.appPassword}
                  onChange={e => setForm(p=>({...p,appPassword:e.target.value}))} placeholder="Min 6 characters" />
                <button type="button" className="pass-eye" onClick={() => setShowPass(p=>!p)}>
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <button className="admin-btn-primary" type="submit" disabled={saving}>
              {saving ? <Loader2 size={16} className="spin"/> : <UserPlus size={16}/>}
              {saving ? 'Creating...' : 'Create Employee'}
            </button>
          </form>
        </div>

        {/* Employee list */}
        <div>
          <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding:'16px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 className="admin-card-title" style={{ margin: 0 }}>Existing Employees</h3>
              <button className="admin-btn-sm" onClick={load}><RefreshCw size={14}/></button>
            </div>
            {loading ? <div className="admin-loading">Loading...</div> : employees.length === 0 ? (
              <div className="admin-empty center" style={{ padding:'32px' }}>No employees yet</div>
            ) : (
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Username</th><th>Status</th><th>Permissions</th><th></th></tr></thead>
                <tbody>
                  {employees.map(e => (
                    <>
                      <tr key={e.id}>
                        <td className="bold">{e.trade_name}</td>
                        <td className="muted">{e.app_username}</td>
                        <td><span style={{ color: e.status==='approved'?'#16a34a':'#ef4444' }}>{e.status}</span></td>
                        <td>
                          <button
                            className={`perm-toggle-btn ${permFor?.id === e.id ? 'open' : ''}`}
                            onClick={() => setPermFor(permFor?.id === e.id ? null : e)}
                            title="Manage permissions"
                          >
                            <Shield size={13} />
                            {permFor?.id === e.id ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                          </button>
                        </td>
                        <td>
                          <button className="admin-btn-sm" onClick={() => suspendEmployee(e.id, e.status)}
                            style={{ background: e.status==='approved'?'#fee2e2':'#dcfce7', color: e.status==='approved'?'#dc2626':'#16a34a' }}>
                            {e.status==='approved' ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                      {permFor?.id === e.id && (
                        <tr key={`perm-${e.id}`}>
                          <td colSpan={5} style={{ padding: 0, background: '#f8fafc' }}>
                            <PermissionsPanel auth={auth} employee={e} onClose={() => setPermFor(null)} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
