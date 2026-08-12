"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FaPlus } from "react-icons/fa6";
import { listFattureAction } from "@/app/actions/fatture";
import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
import { FatturaRegistrazioneModal } from "@/components/amministrazione/FatturaRegistrazioneModal";
import {
  formatDateIt,
  formatEuro,
  labelStatoPagamento,
  type Fattura,
  type FatturaKind,
} from "@/lib/amministrazione/fatture";

type Props = {
  kind: FatturaKind;
};

export function FattureInterneBoard({ kind }: Props) {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await listFattureAction(kind);
      if (!result.success) {
        setError(result.error);
        setFatture([]);
        setReady(true);
        return;
      }
      setError(null);
      setFatture(result.fatture);
      setReady(true);
    });
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const entityLabel = kind === "emessa" ? "Cliente" : "Fornitore";
  const titleHint =
    kind === "emessa"
      ? "Storico fatture emesse registrate. La sincronizzazione parti da Clienti."
      : "Storico fatture ricevute registrate. La sincronizzazione parti da Fornitori.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">{titleHint}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={12} />
          Registra fattura
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!ready || pending ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : fatture.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm font-medium">Nessuna fattura registrata</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Usa «Registra fattura» oppure sincronizza da{" "}
            {kind === "emessa" ? "Clienti" : "Fornitori"}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">N. interno</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">{entityLabel}</th>
                <th className="px-4 py-3 font-medium">Doc. esterno</th>
                <th className="px-4 py-3 font-medium">Imponibile</th>
                <th className="px-4 py-3 font-medium">Totale</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 text-right font-medium">FiC</th>
              </tr>
            </thead>
            <tbody>
              {fatture.map((f) => (
                <tr key={f.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    {f.numeroInterno}
                  </td>
                  <td className="px-4 py-3">{formatDateIt(f.dataEmissione)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {f.anagraficaCodiceTarga}
                    </span>{" "}
                    <span className="text-[var(--muted)]">
                      {f.anagraficaRagioneSociale}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {f.numeroDocumentoEsterno || "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatEuro(f.imponibile)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">
                    {formatEuro(f.totale)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                        f.statoPagamento === "pagato"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {labelStatoPagamento(f.statoPagamento)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {f.ficId ? (
                      <ApriFatturaFicButton kind={kind} ficId={f.ficId} />
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <FatturaRegistrazioneModal
          kind={kind}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
