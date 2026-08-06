"use client";

import { useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { NuovoOrdineModal } from "@/components/amministrazione/NuovoOrdineModal";
import { useOrdiniRicevuti } from "@/hooks/useOrdiniRicevuti";

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(isoDate: string) {
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}

export function OrdiniRicevutiBoard() {
  const { ordini, ready, addOrdine } = useOrdiniRicevuti();
  const [creating, setCreating] = useState(false);

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento ordini…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco ordini ricevuti. Puoi inserirne uno nuovo in qualsiasi momento.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuovo ordine
        </button>
      </div>

      {ordini.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun ordine ricevuto</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Inserisci il primo ordine per iniziare.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo ordine
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Numero</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 text-right font-medium">Importo</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((ordine) => (
                <tr
                  key={ordine.id}
                  className="border-t border-[var(--border)]"
                >
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {ordine.numero}
                  </td>
                  <td className="px-4 py-3">{ordine.cliente}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {formatDate(ordine.dataOrdine)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatEuro(ordine.importoEuro)}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-[var(--muted)]">
                    {ordine.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NuovoOrdineModal
          onClose={() => setCreating(false)}
          onCreate={(values) => {
            addOrdine(values);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
