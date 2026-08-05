import type { OrderInvoiceData } from "@/actions/orders";

const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY_CODE ?? "PKR";
const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? "en-PK";

function fmt(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds an 80mm thermal receipt HTML document optimized for standard
 * 80mm thermal receipt printers. Uses monospace fonts, no colors, and
 * dashed separators for maximum printer compatibility.
 */
export function buildReceiptHTML(invoice: OrderInvoiceData): string {
  const invNo = `INV-${invoice.orderId.slice(0, 8).toUpperCase()}`;
  const date = new Date(invoice.createdAt).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHTML = invoice.items
    .map((item) => {
      const lineTotal = item.unit_price_cents * item.quantity;
      return `<tr>
        <td class="qty">${item.quantity}×</td>
        <td class="name">${esc(item.name)}${item.notes ? `<div class="notes">${esc(item.notes)}</div>` : ""}</td>
        <td class="price">${fmt(lineTotal)}</td>
      </tr>`;
    })
    .join("");

  const dashedLine = '<div class="dashed">----------------------------------------------</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${invNo}</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Courier New", "Consolas", monospace;
    font-size: 12px;
    color: #000;
    background: #fff;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt {
    width: 80mm;
    max-width: 80mm;
    padding: 4mm 3mm;
    margin: 0 auto;
  }
  .center { text-align: center; }
  .restaurant-name { font-size: 16px; font-weight: bold; }
  .restaurant-info { font-size: 11px; }
  .dashed {
    text-align: center;
    font-size: 11px;
    letter-spacing: -1px;
    margin: 4px 0;
  }
  .meta { font-size: 11px; }
  .meta-row { display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .qty { width: 14%; white-space: nowrap; }
  .name { width: 56%; word-break: break-word; }
  .price { width: 30%; text-align: right; white-space: nowrap; }
  .notes { font-size: 10px; color: #555; font-style: italic; }
  .totals { margin-top: 4px; }
  .total-row { display: flex; justify-content: space-between; font-size: 12px; padding: 1px 0; }
  .total-row.grand { font-weight: bold; font-size: 14px; border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px; }
  .footer { margin-top: 8px; }
  .footer-text { font-size: 11px; }
  .thank-you { font-size: 13px; font-weight: bold; margin-top: 4px; }
  @media print {
    body { width: 80mm; }
    .receipt { width: 80mm; padding: 2mm 2mm; }
  }
</style>
</head>
<body>
<div class="receipt">
  <div class="center">
    <div class="restaurant-name">${esc(invoice.restaurant.name)}</div>
    ${invoice.restaurant.address ? `<div class="restaurant-info">${esc(invoice.restaurant.address)}</div>` : ""}
    ${invoice.restaurant.phone ? `<div class="restaurant-info">Tel: ${esc(invoice.restaurant.phone)}</div>` : ""}
  </div>
  ${dashedLine}
  <div class="meta">
    <div class="meta-row"><span>Receipt #</span><span>${invNo}</span></div>
    <div class="meta-row"><span>Date</span><span>${date}</span></div>
    <div class="meta-row"><span>Table</span><span>${esc(invoice.tableName)}</span></div>
    <div class="meta-row"><span>Status</span><span>${esc(invoice.status)}</span></div>
  </div>
  ${dashedLine}
  <table>
    ${itemsHTML}
  </table>
  ${dashedLine}
  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${fmt(invoice.subtotalCents)}</span></div>
    <div class="total-row"><span>Tax (${invoice.taxRatePercent}%)</span><span>${fmt(invoice.taxCents)}</span></div>
    ${invoice.serviceChargeCents > 0 ? `<div class="total-row"><span>Service Charge</span><span>${fmt(invoice.serviceChargeCents)}</span></div>` : ""}
    <div class="total-row grand"><span>TOTAL</span><span>${fmt(invoice.totalCents)}</span></div>
  </div>
  ${dashedLine}
  <div class="footer center">
    ${invoice.restaurant.receipt_footer ? `<div class="footer-text">${esc(invoice.restaurant.receipt_footer)}</div>` : ""}
    <div class="thank-you">Thank you for dining with us!</div>
  </div>
</div>
</body>
</html>`;
}

/** Opens a print window with the 80mm receipt and triggers print. */
export function printReceipt(invoice: OrderInvoiceData): void {
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.open();
  w.document.write(buildReceiptHTML(invoice));
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 300);
}
