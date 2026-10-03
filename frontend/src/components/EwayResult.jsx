import { Download, Share2, CheckCircle, Copy, Send, Printer, RefreshCw, Eye } from 'lucide-react';
import { useState } from 'react';
import { showToast } from './Toast';

export default function EwayResult({ result, formData, token }) {
  const [copied,   setCopied]   = useState(false);
  const [fetching, setFetching] = useState(false);

  const ewbNo   = result?.ewbNo || '';
  const filename = `EWaybill-${ewbNo}.pdf`;
  const viewUrl  = token ? `/api/eway/pdf/${ewbNo}?token=${encodeURIComponent(token)}` : null;
  const shareText  = `E-Waybill\nEWB No: ${ewbNo}\nFrom: ${formData?.fromTradeName || ''}\nTo: ${formData?.toTradeName || ''}\nValid Till: ${result?.validUpto || ''}`;

  // ── Download ──
  // Primary: data URI from pdfBase64 in memory — purely synchronous, no fetch, no navigation.
  // This is the most reliable approach for Android Chrome PWA.
  // Fallback: open inline view in new tab so user can use browser's native download button.
  const handleDownload = () => {
    if (result?.pdfBase64) {
      try {
        const a    = document.createElement('a');
        a.href     = 'data:application/pdf;base64,' + result.pdfBase64;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('PDF downloaded successfully');
        return;
      } catch {}
    }
    // Fallback: open the PDF URL in new tab (user can download from browser's PDF viewer)
    if (viewUrl) { window.open(viewUrl, '_blank'); showToast('PDF opened in new tab'); }
  };

  // ── Share PDF ──
  const handleShare = async () => {
    // APK mode: use Android JS bridge
    if (window.Android?.sharePdf) {
      if (result?.pdfBase64) {
        window.Android.sharePdf(result.pdfBase64, filename);
      } else if (viewUrl) {
        try {
          const r = await fetch(viewUrl);
          if (!r.ok) { alert('PDF not found'); return; }
          const blob = await r.blob();
          const reader = new FileReader();
          reader.onload = () => window.Android.sharePdf(reader.result.split(',')[1], filename);
          reader.readAsDataURL(blob);
        } catch { alert('Failed to share PDF'); }
      }
      return;
    }
    // Browser: Web Share API with file
    if (result?.pdfBase64) {
      try {
        const bytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
        const blob  = new Blob([bytes], { type: 'application/pdf' });
        const file  = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: filename, text: shareText });
          showToast('Shared successfully');
          return;
        }
      } catch (e) { if (e?.name === 'AbortError') return; }
    }
    // Fallback: text-only share
    if (navigator.share) {
      try { await navigator.share({ title: `E-Waybill ${ewbNo}`, text: shareText }); }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
  };

  const fetchFromGsp = async () => {
    setFetching(true);
    try {
      const r = await fetch(`/api/eway/fetch-pdf/${ewbNo}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) alert('PDF refreshed successfully!');
      else alert(d.error || 'Failed to refresh');
    } catch { alert('Network error'); }
    setFetching(false);
  };

  const copyEwbNo = () => {
    navigator.clipboard?.writeText(ewbNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent('https://ewaybillgst.gov.in')}&text=${encodeURIComponent(shareText)}`;

  return (
    <div className="result-card">
      <div className="result-header">
        <CheckCircle size={32} className="success-icon" />
        <h2>E-Waybill Generated!</h2>
      </div>

      <div className="ewb-details">
        <div className="ewb-row">
          <span className="ewb-label">EWB Number</span>
          <span className="ewb-value big">
            {ewbNo}
            <button className="icon-btn" onClick={copyEwbNo} title="Copy">
              {copied ? '✓' : <Copy size={14} />}
            </button>
          </span>
        </div>
        <div className="ewb-row">
          <span className="ewb-label">Valid Till</span>
          <span className="ewb-value">{result?.validUpto || 'As per GST rules'}</span>
        </div>
        {formData?.fromTradeName && (
          <div className="ewb-row">
            <span className="ewb-label">From</span>
            <span className="ewb-value">{formData.fromTradeName}</span>
          </div>
        )}
        {formData?.toTradeName && (
          <div className="ewb-row">
            <span className="ewb-label">To</span>
            <span className="ewb-value">{formData.toTradeName}</span>
          </div>
        )}
        <div className="ewb-row">
          <span className="ewb-label">Status</span>
          <span className="ewb-value status-badge">Active</span>
        </div>
      </div>

      {/* Actions */}
      <div className="result-actions">
        <button className="btn-outline result-action-link" onClick={async () => {
          if (window.Android?.openPdf) {
            // APK: use base64 in memory if available, else fetch from server
            if (result?.pdfBase64) {
              window.Android.openPdf(result.pdfBase64, filename);
            } else if (viewUrl) {
              try {
                const r = await fetch(viewUrl);
                if (!r.ok) { alert('PDF not found'); return; }
                const blob = await r.blob();
                const reader = new FileReader();
                reader.onload = () => window.Android.openPdf(reader.result.split(',')[1], filename);
                reader.readAsDataURL(blob);
              } catch { alert('Failed to open PDF'); }
            }
          } else {
            if (viewUrl) window.open(viewUrl, '_blank');
          }
        }}>
          <Printer size={16} /> Open / Print
        </button>
        <button className="btn-primary result-action-link" onClick={handleDownload}>
          <Download size={16} /> Download PDF
        </button>
        {result?.invoiceBase64 && (
          <button className="btn-outline result-action-link" onClick={() => {
            try {
              const a    = document.createElement('a');
              a.href     = 'data:application/pdf;base64,' + result.invoiceBase64;
              a.download = result.invoiceFilename || `Invoice-${ewbNo}.pdf`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              showToast('Invoice downloaded');
            } catch { if (token && result.invoiceFilename) window.location.href = `/api/eway/invoice/${encodeURIComponent(result.invoiceFilename)}?token=${encodeURIComponent(token)}`; }
          }}>
            <Eye size={16} /> View Invoice
          </button>
        )}
        <button className="btn-share" onClick={handleShare}>
          <Share2 size={16} /> Share
        </button>
      </div>

      {/* Telegram direct link */}
      <div className="share-options" style={{ marginTop: 12 }}>
        <p className="share-title">Share via</p>
        <div className="share-buttons">
          <button className="share-opt telegram" onClick={() => window.open(tgUrl, '_blank')}>
            <Send size={18} /> Telegram
          </button>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button className="btn-sm" onClick={fetchFromGsp} disabled={fetching}
          style={{ fontSize: 11, color: '#64748b' }}>
          <RefreshCw size={12} /> {fetching ? 'Refreshing…' : 'Refresh from GSP'}
        </button>
      </div>

      {result?.invoiceFilename && token && (
        <div className="invoice-download-row">
          <button
            className="btn-invoice"
            onClick={() => { window.location.href = `/api/eway/invoice/${encodeURIComponent(result.invoiceFilename)}?token=${encodeURIComponent(token)}`; }}
          >
            <Download size={14} /> Download GST Invoice
          </button>
          <span className="invoice-note">Tax invoice for ₹ service charge with GST</span>
        </div>
      )}

      <p className="verify-note">Verify at <strong>ewaybillgst.gov.in</strong> using EWB No: {ewbNo}</p>
      <p className="history-note">Saved to History automatically.</p>
    </div>
  );
}
