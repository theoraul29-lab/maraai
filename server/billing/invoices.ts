/**
 * Invoice generation — Kleinunternehmer (§19 UStG, Germany): no VAT is
 * charged or itemised. Every current price point (€8-€83 programs, €21
 * VIP/month) is under €250, so these qualify as a simplified
 * "Kleinbetragsrechnung" (§33 UStDV) — no buyer address required on the
 * document, just seller details, date, description, gross amount, and the
 * tax-exemption note.
 *
 * Rows are immutable once written (GoBD requires gap-free, unmodified
 * invoice records) — `createInvoice` is the only way to add one, there is
 * no update/delete path. PDFs are rendered on demand from this data (see
 * invoice-pdf.ts) rather than stored, so there's a single source of truth.
 */

import { randomUUID } from 'crypto';
import { rawSqlite } from '../db.js';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  sourceType: 'subscription' | 'program_purchase';
  sourceId: string;
  description: string;
  amountCents: number;
  currency: string;
  issuedAt: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  user_id: string;
  source_type: string;
  source_id: string;
  description: string;
  amount_cents: number;
  currency: string;
  issued_at: number;
}

function rowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    userId: row.user_id,
    sourceType: row.source_type as Invoice['sourceType'],
    sourceId: row.source_id,
    description: row.description,
    amountCents: row.amount_cents,
    currency: row.currency,
    issuedAt: row.issued_at,
  };
}

/**
 * Creates an invoice, unless one already exists for this exact
 * (sourceType, sourceId) pair — makes this safe to call from a webhook
 * handler that PayPal/Stripe may retry. Returns the existing row on a
 * duplicate call instead of throwing, since "the invoice already exists"
 * is the expected, successful outcome of a retry.
 */
export function createInvoice(params: {
  userId: string;
  sourceType: Invoice['sourceType'];
  sourceId: string;
  description: string;
  amountCents: number;
  currency?: string;
}): Invoice {
  const existing = rawSqlite
    .prepare(`SELECT * FROM invoices WHERE source_type = ? AND source_id = ? LIMIT 1`)
    .get(params.sourceType, params.sourceId) as InvoiceRow | undefined;
  if (existing) return rowToInvoice(existing);

  const id = randomUUID();
  const currency = params.currency ?? 'EUR';

  // `seq` (AUTOINCREMENT rowid) is assigned by SQLite on insert — read it
  // straight back via last_insert_rowid() in the same statement/connection
  // so there's no window for a concurrent insert to land between "compute
  // the next number" and "write it" (the bug a SELECT MAX(seq)+1 approach
  // would have under concurrent webhook deliveries).
  const insert = rawSqlite.prepare(
    `INSERT INTO invoices (id, invoice_number, user_id, source_type, source_id, description, amount_cents, currency)
     VALUES (?, '', ?, ?, ?, ?, ?, ?)`,
  );
  const result = insert.run(id, params.userId, params.sourceType, params.sourceId, params.description, params.amountCents, currency);
  const seq = result.lastInsertRowid as number;
  const year = new Date().getFullYear();
  const invoiceNumber = `${year}-${String(seq).padStart(4, '0')}`;
  rawSqlite.prepare(`UPDATE invoices SET invoice_number = ? WHERE seq = ?`).run(invoiceNumber, seq);

  const row = rawSqlite.prepare(`SELECT * FROM invoices WHERE seq = ?`).get(seq) as InvoiceRow;
  return rowToInvoice(row);
}

export function listInvoicesForUser(userId: string): Invoice[] {
  const rows = rawSqlite
    .prepare(`SELECT * FROM invoices WHERE user_id = ? ORDER BY issued_at DESC`)
    .all(userId) as InvoiceRow[];
  return rows.map(rowToInvoice);
}

export function getInvoiceById(id: string): Invoice | null {
  const row = rawSqlite.prepare(`SELECT * FROM invoices WHERE id = ?`).get(id) as InvoiceRow | undefined;
  return row ? rowToInvoice(row) : null;
}
