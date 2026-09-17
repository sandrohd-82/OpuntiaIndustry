"use client";

import type { DueAvvisoRow } from "@/app/actions/pn-avvisi";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function PnAvvisoSvegliaModal({
  avviso,
  onAck,
}: {
  avviso: DueAvvisoRow;
  onAck: () => void;
}) {
  const tipo = avviso.origineTipo === "attivita" ? "Attività" : "Promemoria";
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 print:hidden"
      role="alertdialog"
      aria-label="Sveglia"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-amber-300 bg-amber-50 px-6 py-5 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
          Sveglia · {tipo}
        </p>
        <p className="mt-3 text-xl font-semibold text-slate-900">
          {avviso.titolo}
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Avvisami {avviso.offsetValore} {avviso.offsetUnita} prima dell&apos;evento
        </p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          Evento: {formatWhen(avviso.dueAt)}
        </p>
        <button
          type="button"
          onClick={onAck}
          className="mt-5 rounded-lg bg-amber-700 px-5 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Ho capito
        </button>
      </div>
    </div>
  );
}
