"use client";

import { useState } from "react";
import { rispondiAccettazioneSeniorAction } from "@/app/actions/accettazione-senior";
import {
  labelAccettazioneSenior,
  type AccettazioneSeniorStato,
} from "@/lib/amministrazione/accettazione-senior";

export function AccettazioneSeniorBar({
  entity,
  id,
  stato,
  nota,
  puoRispondere,
  onDone,
}: {
  entity: "preventivo" | "ordine";
  id: string;
  stato: AccettazioneSeniorStato;
  nota?: string | null;
  puoRispondere: boolean;
  onDone: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (stato !== "in_attesa" && stato !== "rifiutata") return null;
  const etichetta = labelAccettazioneSenior(stato);

  async function rispondi(esito: "accettata" | "rifiutata") {
    setBusy(true);
    setError(null);
    const res = await rispondiAccettazioneSeniorAction({
      entity,
      id,
      esito,
      nota: testo,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setAperto(false);
    setTesto("");
    onDone();
  }

  return (
    <div className="mt-1 space-y-1 text-left">
      <p className="text-[11px] font-medium text-amber-900">{etichetta}</p>
      {stato === "rifiutata" && nota?.trim() ? (
        <p className="text-[11px] text-red-800">{nota.trim()}</p>
      ) : null}
      {stato === "in_attesa" && puoRispondere ? (
        aperto ? (
          <div className="space-y-1">
            <textarea
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              rows={2}
              placeholder="Nota, obbligatoria se rifiuti"
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void rispondi("accettata")}
                className="rounded bg-emerald-700 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
              >
                Accetta
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void rispondi("rifiutata")}
                className="rounded border border-red-300 px-2 py-1 text-[11px] font-medium text-red-800 disabled:opacity-50"
              >
                Rifiuta
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAperto(true)}
            className="rounded bg-amber-700 px-2 py-1 text-[11px] font-medium text-white"
          >
            Rispondi
          </button>
        )
      ) : null}
      {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
