import { useState, useEffect } from 'react';
import { Users, FileText, IndianRupee, Clock, TrendingUp, AlertCircle } from 'lucide-react';

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

function fmt(paise) { return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

export default function AdminDashboard({ auth }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/admin/analytics', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json()).then(d => { setData(d.analytics); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-loading">Loading analytics...</div>;
  if (!data)   return <div className="admin-error">Failed to load analytics</div>;

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">📊 Dashboard Overview</h2>

      <div className="stats-grid">
        <StatCard icon={<Users size={24}/>} label="Total Businesses" value={data.totalUsers} sub={`${data.approvedUsers} approved`} color="#1a56db" />
        <StatCard icon={<AlertCircle size={24}/>} label="Pending Approvals" value={data.pendingUsers} sub="Awaiting review" color="#f59e0b" />
        <StatCard icon={<FileText size={24}/>} label="Total E-Waybills" value={data.totalEwbs} sub={`${data.todayEwbs} today`} color="#16a34a" />
        <StatCard icon={<IndianRupee size={24}/>} label="Total Revenue" value={fmt(data.totalRevenue || 0)} sub="All-time wallet top-ups" color="#8b5cf6" />
        <StatCard icon={<TrendingUp size={24}/>} label="Total Charged" value={fmt(data.totalCharged || 0)} color="#ef4444" />
      </div>

      <div className="admin-grid-2">
        <div className="admin-card">
          <h3 className="admin-card-title">🏆 Top Users (by E-Waybills)</h3>
          {data.topUsers.length === 0 ? <p className="admin-empty">No data yet</p> : (
            <table className="admin-table">
              <thead><tr><th>Business</th><th>GSTIN</th><th>EWBs</th><th>Balance</th></tr></thead>
              <tbody>
                {data.topUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.trade_name}</td>
                    <td className="mono">{u.gstin?.slice(0,10)}...</td>
                    <td className="center bold">{u.ewb_count}</td>
                    <td>{fmt(u.wallet_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-card">
          <h3 className="admin-card-title">📋 Recent E-Waybills</h3>
          {data.recentEwbs.length === 0 ? <p className="admin-empty">No e-waybills yet</p> : (
            <table className="admin-table">
              <thead><tr><th>EWB No</th><th>Business</th><th>Date</th></tr></thead>
              <tbody>
                {data.recentEwbs.map(e => (
                  <tr key={e.id}>
                    <td className="mono bold" style={{color:'#1a56db'}}>{e.ewb_no}</td>
                    <td>{e.trade_name}</td>
                    <td className="muted">{new Date(e.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
