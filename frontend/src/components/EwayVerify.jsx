import { useState } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, FileText, MapPin, Package, Truck, AlertTriangle, Wallet } from 'lucide-react';

const STATE_NAMES = {
  '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat',
  '26':'Dadra and Nagar Haveli','27':'Maharashtra','28':'Andhra Pradesh (Old)','29':'Karnataka',
  '30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry',
  '35':'Andaman & Nicobar','36':'Telangana','37':'Andhra Pradesh',
};
const SUPPLY_LABEL   = { O:'Outward', I:'Inward' };
const SUBSUPPLY_LABEL= { '1':'Supply','2':'Import','3':'Export','4':'Job Work','5':'For Own Use','6':'Job Work Returns','7':'Sales Return','8':'Others' };
const DOCTYPE_LABEL  = { INV:'Tax Invoice', BIL:'Bill of Supply', BOE:'Bill of Entry', CHL:'Delivery Challan', OTH:'Others' };
const MODE_LABEL     = { '1':'Road','2':'Rail','3':'Air','4':'Ship' };
const VTYPE_LABEL    = { R:'Regular', O:'Over Dimensional Cargo' };

function Section({ icon, title, children, accent }) {
  return (
    <div className="verify-section" style={accent ? { borderTopColor: accent } : {}}>
      <div className="verify-section-head">
        {icon}
        <span>{title}</span>
      </div>
      <div className="verify-grid">{children}</div>
    </div>
  );
}

