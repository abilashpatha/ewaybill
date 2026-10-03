import puppeteer from 'puppeteer';
import QRCode    from 'qrcode';
import fs        from 'fs';
import path      from 'path';
import { INVOICES_DIR, EWB_PDFS_DIR } from '../middleware/upload.js';

async function renderPdf(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    preferCSSPageSize: true,
  });
  await browser.close();
  return Buffer.from(pdfBuffer);
}

export async function generateEwayPdf(ewbData, formData) {
  const ewbNo     = ewbData.ewayBillNo || ewbData.EwbNo || '';
  const validUpto = ewbData.validUpto  || ewbData.EwbValidTill || '';
  const genDate   = ewbData.ewayBillDate || new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const qrContent = [ewbNo, formData.fromGstin||'', formData.toGstin||'URP',
    formData.docNo||'', formData.docDate||'', validUpto,
    formData.fromPincode||'', formData.toPincode||'',
    parseFloat(formData.taxableAmount||0).toFixed(2)].join('|');

  const qrDataUrl = await QRCode.toDataURL(qrContent, { errorCorrectionLevel: 'M', width: 120, margin: 1 });

  const html = buildHtml(ewbData, formData, qrDataUrl, ewbNo, validUpto, genDate);
  const buf  = await renderPdf(html);
  const filename = `ewb_${ewbNo || Date.now()}.pdf`;
  const filepath = path.join(EWB_PDFS_DIR, filename);
  fs.writeFileSync(filepath, buf);
  return { base64: buf.toString('base64'), filename, filepath };
}

