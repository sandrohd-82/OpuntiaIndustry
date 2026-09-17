"use client";

import type { AnagraficaDuplicatoHit } from "@/lib/amministrazione/anagrafica-duplicati";

export function AnagraficaDuplicatiBlockModal({
  matches,
  onClose,
}: {
  matches: AnagraficaDuplicatoHit[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center bg-slate-950/55 p-4 py-16"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-amber-300 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-amber-950">
          Possibile duplicato
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          La nuova scheda coincide o è simile almeno all’85% a una già presente.
          La creazione è bloccata: apri la scheda esistente dall’elenco.
        </p>
        <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {matches.map((m) => (
            <li
              key={`${m.kind}-${m.id}`}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
            >
              <p className="font-semibold text-amber-950">
                {m.kind === "cliente" ? "Cliente" : "Possibile cliente"}
                {m.codiceTarga ? ` · ${m.codiceTarga}` : ""}
              </p>
              <p>{m.ragioneSociale}</p>
              <p className="text-xs text-slate-600">
                {m.partitaIva || m.codiceFiscale || "—"} ·{" "}
                {m.exactFiscal
                  ? "duplicato fiscale"
                  : `${Math.round(m.score * 100)}%`}
                {m.motivi.length ? ` · ${m.motivi.join(", ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
