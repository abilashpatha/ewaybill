import { useState } from 'react';
import { Building2, Save } from 'lucide-react';

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

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export default function LoginSetup({ onComplete, existing }) {
  const [form, setForm] = useState(existing || {
    gstin: '', tradeName: '', addr1: '', addr2: '',
    place: '', pincode: '', stateCode: '29',
  });
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm(p => ({ ...p, [k]: k === 'gstin' ? v.toUpperCase() : v }));
    if (errors[k]) setErrors(p => ({ ...p, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.gstin.trim()) e.gstin = 'Required';
    else if (!GSTIN_RE.test(form.gstin.trim())) e.gstin = 'Invalid GSTIN (e.g. 29AAAAA0000A1Z5)';
    if (!form.tradeName.trim()) e.tradeName = 'Required';
    if (!form.place.trim()) e.place = 'Required';
    if (!form.pincode) e.pincode = 'Required';
    else if (!/^[0-9]{6}$/.test(form.pincode)) e.pincode = 'Must be 6 digits';
    return e;
  };

  const save = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    localStorage.setItem('ewb_credentials', JSON.stringify(form));
    onComplete(form);
  };

  const F = ({ label, k, placeholder, maxLength, req, type = 'text' }) => (
    <div className="field">
      <label>{label}{req && <span className="req">*</span>}</label>
      <input type={type} value={form[k]} onChange={set(k)} placeholder={placeholder} maxLength={maxLength} />
      {errors[k] && <span className="field-error">{errors[k]}</span>}
    </div>
  );

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-header">
          <Building2 size={40} className="setup-icon" />
          <h2>Welcome to E-Waybill Generator</h2>
          <p>Enter your business details once — they will auto-fill every waybill you generate.</p>
        </div>

        <div className="grid-2">
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Your GSTIN <span className="req">*</span></label>
            <input
              value={form.gstin} onChange={set('gstin')}
              placeholder="e.g. 29AAAAA0000A1Z5" maxLength={15}
              style={{ textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'monospace', fontSize: 15 }}
            />
            {errors.gstin && <span className="field-error">{errors.gstin}</span>}
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Business / Trade Name <span className="req">*</span></label>
            <input value={form.tradeName} onChange={set('tradeName')} placeholder="Your company name" />
            {errors.tradeName && <span className="field-error">{errors.tradeName}</span>}
          </div>
          <F label="Address Line 1" k="addr1" placeholder="Street / Building No." />
          <F label="Address Line 2" k="addr2" placeholder="Area / Locality" />
          <div className="field">
            <label>City / Place <span className="req">*</span></label>
            <input value={form.place} onChange={set('place')} placeholder="City" />
            {errors.place && <span className="field-error">{errors.place}</span>}
          </div>
          <div className="field">
            <label>Pincode <span className="req">*</span></label>
            <input value={form.pincode} onChange={set('pincode')} placeholder="6-digit PIN" maxLength={6} />
            {errors.pincode && <span className="field-error">{errors.pincode}</span>}
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>State <span className="req">*</span></label>
            <select value={form.stateCode} onChange={set('stateCode')}>
              {STATE_CODES.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="setup-actions">
          <button className="btn-primary" onClick={save}>
            <Save size={16} /> Save & Continue
          </button>
          <button className="btn-secondary" onClick={() => onComplete(null)}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
