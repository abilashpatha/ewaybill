import { useState } from 'react';
import { Loader2, Shield } from 'lucide-react';

export default function AdminLogin({ onLogin }) {
  const [form, setForm] = useState({ appUsername: '', appPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        if (data.user.role !== 'super_admin' && data.user.role !== 'employee') {
          setError('This account does not have admin access.');
        } else {
          localStorage.setItem('ewb_token', data.token);
          localStorage.setItem('ewb_user', JSON.stringify(data.user));
          onLogin(data.user, data.token);
        }
      } else {
        setError(data.error || 'Login failed');
      }
    } catch { setError('Server error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="admin-login-screen">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <Shield size={40} color="#1a56db" />
          <h1>Admin Portal</h1>
          <p>E-Waybill Generator Administration</p>
        </div>
        {error && <div className="admin-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="admin-field">
            <label>Username</label>
            <input value={form.appUsername} onChange={e => setForm(p => ({...p, appUsername: e.target.value}))} placeholder="Admin username" autoFocus />
          </div>
          <div className="admin-field">
            <label>Password</label>
            <input type="password" value={form.appPassword} onChange={e => setForm(p => ({...p, appPassword: e.target.value}))} placeholder="Password" />
          </div>
          <button className="admin-btn-primary" type="submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <Shield size={16} />}
            {loading ? 'Signing in...' : 'Sign In to Admin'}
          </button>
        </form>
        <p style={{textAlign:'center',marginTop:'16px',fontSize:'12px',color:'#94a3b8'}}>
          <a href="/" style={{color:'#1a56db'}}>← Back to main app</a>
        </p>
      </div>
    </div>
  );
}