function v(val, fb = '') { return (val !== undefined && val !== null && String(val).trim() !== '') ? String(val).trim() : fb; }
function money(n) { return parseFloat(n||0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(r, taxable) { return money(parseFloat(taxable||0) * (parseFloat(r)||0) / 100); }

function buildHtml(ewb, form, qrDataUrl, ewbNo, validUpto, genDate) {
  const taxable  = parseFloat(form.taxableAmount || 0);
  const cgstAmt  = taxable * (parseFloat(form.cgstRate) ||0) / 100;
  const sgstAmt  = taxable * (parseFloat(form.sgstRate) ||0) / 100;
  const igstAmt  = taxable * (parseFloat(form.igstRate) ||0) / 100;
  const cessAmt  = taxable * (parseFloat(form.cessRate) ||0) / 100;
  const totalAmt = taxable + cgstAmt + sgstAmt + igstAmt + cessAmt;

  const supplyDesc = `${form.supplyType === 'O' ? 'Outward' : 'Inward'} - ${
    {'1':'Supply','2':'Import','3':'Export','4':'Job Work','5':'For Own Use','6':'Job Work Returns','7':'Sales Return','8':'Others','9':'SKD/CKD','10':'Line Sales','11':'Recipient Not Known'}[String(form.subSupplyType)]||'Supply'}`;
  const docTypeLabel = { INV:'Tax Invoice', BIL:'Bill of Supply', CHL:'Delivery Challan', BOE:'Bill of Entry', OTH:'Others' }[form.docType] || v(form.docType,'Tax Invoice');
  const transMode    = ['','Road','Rail','Air','Ship'][parseInt(form.transportMode)] || v(form.transportMode,'Road');
  const stateNameFrom = v(form.fromStateCode,'');
  const stateNameTo   = v(form.toStateCode,'');

  // Tax rate display: CGST+SGST+IGST+CESS+CESSNonAdvol
  const taxRateDisplay = `${v(form.cgstRate,'NE')}+${v(form.sgstRate,'NE')}+${v(form.igstRate,'NE')}+${v(form.cessRate,'NE')}+0.00`;

  const fromAddr = [form.fromAddr1, form.fromAddr2].filter(Boolean).join(', ');
  const fromCity = [form.fromPlace, stateNameFrom, form.fromPincode ? `-${form.fromPincode}` : ''].filter(Boolean).join('');
  const toAddr   = [form.toAddr1,   form.toAddr2  ].filter(Boolean).join(', ');
  const toCity   = [form.toPlace,   stateNameTo,   form.toPincode   ? `-${form.toPincode}`   : ''].filter(Boolean).join('');

  // Format doc date for display
  const docDateDisplay = (() => {
    const d = v(form.docDate);
    if (!d) return '';
    if (d.includes('/')) return d;
    const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`;
  })();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>e-Way Bill ${ewbNo}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    color: #000;
    background: #fff;
    width: 210mm;
    height: 297mm;
    position: relative;
  }
  .page {
    width: 210mm;
    height: 297mm;
    padding: 6mm;
    position: relative;
    overflow: hidden;
  }

  /* ── Top header area (outside black frame) ── */
  .top-area {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2mm;
    padding: 0 1mm;
  }
  .top-title { font-size: 16pt; font-weight: bold; }
  .top-qr img { width: 22mm; height: 22mm; border: 1px solid #ccc; }

  /* ── Main black border box ── */
  .main-box {
    border: 1.5pt solid #000;
    width: 100%;
  }

  /* ── Section header grey band ── */
  .sec-header {
    background: #fff;
    border-bottom: 0.6pt solid #999;
    padding: 3pt 5pt;
    font-weight: bold;
    font-size: 9pt;
  }
  .sec-header-grey {
    background: #999;
    border-bottom: 0.6pt solid #999;
    padding: 3pt 5pt;
    font-weight: bold;
    font-size: 9pt;
    color: #000;
  }

  /* ── Row helpers ── */
  .data-row {
    display: flex;
    gap: 0;
    padding: 3pt 5pt;
    font-size: 9pt;
    border-bottom: 0.6pt solid #eee;
  }
  .data-row:last-child { border-bottom: none; }
  .col3 { flex: 1; }
  .label { color: #000; }
  .val   { font-weight: normal; }
  .val-bold { font-weight: bold; }

  /* ── Section 2: address two-column ── */
  .addr-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 0.6pt solid #999;
  }
  .addr-col { padding: 3pt 5pt; font-size: 8.5pt; }
  .addr-col:first-child { border-right: 0.6pt solid #999; }
  .addr-col-head { font-weight: bold; font-size: 9pt; border-bottom: 0.6pt solid #999; padding: 3pt 5pt; display: grid; grid-template-columns: 1fr 1fr; }
  .addr-sub  { color: #555; margin: 1.5pt 0; font-size: 8.5pt; }
  .addr-name { font-weight: bold; font-size: 9pt; }
  .dispatch-label { color: #555; margin: 1.5pt 0 0.5pt 0; }

  /* ── Goods table ── */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th {
    border: 0.6pt solid #999;
    padding: 3pt 4pt;
    font-weight: bold;
    font-size: 8.5pt;
    text-align: left;
    vertical-align: top;
    background: #fff;
  }
  td {
    border: 0.6pt solid #999;
    padding: 3pt 4pt;
    vertical-align: top;
    font-size: 8.5pt;
  }
  .tr-white { background: #fff; }

  /* ── Totals row ── */
  .totals-row { font-size: 8.5pt; }

  /* ── Section border separator ── */
  .sec-border { border-top: 0.6pt solid #999; }

  /* ── Bottom grey bar ── */
  .bottom-bar {
    background: #999;
    height: 6mm;
    border-top: 0.6pt solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8.5pt;
    font-weight: bold;
    letter-spacing: 1pt;
  }

  /* ── Transport 2-col ── */
  .trans-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .trans-cell { padding: 3pt 5pt; font-size: 9pt; }
  .trans-cell:first-child { border-right: 0.6pt solid #999; }
</style>
</head>
<body>
<div class="page">

  <!-- TOP: title + QR (outside frame) -->
  <div class="top-area">
    <div class="top-title">e-Way Bill</div>
    <div class="top-qr"><img src="${qrDataUrl}" alt="QR"/></div>
  </div>

  <!-- MAIN BOX -->
  <div class="main-box">

    <!-- ══ SECTION 1: E-WAY BILL Details ══ -->
    <div class="sec-header">1. E-WAY BILL Details</div>

    <div class="data-row">
      <div class="col3"><span class="label">eWay Bill No: </span><strong>${ewbNo}</strong></div>
      <div class="col3"><span class="label">Generated Date: </span>${v(genDate)}</div>
      <div class="col3"><span class="label">Generated By: </span>${v(form.fromGstin)}</div>
    </div>
    <div class="data-row">
      <div class="col3"></div>
      <div class="col3"></div>
      <div class="col3"><span class="label">Valid Upto: </span><strong>${validUpto}</strong></div>
    </div>
    <div class="data-row">
      <div class="col3"><span class="label">Mode: </span>${transMode}</div>
      <div class="col3"><span class="label">Approx Distance: </span>${v(form.transDistance,'—')} km</div>
      <div class="col3"></div>
    </div>
    <div class="data-row">
      <div class="col3"><span class="label">Type: </span>${supplyDesc}</div>
      <div class="col3">
        <span class="label">Document Details: </span>${docTypeLabel} - ${v(form.docNo)} -
        <strong>${docDateDisplay}</strong>
        &nbsp;&nbsp;<span class="label">Transaction type: </span>Regular
      </div>
      <div class="col3"><span class="label">Portal: </span>1</div>
    </div>

    <!-- ══ SECTION 2: Address Details ══ -->
    <div class="sec-header sec-border">2. Address Details</div>

    <div class="addr-col-head">
      <div>From</div>
      <div>To</div>
    </div>

    <div class="addr-grid">
      <!-- FROM -->
      <div class="addr-col">
        <div class="addr-sub">GSTIN : ${v(form.fromGstin,'—')}</div>
        <div class="addr-name">${v(form.fromTradeName,'—')}</div>
        <div class="addr-sub">${v(form.fromPlace,'')}${stateNameFrom ? ', '+stateNameFrom : ''}</div>
        <div class="dispatch-label">:: Dispatch From ::</div>
        ${fromAddr ? `<div>${fromAddr}</div>` : ''}
        <div>${v(form.fromPlace,'')}${stateNameFrom?','+stateNameFrom:''}-${v(form.fromPincode,'')}</div>
      </div>
      <!-- TO -->
      <div class="addr-col">
        <div class="addr-sub">GSTIN : ${v(form.toGstin,'URP')}</div>
        <div class="addr-name">${v(form.toTradeName,'—')}</div>
        <div class="addr-sub">${v(form.toPlace,'')}${stateNameTo?', '+stateNameTo:''}</div>
        <div class="dispatch-label">:: Ship To ::</div>
        ${toAddr ? `<div>${toAddr}</div>` : ''}
        <div>${v(form.toPlace,'')}${stateNameTo?','+stateNameTo:''}-${v(form.toPincode,'')}</div>
      </div>
    </div>

    <!-- ══ SECTION 3: Goods Details ══ -->
    <div class="sec-header sec-border">3. Goods Details</div>

    <table style="margin:0;">
      <thead>
        <tr>
          <th style="width:12%">HSN<br/>Code</th>
          <th style="width:38%">Product Name &amp; Desc.</th>
          <th style="width:10%">Quantity</th>
          <th style="width:15%">Taxable<br/>Amount Rs.</th>
          <th style="width:25%">Tax Rate<br/>(C+S+I+Cess+Cess Non.Advol)</th>
        </tr>
      </thead>
      <tbody>
        <tr class="tr-white">
          <td>${v(form.hsnCode)}</td>
          <td>${v(form.productName)}${form.productDesc && form.productDesc !== form.productName ? '<br/><span style="color:#555">'+form.productDesc+'</span>' : ''}</td>
          <td>${v(form.quantity)}<br/>${v(form.qtyUnit)}</td>
          <td>${money(taxable)}</td>
          <td>${taxRateDisplay}</td>
        </tr>
      </tbody>
    </table>

    <!-- Totals table -->
    <table style="margin:0;border-top:0.6pt solid #999;">
      <thead>
        <tr>
          <th>Tot. Tax'ble Amt</th>
          <th>CGST Amt</th>
          <th>SGST Amt</th>
          <th>IGST Amt</th>
          <th>CESS Amt</th>
          <th>CESS Non.Advol Amt</th>
          <th>Other Amt</th>
          <th>Total Inv.Amt</th>
        </tr>
      </thead>
      <tbody>
        <tr class="totals-row">
          <td>${money(taxable)}</td>
          <td>${money(cgstAmt)}</td>
          <td>${money(sgstAmt)}</td>
          <td>${money(igstAmt)}</td>
          <td>${money(cessAmt)}</td>
          <td>0.00</td>
          <td>0.00</td>
          <td><strong>${money(totalAmt)}</strong></td>
        </tr>
      </tbody>
    </table>

    <!-- ══ SECTION 4: Transportation Details ══ -->
    <div class="sec-header sec-border">4. Transportation Details</div>
    <div class="trans-grid sec-border">
      <div class="trans-cell">
        <span class="label">Transporter ID &amp; Name : </span>
        ${v(form.transporterId,'')} ${v(form.transporterName,'')||'—'}
      </div>
      <div class="trans-cell">
        <span class="label">Transporter Doc. No &amp; Date : </span>
        ${v(form.transDocNo,'')} &nbsp; ${docDateDisplay}
      </div>
    </div>

    <!-- ══ SECTION 5: Vehicle Details ══ -->
    <div class="sec-header sec-border">5. Vehicle Details</div>

    <table style="margin:0;border-top:0.6pt solid #999;">
      <thead>
        <tr>
          <th>Mode</th>
          <th>Vehicle / Trans<br/>Doc No &amp; Dt.</th>
          <th>From</th>
          <th>Entered Date</th>
          <th>Entered By</th>
          <th>CEWB No.<br/>(If any)</th>
          <th>Multi Veh.Info<br/>(If any)</th>
          <th>Portal</th>
        </tr>
      </thead>
      <tbody>
        <tr class="tr-white">
          <td>${transMode}</td>
          <td>${v(form.vehicleNo,'—')}</td>
          <td>${v(form.fromPlace,'—')}</td>
          <td>${v(genDate)}</td>
          <td>${v(form.fromGstin,'—')}</td>
          <td>-</td>
          <td>-</td>
          <td>1</td>
        </tr>
      </tbody>
    </table>

    <!-- Bottom grey bar with EWB number -->
    <div class="bottom-bar">
      ${ewbNo}
    </div>

  </div><!-- /main-box -->
</div><!-- /page -->
</body>
</html>`;
}

/**
 * Generate a GST invoice PDF for the e-waybill service charge.
 */
export async function generateInvoicePdf(invoiceData) {
  const html = buildInvoiceHtml(invoiceData);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();

  const filename = `invoice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
  fs.writeFileSync(path.join(INVOICES_DIR, filename), pdfBuffer);
  return { filename, base64: Buffer.from(pdfBuffer).toString('base64') };
}

function buildInvoiceHtml(d) {
  const base  = (d.basePaise  / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const gst   = (d.gstPaise   / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const total = (d.totalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const now   = new Date(d.date || Date.now()).toLocaleString('en-IN');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Service Invoice</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a56db; padding-bottom: 14px; margin-bottom: 20px; }
  .brand h1 { font-size: 20px; color: #1a56db; }
  .brand p  { color: #555; font-size: 11px; }
  .inv-meta { text-align: right; }
  .inv-meta h2 { font-size: 16px; color: #1a56db; }
  .inv-meta p  { color: #555; font-size: 11px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .party-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .party-box h3 { font-size: 11px; text-transform: uppercase; color: #6366f1; margin-bottom: 8px; }
  .party-box p  { font-size: 11px; color: #444; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead tr { background: #1a56db; color: white; }
  th { padding: 8px 10px; text-align: left; font-size: 11px; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  .amt { text-align: right; }
  .sub-row td { color: #555; }
  .gst-row td { color: #d97706; font-weight: 600; }
  .total-row td { font-weight: bold; background: #f0f4ff; border-top: 2px solid #1a56db; font-size: 13px; }
  .footer { text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px; }
  .paid-stamp { display: inline-block; border: 3px solid #16a34a; color: #16a34a; padding: 4px 16px; border-radius: 6px; font-weight: bold; font-size: 16px; transform: rotate(-8deg); margin-top: 12px; }
</style>
</head>
<body>
<div class="header">
  <div class="brand">
    <h1>&#9889; Kena Software Solutions</h1>
    <p>E-Waybill Generation Service</p>
    <p>Email: hr@kenasoft.com | Phone: +91-8919066381</p>
  </div>
  <div class="inv-meta">
    <h2>TAX INVOICE</h2>
    <p>Invoice No: <strong>${d.invoiceNo}</strong></p>
    <p>Date: ${now}</p>
    <p>EWB No: <strong>${d.ewbNo}</strong></p>
  </div>
</div>
<div class="parties">
  <div class="party-box">
    <h3>Service Provider</h3>
    <p><strong>Kena Software Solutions</strong></p>
    <p>E-Waybill Generation Service</p>
    <p>hr@kenasoft.com | +91-8919066381</p>
  </div>
  <div class="party-box">
    <h3>Billed To</h3>
    <p><strong>${d.tradeName || ''}</strong></p>
    <p>GSTIN: ${d.gstin || '—'}</p>
    ${d.place ? `<p>${d.place}${d.stateCode ? ` — State Code: ${d.stateCode}` : ''}</p>` : ''}
  </div>
</div>
<table>
  <thead><tr><th>#</th><th>Description</th><th>SAC Code</th><th class="amt">Amount (&#8377;)</th></tr></thead>
  <tbody>
    <tr class="sub-row"><td>1</td><td>E-Waybill Generation Service (EWB: ${d.ewbNo})</td><td>998314</td><td class="amt">&#8377;${base}</td></tr>
    <tr class="gst-row"><td colspan="3">GST @ ${d.gstRate}%</td><td class="amt">&#8377;${gst}</td></tr>
    <tr class="total-row"><td colspan="3">Total Amount Charged</td><td class="amt">&#8377;${total}</td></tr>
  </tbody>
</table>
<div style="text-align:center">
  <div class="paid-stamp">PAID</div>
  <p style="margin-top:8px;color:#555;font-size:11px">Amount of &#8377;${total} deducted from wallet balance.</p>
</div>
<div class="footer"><p>This is a computer-generated invoice. No signature required.</p></div>
</body>
</html>`;
}
