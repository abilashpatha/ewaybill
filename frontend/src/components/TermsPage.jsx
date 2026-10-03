import { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';

export default function TermsPage({ onClose, asModal = false }) {
  const [ewbCharge, setEwbCharge] = useState(2000);

  useEffect(() => {
    fetch('/api/eway/charge')
      .then(r => r.json())
      .then(d => { if (d.success) setEwbCharge(d.paise); })
      .catch(() => {});
  }, []);

  const chargeRupees = (ewbCharge / 100).toFixed(2);

  const content = (
    <div className="terms-body">

      <div className="terms-meta">
        <p><strong>Effective Date:</strong> March 10, 2026</p>
        <p><strong>Last Updated:</strong> March 10, 2026</p>
        <p><strong>Service Provider:</strong> Kena Software Solutions Private Limited</p>
      </div>

      <p className="terms-intro">
        Please read these Terms and Conditions ("Terms") carefully before registering for or using the
        E-Waybill Generator platform ("Service") operated by <strong>Kena Software Solutions Private
        Limited</strong> ("Company", "we", "us", or "our"). By registering an account, accessing, or
        using the Service in any manner, you ("User", "you", or "your") agree to be bound by these
        Terms in their entirety. If you do not agree with any part of these Terms, you must not use
        the Service.
      </p>

      {/* ── 1 ── */}
      <h2>1. About the Service</h2>
      <p>
        The E-Waybill Generator is a Software-as-a-Service (SaaS) platform that enables registered
        GST taxpayers to generate, manage, and download e-waybills through the National Informatics
        Centre (NIC) E-Waybill System via an authorised GST Suvidha Provider (GSP). The Company
        provides the technology interface; the actual e-waybill data and numbering are governed by
        the NIC / GSTN systems operated by the Government of India.
      </p>

      {/* ── 2 ── */}
      <h2>2. Eligibility</h2>
      <ul>
        <li>You must be a GST-registered taxpayer or an authorised representative of one.</li>
        <li>You must be at least 18 years of age.</li>
        <li>Your GSTIN must be valid, active, and registered under the GST Act, 2017.</li>
        <li>You must possess valid credentials for the NIC E-Waybill portal (<em>ewaybillgst.gov.in</em>).</li>
        <li>Use of the Service for personal, non-commercial, or fraudulent purposes is strictly prohibited.</li>
      </ul>

      {/* ── 3 ── */}
      <h2>3. Account Registration and Security</h2>
      <p>
        3.1 <strong>Accurate Information:</strong> You agree to provide accurate, current, and
        complete information during registration, including your GSTIN, business name, address, and
        NIC portal credentials. You are solely responsible for any consequences arising from
        inaccurate or false information.
      </p>
      <p>
        3.2 <strong>Credential Confidentiality:</strong> You are responsible for maintaining the
        confidentiality of your app login credentials (username and password). You must notify us
        immediately at <a href="mailto:support@kenasoftware.com">support@kenasoftware.com</a> if you
        suspect any unauthorised access to your account.
      </p>
      <p>
        3.3 <strong>NIC Portal Credentials:</strong> You authorise the Company to use your NIC
        e-waybill portal credentials solely and exclusively for the purpose of generating e-waybills
        on your behalf. These credentials are stored in encrypted form and are not shared with any
        third party other than the GSP required to process the request.
      </p>
      <p>
        3.4 <strong>Account Approval:</strong> Account activation is subject to verification and
        approval by Company administrators. The Company reserves the right to reject, suspend, or
        terminate any account at its sole discretion.
      </p>

      {/* ── 4 ── */}
      <h2>4. Wallet, Payments, and Charges</h2>
      <p>
        4.1 <strong>Pre-paid Wallet:</strong> The Service operates on a pre-paid wallet model. You
        must maintain a sufficient wallet balance to use the Service. Wallet credits are purchased in
        advance via supported payment methods.
      </p>
      <p>
        4.2 <strong>Per-Transaction Charge:</strong> A charge of <strong>₹{chargeRupees}</strong>
        is deducted from your wallet for each successfully generated e-waybill. No charge is levied
        for failed API attempts caused by incorrect user inputs. The applicable charge is as
        configured by the Company and displayed within the platform at the time of generation.
      </p>
      <p>
        4.3 <strong>Non-refundable Credits:</strong> Wallet credits are non-refundable except at the
        sole discretion of the Company. Credits cannot be transferred to another account or redeemed
        for cash.
      </p>
      <p>
        4.4 <strong>Pricing Changes:</strong> The Company reserves the right to revise the
        per-transaction charge at any time with at least 7 days' prior notice communicated through
        the platform or registered contact details.
      </p>
      <p>
        4.5 <strong>Payment Accuracy:</strong> All payments made via the platform are processed
        through third-party payment gateways. The Company is not responsible for payment failures,
        delays, or disputes arising from payment gateway issues. GST (if applicable) on the
        platform's service fees will be charged as per prevailing rates.
      </p>

      {/* ── 5 ── */}
      <h2>5. User Obligations and Prohibited Conduct</h2>
      <p>By using the Service, you agree to:</p>
      <ul>
        <li>Provide true and accurate data for every e-waybill generated.</li>
        <li>Comply with all applicable GST laws, rules, and notifications issued by the Government of India.</li>
        <li>Ensure that the goods being transported correspond accurately to the e-waybill details.</li>
        <li>Not use the Service to generate e-waybills for fictitious, non-existent, or fraudulent transactions.</li>
        <li>Not attempt to reverse-engineer, hack, scrape, or interfere with the platform's systems.</li>
        <li>Not share your login credentials with unauthorised persons.</li>
        <li>Not use any automated tools, bots, or scripts to access the Service without prior written consent.</li>
        <li>Immediately update your account information if any details change.</li>
      </ul>

      {/* ── 6 ── */}
      <h2>6. Service Availability and Limitations</h2>
      <p>
        6.1 The Service is dependent on third-party systems including the NIC e-waybill portal,
        GSP APIs, and government infrastructure. The Company does not guarantee uninterrupted or
        error-free availability of the Service.
      </p>
      <p>
        6.2 Scheduled maintenance, government system downtime, or force majeure events may result
        in temporary unavailability. The Company will endeavour to notify users of planned downtime
        in advance.
      </p>
      <p>
        6.3 The Company does not guarantee the accuracy, completeness, or timeliness of data
        returned by GSTIN lookup or distance calculation APIs, as these depend on government databases.
      </p>

      {/* ── 7 ── */}
      <h2>7. Data Privacy and Security</h2>
      <p>
        7.1 <strong>Data Collected:</strong> We collect and store your business name, GSTIN,
        address, contact information, NIC portal credentials (encrypted), wallet transaction records,
        and e-waybill generation logs.
      </p>
      <p>
        7.2 <strong>Data Usage:</strong> Your data is used exclusively to provide the Service,
        process wallet transactions, generate e-waybills, and fulfil statutory or legal obligations.
        We do not sell your personal or business data to third parties.
      </p>
      <p>
        7.3 <strong>Credential Security:</strong> NIC portal passwords are stored using
        industry-standard encryption. Notwithstanding, you acknowledge that no digital system
        is entirely immune to security breaches and use the Service at your own risk in this regard.
      </p>
      <p>
        7.4 <strong>Data Retention:</strong> Transaction logs and e-waybill records are retained
        for a minimum period as required by applicable GST and tax laws.
      </p>
      <p>
        7.5 <strong>Cookies:</strong> The platform may use session tokens stored in your browser's
        local storage for authentication purposes. No third-party tracking cookies are used.
      </p>

      {/* ── 8 ── */}
      <h2>8. Intellectual Property</h2>
      <p>
        All software, design, logos, trade names, and content forming part of the E-Waybill
        Generator platform are the exclusive intellectual property of Kena Software Solutions
        Private Limited. You are granted a limited, non-exclusive, non-transferable licence to use
        the Service for your lawful business purposes only. No rights are granted to reproduce,
        distribute, modify, or create derivative works from any part of the platform.
      </p>

      {/* ── 9 ── */}
      <h2>9. Limitation of Liability</h2>
      <p>
        9.1 To the maximum extent permitted by applicable law, the Company shall not be liable for:
      </p>
      <ul>
        <li>Any penalties, fines, or notices issued by tax authorities due to incorrect e-waybill data submitted by you.</li>
        <li>Loss or damage arising from NIC portal downtime, GSP API failures, or government system errors.</li>
        <li>Indirect, incidental, special, consequential, or punitive damages of any kind.</li>
        <li>Loss of business, revenue, goodwill, or data arising out of use or inability to use the Service.</li>
        <li>Unauthorised access to your account caused by your failure to maintain credential confidentiality.</li>
      </ul>
      <p>
        9.2 The Company's total liability for any claim arising under or in connection with these
        Terms shall not exceed the total amount paid by you to the Company in the three (3) months
        immediately preceding the event giving rise to the claim.
      </p>

      {/* ── 10 ── */}
      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless Kena Software Solutions Private Limited,
        its directors, officers, employees, and agents from and against any claims, liabilities,
        damages, losses, and expenses (including legal fees) arising from: (a) your use or misuse
        of the Service; (b) your violation of these Terms; (c) your violation of any applicable
        law or regulation; or (d) any fraudulent or incorrect information provided by you.
      </p>

      {/* ── 11 ── */}
      <h2>11. Termination</h2>
      <p>
        11.1 You may discontinue using the Service at any time. Unused wallet balance refunds upon
        account closure are subject to the Company's refund policy at the time of closure.
      </p>
      <p>
        11.2 The Company may suspend or terminate your account without prior notice if: (a) you
        violate these Terms; (b) fraudulent activity is detected; (c) required by law or regulatory
        authority; or (d) your account remains inactive for more than 12 months.
      </p>
      <p>
        11.3 Upon termination, your right to access the Service ceases immediately. Transaction
        records will be retained as required by law.
      </p>

      {/* ── 12 ── */}
      <h2>12. Amendments to Terms</h2>
      <p>
        The Company reserves the right to update or modify these Terms at any time. Changes will
        be posted on the platform with the revised effective date. Your continued use of the Service
        after such changes constitutes your acceptance of the revised Terms. It is your responsibility
        to review these Terms periodically.
      </p>

      {/* ── 13 ── */}
      <h2>13. Governing Law and Dispute Resolution</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of India. Any
        disputes arising out of or relating to these Terms or the Service shall be subject to the
        exclusive jurisdiction of the courts located in <strong>Bengaluru, Karnataka, India</strong>.
        The parties shall first attempt to resolve any dispute through good-faith negotiation before
        initiating legal proceedings.
      </p>

      {/* ── 14 ── */}
      <h2>14. Grievance Redressal</h2>
      <p>
        In accordance with the Information Technology Act, 2000 and applicable rules, the name and
        contact details of the Grievance Officer are:
      </p>
      <div className="terms-contact-box">
        <p><strong>Grievance Officer</strong></p>
        <p>Kena Software Solutions Private Limited</p>
        <p>Email: <a href="mailto:grievance@kenasoftware.com">grievance@kenasoftware.com</a></p>
        <p>Time to resolution: within 30 days of receipt of complaint.</p>
      </div>

      {/* ── 15 ── */}
      <h2>15. Miscellaneous</h2>
      <ul>
        <li><strong>Entire Agreement:</strong> These Terms constitute the entire agreement between you and the Company regarding the Service.</li>
        <li><strong>Severability:</strong> If any provision of these Terms is found unenforceable, the remaining provisions shall continue in full force.</li>
        <li><strong>Waiver:</strong> Failure to enforce any provision of these Terms shall not constitute a waiver of that provision.</li>
        <li><strong>Assignment:</strong> You may not assign your rights under these Terms without prior written consent of the Company.</li>
        <li><strong>Language:</strong> These Terms are written in English. In case of any conflict with a translation, the English version shall prevail.</li>
      </ul>

      <div className="terms-footer-note">
        <p>
          By registering and using the E-Waybill Generator platform, you acknowledge that you have
          read, understood, and agree to be bound by these Terms and Conditions.
        </p>
        <p><strong>Kena Software Solutions Private Limited</strong><br />
        Bengaluru, Karnataka, India</p>
      </div>

    </div>
  );

  /* ── Modal mode (used from AuthScreen) ── */
  if (asModal) {
    return (
      <div className="terms-modal-overlay" onClick={onClose}>
        <div className="terms-modal" onClick={e => e.stopPropagation()}>
          <div className="terms-modal-header">
            <div className="terms-modal-title">
              <FileText size={20} />
              <span>Terms &amp; Conditions</span>
            </div>
            <button className="terms-close-btn" onClick={onClose} title="Close">
              <X size={20} />
            </button>
          </div>
          <div className="terms-modal-body">
            {content}
          </div>
          <div className="terms-modal-footer">
            <button className="btn-auth-primary" style={{ maxWidth: 200 }} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Full page mode (used from footer) ── */
  return (
    <div className="terms-page">
      <div className="terms-page-header">
        <button className="terms-back-btn" onClick={onClose}>
          ← Back
        </button>
        <div className="terms-page-title">
          <FileText size={22} />
          <h1>Terms &amp; Conditions</h1>
        </div>
        <div style={{ width: 80 }} />
      </div>
      <div className="terms-page-content">
        {content}
      </div>
    </div>
  );
}