function Row({ label, value, mono, highlight, span }) {
  if (!value && value !== 0) return null;
  return (
    <div className={`verify-row${span ? ' verify-row-span' : ''}${highlight ? ' verify-row-highlight' : ''}`}>
      <span className="verify-label">{label}</span>
      <span className={`verify-value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  );
}

function fmt(num) { return num ? `₹${parseFloat(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'; }

export default function EwayVerify({ formData: f, onConfirm, onBack, token, walletBalance, ewbCharge = 2000, ewbChargeInfo = null, hideChargeInfo = false }) {
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleGenerate = async () => {
    setApiError('');
    setLoading(true);
    try {
      const res = await fetch('/api/eway/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(f),
      });
      const data = await res.json();
      if (data.success) {
        onConfirm(data, f);
      } else {
        setApiError(data.error || 'Generation failed. Please try again.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      setApiError('Server error: ' + err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  // Tax calculations
  const taxable = parseFloat(f.taxableAmount) || 0;
  const cgst    = taxable * (parseFloat(f.cgstRate)  || 0) / 100;
  const sgst    = taxable * (parseFloat(f.sgstRate)  || 0) / 100;
  const igst    = taxable * (parseFloat(f.igstRate)  || 0) / 100;
  const cess    = taxable * (parseFloat(f.cessRate)  || 0) / 100;
  const total   = taxable + cgst + sgst + igst + cess;
  const intraState = f.fromStateCode === f.toStateCode;

  const fmtBal = (p) => p != null ? `₹${(p / 100).toFixed(2)}` : null;

  return (
    <div className="verify-page">
      {/* Header */}
      <div className="verify-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Edit Details
        </button>
        <h2 className="verify-title">
          <CheckCircle2 size={20} color="#16a34a" />
          Review &amp; Confirm E-Waybill
        </h2>
      </div>

      {/* Error banner */}
      {apiError && (
        <div className="verify-error-banner">
          <AlertTriangle size={16} />
          <span>{apiError}</span>
        </div>
      )}

      {/* Wallet warning — hidden for accountant (charge goes to business user) */}
      {!hideChargeInfo && walletBalance != null && walletBalance < ewbCharge && (
        <div className="verify-wallet-warn">
          <Wallet size={15} />
          <span>Low wallet balance ({fmtBal(walletBalance)}). Each e-waybill costs ₹{((ewbChargeInfo?.paise ?? ewbCharge) / 100).toFixed(2)}{ewbChargeInfo?.gstRate > 0 ? ` + ${ewbChargeInfo.gstRate}% GST` : ''}.</span>
        </div>
      )}

      {/* Auto-fill notice */}
      <div className="verify-notice">
        <AlertTriangle size={15} color="#d97706" />
        <span>Please review all details carefully. Once the e-waybill is generated it <strong>cannot be cancelled or edited</strong> from this portal.</span>
      </div>

      {/* ── Transaction ── */}
      <Section icon={<FileText size={16} />} title="Transaction Details" accent="#6366f1">
        <Row label="Supply Type"    value={SUPPLY_LABEL[f.supplyType]} />
        <Row label="Sub Type"       value={SUBSUPPLY_LABEL[f.subSupplyType]} />
        <Row label="Document Type"  value={DOCTYPE_LABEL[f.docType]} />
        <Row label="Document No."   value={f.docNo}   mono />
        <Row label="Document Date"  value={f.docDate ? new Date(f.docDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : ''} />
      </Section>

      {/* ── From ── */}
      <Section icon={<MapPin size={16} />} title="From — Supplier" accent="#2563eb">
        <Row label="GSTIN"          value={f.fromGstin}      mono highlight />
        <Row label="Trade Name"     value={f.fromTradeName}  highlight />
        <Row label="Address"        value={[f.fromAddr1, f.fromAddr2].filter(Boolean).join(', ')} span />
        <Row label="City / Place"   value={f.fromPlace} />
        <Row label="Pincode"        value={f.fromPincode}    mono />
        <Row label="State"          value={STATE_NAMES[f.fromStateCode] || f.fromStateCode} />
      </Section>

      {/* ── To ── */}
      <Section icon={<MapPin size={16} />} title="To — Recipient" accent="#0891b2">
        <Row label="GSTIN"          value={f.toGstin || 'URP (Unregistered)'}  mono highlight />
        <Row label="Trade Name"     value={f.toTradeName}    highlight />
        <Row label="Address"        value={[f.toAddr1, f.toAddr2].filter(Boolean).join(', ')} span />
        <Row label="City / Place"   value={f.toPlace} />
        <Row label="Pincode"        value={f.toPincode}      mono />
        <Row label="State"          value={STATE_NAMES[f.toStateCode] || f.toStateCode} />
      </Section>

      {/* ── Item ── */}
      <Section icon={<Package size={16} />} title="Item Details" accent="#059669">
        <Row label="Product Name"   value={f.productName}    highlight />
        <Row label="Description"    value={f.productDesc} />
        <Row label="HSN/SAC Code"   value={f.hsnCode}        mono highlight />
        <Row label="Quantity"       value={`${f.quantity} ${f.qtyUnit}`} />
        <Row label="Taxable Amount" value={fmt(f.taxableAmount)} highlight />
        {intraState ? (
          <>
            <Row label="CGST Rate"  value={`${f.cgstRate}%`} />
            <Row label="SGST Rate"  value={`${f.sgstRate}%`} />
            <Row label="CGST Amt"   value={fmt(cgst)} />
            <Row label="SGST Amt"   value={fmt(sgst)} />
          </>
        ) : (
          <>
            <Row label="IGST Rate"  value={`${f.igstRate}%`} />
            <Row label="IGST Amt"   value={fmt(igst)} />
          </>
        )}
        {parseFloat(f.cessRate) > 0 && (
          <>
            <Row label="CESS Rate"  value={`${f.cessRate}%`} />
            <Row label="CESS Amt"   value={fmt(cess)} />
          </>
        )}
        <div className="verify-total-row">
          <span>Total Invoice Value</span>
          <span>{fmt(total)}</span>
        </div>
      </Section>

      {/* ── Transport ── */}
      <Section icon={<Truck size={16} />} title="Transport Details" accent="#7c3aed">
        <Row label="Mode"           value={MODE_LABEL[f.transportMode]} />
        <Row label="Distance"       value={f.transDistance ? `${f.transDistance} KM` : '—'} />
        <Row label="Transporter ID" value={f.transporterId}   mono />
        <Row label="Transporter"    value={f.transporterName} />
        <Row label="Vehicle No."    value={f.vehicleNo}        mono highlight />
        <Row label="Vehicle Type"   value={VTYPE_LABEL[f.vehicleType]} />
      </Section>

      {/* ── Action bar ── */}
      <div className="verify-actions">
        <button className="btn-secondary" onClick={onBack} disabled={loading}>
          <ArrowLeft size={15} /> Edit Details
        </button>
        <button className="btn-primary verify-generate-btn" onClick={handleGenerate} disabled={loading}>
          {loading
            ? <><Loader2 size={16} className="spin" /> Generating…</>
            : <><CheckCircle2 size={16} /> Confirm &amp; Generate E-waybill</>
          }
        </button>
      </div>

      {!hideChargeInfo && (ewbChargeInfo?.free ? (
        <p className="verify-cost-note verify-free-note">
          <CheckCircle2 size={14} color="#16a34a" /> Free — no charge will be applied
        </p>
      ) : (
        <p className="verify-cost-note">
          ₹{((ewbChargeInfo?.paise ?? ewbCharge) / 100).toFixed(2)}{ewbChargeInfo?.gstRate > 0 ? ` + ${ewbChargeInfo.gstRate}% GST` : ''} will be deducted from your wallet upon successful generation.
        </p>
      ))}
    </div>
  );
}
