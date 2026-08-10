"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  listFicInvoicesAction,
  syncFattureInCloudAction,
} from "@/app/actions/fic-invoices";
import {
  formatDateIt,
  formatEuro,
  labelFicPaymentStatus,
  type FicInvoice,
} from "@/lib/amministrazione/fic-invoices";
import type { FicInvoiceKind } from "@/types/database";

type Props = {
  type: FicInvoiceKind;
};

function statusBadgeClass(status: FicInvoice["status"]): string {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "partially_paid":
      return "bg-amber-50 text-amber-900 border-amber-200";
    default:
      return "bg-rose-50 text-rose-800 border-rose-200";
  }
}

export function FattureBoard({ type }: Props) {
  const [invoices, setInvoices] = useState<FicInvoice[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await listFicInvoicesAction(type);
      if (!result.success) {
        setError(result.error);
        setInvoices([]);
        setReady(true);
        return;
      }
      setError(null);
      setInvoices(result.invoices);
      setLastSyncAt(result.lastSyncAt);
      setReady(true);
    });
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSync() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await syncFattureInCloudAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage(
        `Sincronizzazione ok: ${result.fetched} documenti scaricati, ${result.upserted} salvati.`
      );
      load();
    });
  }

  const entityLabel = type === "issued" ? "Cliente" : "Fornitore";
  const titleHint =
    type === "issued"
      ? "Fatture emesse (inviate ai clienti) da Fatture in Cloud."
      : "Fatture ricevute (dai fornitori) da Fatture in Cloud.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">{titleHint}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Ultimo sync riuscito:{" "}
            {lastSyncAt
              ? new Date(lastSyncAt).toLocaleString("it-IT")
              : "mai (premi Sincronizza)"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={pending}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Sincronizzo…" : "Sincronizza ora"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Numero</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">{entityLabel}</th>
              <th className="px-3 py-2 font-medium">P.IVA</th>
              <th className="px-3 py-2 font-medium text-right">Importo</th>
              <th className="px-3 py-2 font-medium">Scadenza</th>
              <th className="px-3 py-2 font-medium">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {!ready ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-[var(--muted)]"
                >
                  Caricamento…
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-[var(--muted)]"
                >
                  Nessuna fattura in archivio. Premi «Sincronizza ora» (serve
                  prima il collegamento a Fatture in Cloud).
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-[var(--border)] hover:bg-black/[0.02]"
                >
                  <td className="px-3 py-2 font-medium tabular-nums">
                    {inv.number || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDateIt(inv.date)}
                  </td>
                  <td className="px-3 py-2">{inv.entityName || "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                    {inv.entityVat || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(inv.amountGross)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDateIt(inv.dueDate)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(inv.status)}`}
                    >
                      {labelFicPaymentStatus(inv.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
