import type { FicInvoiceRow, FicPaymentStatus } from "@/types/database";

export type FicInvoice = {
  id: string;
  ficId: number;
  type: "issued" | "received";
  number: string;
  entityName: string;
  entityVat: string;
  amountGross: number;
  date: string | null;
  dueDate: string | null;
  status: FicPaymentStatus;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function mapFicInvoiceRow(row: FicInvoiceRow): FicInvoice {
  return {
    id: row.id,
    ficId: Number(row.fic_id),
    type: row.type,
    number: row.number ?? "",
    entityName: row.entity_name ?? "",
    entityVat: row.entity_vat ?? "",
    amountGross: Number(row.amount_gross) || 0,
    date: row.date,
    dueDate: row.due_date,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function labelFicPaymentStatus(status: FicPaymentStatus): string {
  switch (status) {
    case "paid":
      return "Pagata";
    case "partially_paid":
      return "Parziale";
    case "not_paid":
    default:
      return "Non pagata";
  }
}

export function formatEuro(value: number): string {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatDateIt(isoDate: string | null): string {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}
