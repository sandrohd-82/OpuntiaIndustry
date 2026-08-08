"use client";

import { useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { AggiungiOrdineStoricoModal } from "@/components/amministrazione/AggiungiOrdineStoricoModal";
import { useOrdiniStorico } from "@/hooks/useOrdiniStorico";

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

function origineLabel(origine: "manuale" | "chiusura") {
  return origine === "manuale" ? "Inserito" : "Chiusura";
}

export function OrdiniStoricoBoard() {
  const { ordini, ready, addOrdineStorico } = useOrdiniStorico();
  const [creating, setCreating] = useState(false);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento storico ordini…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Ordini già conclusi. In futuro arriveranno qui in automatico dopo la
          chiusura; puoi anche inserire ordini passati.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Aggiungi ordine Storico
        </button>
      </div>

      {ordini.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun ordine nello storico</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Inserisci un ordine già consegnato in passato, oppure attendi le
            chiusure automatiche.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            <FaPlus size={14} />
            Aggiungi ordine Storico
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Numero</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Data ordine</th>
                <th className="px-4 py-3 font-medium">Data consegna</th>
                <th className="px-4 py-3 text-right font-medium">Importo</th>
                <th className="px-4 py-3 font-medium">Origine</th>
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
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {formatDate(ordine.dataConsegna)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatEuro(ordine.importoEuro)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        ordine.origine === "manuale"
                          ? "bg-slate-100 text-slate-700"
                          : "bg-teal-50 text-teal-800"
                      }`}
                    >
                      {origineLabel(ordine.origine)}
                    </span>
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
        <AggiungiOrdineStoricoModal
          onClose={() => setCreating(false)}
          onCreate={(values) => {
            addOrdineStorico(values);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
