import { useState } from 'react';
import { Loader2, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import TermsPage from './TermsPage';

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

const EMPTY_REG = {
  appUsername: '', appPassword: '',
  mobile: '',
  gstin: '', tradeName: '',
  addr1: '', addr2: '', place: '', pincode: '', stateCode: '29',
  ewbUsername: '', ewbPassword: '',
};

const EMPTY_ACC_REG = {
  appUsername: '', appPassword: '', fullName: '', mobile: '',
};

export default function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register' | 'register-accountant'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showEwbPass, setShowEwbPass] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Login form
  const [loginForm, setLoginForm] = useState({ appUsername: '', appPassword: '' });
  // Register form
  const [regForm, setRegForm] = useState(EMPTY_REG);
  // Accountant register form
  const [accForm, setAccForm] = useState(EMPTY_ACC_REG);

  const setLogin = k => e => setLoginForm(p => ({ ...p, [k]: e.target.value }));
  const setReg = k => e => {
    const val = k === 'gstin' ? e.target.value.toUpperCase() : e.target.value;
    setRegForm(p => ({ ...p, [k]: val }));
  };
  const setAcc = k => e => setAccForm(p => ({ ...p, [k]: e.target.value }));

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginForm.appUsername || !loginForm.appPassword) {
      return setError('Please enter username and password');
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUsername: loginForm.appUsername, appPassword: loginForm.appPassword }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('ewb_token', data.token);
        localStorage.setItem('ewb_user', JSON.stringify(data.user));
        onLogin(data.user, data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!regForm.appUsername.trim()) return setError('Username is required');
    if (regForm.appPassword.length < 6) return setError('Password must be at least 6 characters');
    if (!regForm.mobile.trim() || !/^[6-9][0-9]{9}$/.test(regForm.mobile.trim())) return setError('Valid 10-digit mobile number is required');
    if (!regForm.gstin.trim()) return setError('GSTIN is required');
    if (!regForm.tradeName.trim()) return setError('Business name is required');
    if (!regForm.addr1.trim()) return setError('Address is required');
    if (!regForm.place.trim()) return setError('City / Place is required');
    if (!regForm.pincode.trim()) return setError('Pincode is required');
    if (!/^[0-9]{6}$/.test(regForm.pincode.trim())) return setError('Pincode must be 6 digits');
    if (!regForm.ewbUsername.trim()) return setError('E-Waybill portal username is required');
    if (!regForm.ewbPassword.trim()) return setError('E-Waybill portal password is required');
    if (!termsAccepted) return setError('You must accept the Terms & Conditions to register');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('ewb_token', data.token);
        localStorage.setItem('ewb_user', JSON.stringify(data.user));
        onLogin(data.user, data.token);
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountantRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!accForm.appUsername.trim()) return setError('Username is required');
    if (accForm.appPassword.length < 6) return setError('Password must be at least 6 characters');
    if (!accForm.fullName.trim()) return setError('Full name is required');
    if (!accForm.mobile.trim() || !/^[6-9][0-9]{9}$/.test(accForm.mobile.trim())) return setError('Valid 10-digit mobile number is required');
    if (!termsAccepted) return setError('You must accept the Terms & Conditions to register');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register-accountant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accForm),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('ewb_token', data.token);
        localStorage.setItem('ewb_user', JSON.stringify(data.user));
        onLogin(data.user, data.token);
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.svg" alt="E-Waybill" className="auth-brand-logo" />
          <h1>E-Waybill Generator</h1>
          <p>GST E-Waybill Management Portal</p>
        </div>

        <div className="auth-tabs" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
            <LogIn size={15} /> Sign In
          </button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>
            <UserPlus size={15} /> Business
          </button>
          <button className={`auth-tab ${tab === 'register-accountant' ? 'active' : ''}`} onClick={() => { setTab('register-accountant'); setError(''); }}>
            <UserPlus size={15} /> Accountant
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {tab === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <label>Username</label>
              <input value={loginForm.appUsername} onChange={setLogin('appUsername')} placeholder="Your login username" autoComplete="username" />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <div className="pass-wrap">
                <input type={showPass ? 'text' : 'password'} value={loginForm.appPassword} onChange={setLogin('appPassword')} placeholder="Your password" autoComplete="current-password" />
                <button type="button" className="pass-eye" onClick={() => setShowPass(p => !p)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button className="btn-auth-primary" type="submit" disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <p className="auth-switch">
              New business? <button type="button" className="auth-link" onClick={() => { setTab('register'); setError(''); }}>Register here</button>
            </p>
          </form>
        )}

        {tab === 'register' && (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-section-label">App Login Credentials</div>
            <div className="auth-grid-2">
              <div className="auth-field">
                <label>Username <span className="req">*</span></label>
                <input value={regForm.appUsername} onChange={setReg('appUsername')} placeholder="Choose a username" autoComplete="username" />
              </div>
              <div className="auth-field">
                <label>Password <span className="req">*</span></label>
                <div className="pass-wrap">
                  <input type={showPass ? 'text' : 'password'} value={regForm.appPassword} onChange={setReg('appPassword')} placeholder="Min 6 characters" autoComplete="new-password" />
                  <button type="button" className="pass-eye" onClick={() => setShowPass(p => !p)}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="auth-section-label">Contact Details</div>
            <div className="auth-field">
              <label>Mobile Number <span className="req">*</span></label>
              <input
                type="tel"
                value={regForm.mobile}
                onChange={setReg('mobile')}
                placeholder="10-digit mobile number"
                maxLength={10}
                inputMode="numeric"
              />
            </div>

            <div className="auth-section-label">Business Details</div>
            <div className="auth-grid-2">
              <div className="auth-field">
                <label>GSTIN <span className="req">*</span></label>
                <input value={regForm.gstin} onChange={setReg('gstin')} placeholder="29AAAAA0000A1Z5" maxLength={15} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
              </div>
              <div className="auth-field">
                <label>Business / Trade Name <span className="req">*</span></label>
                <input value={regForm.tradeName} onChange={setReg('tradeName')} placeholder="Your company name" />
              </div>
              <div className="auth-field">
                <label>Address <span className="req">*</span></label>
                <input value={regForm.addr1} onChange={setReg('addr1')} placeholder="Street / Building" />
              </div>
              <div className="auth-field">
                <label>Address Line 2</label>
                <input value={regForm.addr2} onChange={setReg('addr2')} placeholder="Area / Locality (optional)" />
              </div>
              <div className="auth-field">
                <label>City / Place <span className="req">*</span></label>
                <input value={regForm.place} onChange={setReg('place')} placeholder="City" />
              </div>
              <div className="auth-field">
                <label>Pincode <span className="req">*</span></label>
                <input value={regForm.pincode} onChange={setReg('pincode')} placeholder="6-digit PIN" maxLength={6} />
              </div>
              <div className="auth-field" style={{ gridColumn: 'span 2' }}>
                <label>State <span className="req">*</span></label>
                <select value={regForm.stateCode} onChange={setReg('stateCode')}>
                  {STATE_CODES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="auth-section-label">
              E-Waybill Portal Credentials
              <span className="auth-section-hint">Used to generate e-waybills on your behalf</span>
            </div>
            <div className="auth-grid-2">
              <div className="auth-field">
                <label>EWB Username <span className="req">*</span></label>
                <input value={regForm.ewbUsername} onChange={setReg('ewbUsername')} placeholder="NIC portal username" />
              </div>
              <div className="auth-field">
                <label>EWB Password <span className="req">*</span></label>
                <div className="pass-wrap">
                  <input type={showEwbPass ? 'text' : 'password'} value={regForm.ewbPassword} onChange={setReg('ewbPassword')} placeholder="NIC portal password" />
                  <button type="button" className="pass-eye" onClick={() => setShowEwbPass(p => !p)}>
                    {showEwbPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Terms & Conditions checkbox */}
            <div className="auth-terms-row">
              <label className="auth-terms-label">
                <input
                  type="checkbox"
                  className="auth-terms-check"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                />
                <span>
                  I have read and agree to the{' '}
                  <button type="button" className="auth-link" onClick={() => setShowTerms(true)}>
                    Terms &amp; Conditions
                  </button>
                  {' '}of Kena Software Solutions Private Limited
                </span>
              </label>
            </div>

            <button className="btn-auth-primary" type="submit" disabled={loading || !termsAccepted}>
              {loading ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
              {loading ? 'Registering...' : 'Register & Continue'}
            </button>
            <p className="auth-switch">
              Already registered? <button type="button" className="auth-link" onClick={() => { setTab('login'); setError(''); }}>Sign in</button>
            </p>
          </form>
        )}

        {tab === 'register-accountant' && (
          <form className="auth-form" onSubmit={handleAccountantRegister}>
            <div className="auth-section-label" style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '8px 12px', borderRadius: 6, marginBottom: 8, fontSize: 12, color: '#1e40af' }}>
              Register as an accountant / CA to manage e-waybills for multiple businesses
            </div>

            <div className="auth-section-label">Account Credentials</div>
            <div className="auth-grid-2">
              <div className="auth-field">
                <label>Username <span className="req">*</span></label>
                <input value={accForm.appUsername} onChange={setAcc('appUsername')} placeholder="Choose a username" autoComplete="username" />
              </div>
              <div className="auth-field">
                <label>Password <span className="req">*</span></label>
                <div className="pass-wrap">
                  <input type={showPass ? 'text' : 'password'} value={accForm.appPassword} onChange={setAcc('appPassword')} placeholder="Min 6 characters" autoComplete="new-password" />
                  <button type="button" className="pass-eye" onClick={() => setShowPass(p => !p)}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="auth-section-label">Personal Details</div>
            <div className="auth-field">
              <label>Full Name <span className="req">*</span></label>
              <input value={accForm.fullName} onChange={setAcc('fullName')} placeholder="Your full name" />
            </div>
            <div className="auth-field">
              <label>Mobile Number <span className="req">*</span></label>
              <input type="tel" value={accForm.mobile} onChange={setAcc('mobile')} placeholder="10-digit mobile number" maxLength={10} inputMode="numeric" />
            </div>

            <div className="auth-terms-row">
              <label className="auth-terms-label">
                <input type="checkbox" className="auth-terms-check" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
                <span>
                  I have read and agree to the{' '}
                  <button type="button" className="auth-link" onClick={() => setShowTerms(true)}>Terms &amp; Conditions</button>
                  {' '}of Kena Software Solutions Private Limited
                </span>
              </label>
            </div>

            <button className="btn-auth-primary" type="submit" disabled={loading || !termsAccepted}>
              {loading ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
              {loading ? 'Registering...' : 'Register as Accountant'}
            </button>
            <p className="auth-switch">
              Already registered? <button type="button" className="auth-link" onClick={() => { setTab('login'); setError(''); }}>Sign in</button>
            </p>
          </form>
        )}
      </div>

      {/* Terms modal */}
      {showTerms && <TermsPage asModal onClose={() => setShowTerms(false)} />}

      <div className="auth-footer-support">
        <span>📞 <a href="tel:+918919066381">+91-8919066381</a></span>
        <span className="auth-footer-sep">|</span>
        <span>✉ <a href="mailto:hr@kenasoft.com">hr@kenasoft.com</a></span>
      </div>
    </div>
  );
}
