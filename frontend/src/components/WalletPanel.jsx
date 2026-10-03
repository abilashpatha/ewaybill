import { useState, useEffect } from 'react';
import { X, Plus, RefreshCw, ArrowUpCircle, ArrowDownCircle, Loader2, Wallet } from 'lucide-react';

const fmt = (paise) => '₹' + (paise / 100).toFixed(2);
const TYPE_LABELS = {
  credit_razorpay: { label: 'UPI Top-up',    color: '#16a34a', icon: '⬆' },
  credit_admin:    { label: 'Admin Credit',   color: '#2563eb', icon: '⬆' },
  debit_ewb:       { label: 'EWB Charge',     color: '#dc2626', icon: '⬇' },
  refund:          { label: 'Refund',         color: '#7c3aed', icon: '⬆' },
};

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function WalletPanel({ auth, ewbCharge = 2000, ewbChargeInfo = null, onClose, onBalanceChange }) {
  const [balance, setBalance]   = useState(null);
  const [txns, setTxns]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [amount, setAmount]     = useState('');
  const [paying, setPaying]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [balRes, txnRes] = await Promise.all([
        fetch('/api/wallet/balance',      { headers: { Authorization: `Bearer ${auth.token}` } }),
        fetch('/api/wallet/transactions', { headers: { Authorization: `Bearer ${auth.token}` } }),
      ]);
      const balData = await balRes.json();
      const txnData = await txnRes.json();
      if (balData.success) {
        setBalance(balData.balance);
        onBalanceChange && onBalanceChange(balData.balance);
      }
      if (txnData.success) setTxns(txnData.transactions || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAddMoney = async () => {
    setError(''); setSuccess('');
    const rupees = parseInt(amount);
    if (!rupees || rupees < 20) return setError('Minimum top-up is ₹20');
    if (rupees > 50000) return setError('Maximum top-up is ₹50,000');

    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { setError('Payment gateway failed to load. Check your connection.'); setPaying(false); return; }

      const res = await fetch('/api/wallet/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ amount: rupees }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Failed to create order'); setPaying(false); return; }

      const options = {
        key: data.key,
        amount: data.amount,
        currency: 'INR',
        name: 'E-Waybill Generator',
        description: 'Wallet Top-up',
        order_id: data.orderId,
        prefill: { name: auth.user.trade_name },
        theme: { color: '#1a56db' },
        handler: async (response) => {
          try {
            const vRes = await fetch('/api/wallet/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
              body: JSON.stringify(response),
            });
            const vData = await vRes.json();
            if (vData.success) {
              setBalance(vData.balance);
              onBalanceChange && onBalanceChange(vData.balance);
              setSuccess(`₹${rupees} added to your wallet successfully!`);
              setAmount('');
              load();
            } else {
              setError(vData.error || 'Payment verification failed');
            }
          } catch {
            setError('Server error during verification. Contact support.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setError('Payment failed: ' + (resp.error?.description || 'Unknown error'));
        setPaying(false);
      });
      rzp.open();
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setPaying(false);
    }
  };

  return (
    <div className="wallet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wallet-panel">
        {/* Header */}
        <div className="wallet-header">
          <div className="wallet-header-left">
            <Wallet size={20} />
            <span>My Wallet</span>
          </div>
          <button className="wallet-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Balance Card */}
        <div className="wallet-balance-card">
          <div className="wallet-balance-label">Available Balance</div>
          {loading ? (
            <div className="wallet-balance-val">—</div>
          ) : (
            <div className="wallet-balance-val">{fmt(balance ?? 0)}</div>
          )}
          <div className="wallet-balance-note">
            ₹{((ewbChargeInfo?.paise ?? ewbCharge) / 100).toFixed(2)}{ewbChargeInfo?.gstRate > 0 ? ` + ${ewbChargeInfo.gstRate}% GST` : ''} per e-waybill
          </div>
        </div>

        {/* Add Money */}
        <div className="wallet-topup">
          <div className="wallet-topup-title">Add Money</div>
          {error   && <div className="wallet-msg error">{error}</div>}
          {success && <div className="wallet-msg success">{success}</div>}
          <div className="wallet-quick-amounts">
            {[100, 200, 500, 1000].map(v => (
              <button key={v} className={`wallet-quick-btn ${amount == v ? 'active' : ''}`}
                onClick={() => setAmount(String(v))}>₹{v}</button>
            ))}
          </div>
          <div className="wallet-input-row">
            <span className="wallet-rupee-prefix">₹</span>
            <input
              type="number"
              placeholder="Enter amount (min ₹20)"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={20}
              max={50000}
              className="wallet-amount-input"
            />
            <button className="wallet-pay-btn" onClick={handleAddMoney} disabled={paying || !amount}>
              {paying ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
              {paying ? 'Processing...' : 'Add Money'}
            </button>
          </div>
          <div className="wallet-powered">Secured by Razorpay · UPI, Cards, Net Banking accepted</div>
        </div>

        {/* Transactions */}
        <div className="wallet-txns">
          <div className="wallet-txns-header">
            <span className="wallet-txns-title">Transaction History</span>
            <button className="wallet-refresh" onClick={load}><RefreshCw size={13} /></button>
          </div>
          {loading ? (
            <div className="wallet-txns-empty">Loading...</div>
          ) : txns.length === 0 ? (
            <div className="wallet-txns-empty">No transactions yet</div>
          ) : (
            <div className="wallet-txns-list">
              {txns.map(t => {
                const meta = TYPE_LABELS[t.type] || { label: t.type, color: '#64748b', icon: '·' };
                const isCredit = t.amount > 0;
                return (
                  <div key={t.id} className="wallet-txn-row">
                    <div className="wallet-txn-icon" style={{ color: meta.color }}>
                      {isCredit ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
                    </div>
                    <div className="wallet-txn-info">
                      <div className="wallet-txn-label">{meta.label}</div>
                      <div className="wallet-txn-desc">{t.description}</div>
                    </div>
                    <div className="wallet-txn-right">
                      <div className="wallet-txn-amount" style={{ color: isCredit ? '#16a34a' : '#dc2626' }}>
                        {isCredit ? '+' : ''}{fmt(t.amount)}
                      </div>
                      <div className="wallet-txn-balance">Bal: {fmt(t.balance_after)}</div>
                      <div className="wallet-txn-date">{new Date(t.created_at).toLocaleDateString('en-IN')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
