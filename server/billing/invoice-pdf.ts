/**
 * Renders an Invoice (see invoices.ts) as a PDF Buffer, formatted as a
 * German "Kleinbetragsrechnung" (§33 UStDV, gross amount ≤ €250) for a
 * Kleinunternehmer (§19 UStG) — no VAT line, just the mandatory
 * tax-exemption note. Generated on demand, never stored, so there's one
 * source of truth (the DB row).
 */

import PDFDocument from 'pdfkit';
import type { Invoice } from './invoices.js';

function sellerInfo() {
  return {
    name: process.env.INVOICE_SELLER_NAME || '(seller name not configured — set INVOICE_SELLER_NAME)',
    address: process.env.INVOICE_SELLER_ADDRESS || '(address not configured — set INVOICE_SELLER_ADDRESS)',
    email: process.env.INVOICE_SELLER_EMAIL || '',
  };
}

export function renderInvoicePdf(invoice: Invoice, buyerEmail: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const seller = sellerInfo();
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Rechnung / Invoice', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text(`Rechnungsnummer / Invoice No.: ${invoice.invoiceNumber}`, { align: 'right' });
    doc.text(`Datum / Date: ${new Date(invoice.issuedAt * 1000).toLocaleDateString('de-DE')}`, { align: 'right' });
    doc.moveDown(2);

    doc.fillColor('#000').fontSize(11);
    doc.text(seller.name);
    doc.text(seller.address);
    if (seller.email) doc.text(seller.email);
    doc.moveDown();

    doc.fontSize(10).fillColor('#555').text('Rechnungsempfänger / Bill to:');
    doc.fillColor('#000').fontSize(11).text(buyerEmail);
    doc.moveDown(2);

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#555');
    doc.text('Beschreibung / Description', 50, tableTop);
    doc.text('Betrag / Amount', 400, tableTop, { width: 145, align: 'right' });
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor('#ccc').stroke();

    const rowY = tableTop + 25;
    doc.fontSize(11).fillColor('#000');
    doc.text(invoice.description, 50, rowY, { width: 340 });
    const amount = `${(invoice.amountCents / 100).toFixed(2)} ${invoice.currency}`;
    doc.text(amount, 400, rowY, { width: 145, align: 'right' });

    doc.moveTo(50, rowY + 30).lineTo(545, rowY + 30).strokeColor('#ccc').stroke();
    doc.fontSize(12).text('Gesamtbetrag / Total', 50, rowY + 40);
    doc.text(amount, 400, rowY + 40, { width: 145, align: 'right' });

    doc.moveDown(4);
    doc.fontSize(9).fillColor('#555').text(
      'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet. / ' +
      'No VAT is charged pursuant to § 19 of the German VAT Act (small business exemption).',
    );

    doc.end();
  });
}
