"use client";

import { useState } from "react";
import type { InvoiceAiMatchActionResult } from "@/app/actions/invoice-ai-match";

type Props = {
  open: boolean;
  line: {
    descrizione: string;
    quantita: number | "";
    prezzoUnitario: number | "";
    importo?: number;
    codice: string;
  };
  match: InvoiceAiMatchActionResult;
  onClose: () => void;
  onConfirm: (codice: string) => void;
  onAssociaManualmente: () => void;
};

export function InvoiceAIMatchModal({
  open,
  line,
  match,
  onClose,
  onConfirm,
  onAssociaManualmente,
}: Props) {
  const [codice, setCodice] = useState(
    match.suggested_internal_code || match.matched_codice || line.codice || ""
  );
  const [editingCode, setEditingCode] = useState(false);

  if (!open) return null;

  const score = match.confidence_score;
  const importo =
    line.importo ??
    (typeof line.quantita === "number" && typeof line.prezzoUnitario === "number"
      ? line.quantita * line.prezzoUnitario
      : null);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-white shadow-xl"
      >
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            Spiegazione match AI
          </h2>
          <p className="text-xs text-slate-500">
            Confidenza {score}% · stato {match.verification_status}
            {match.ai_match_data?.source
              ? ` · fonte ${match.ai_match_data.source}`
              : ""}
          </p>
        </div>

        <div className="space-y-4 px-4 py-4 text-sm">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Riepilogo riga fattura
            </h3>
            <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-slate-800">
              {line.descrizione || "—"}
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
              <div>
                <dt className="text-slate-400">Qtà</dt>
                <dd className="font-medium">{line.quantita === "" ? "—" : line.quantita}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Prezzo</dt>
                <dd className="font-medium">
                  {line.prezzoUnitario === "" ? "—" : `€ ${line.prezzoUnitario}`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Importo</dt>
                <dd className="font-medium">
                  {importo == null ? "—" : `€ ${importo.toFixed(2)}`}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Spiegazione logica AI
            </h3>
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950">
              {match.ai_reasoning}
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Confronto
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                <p className="text-[10px] font-medium uppercase text-slate-400">
                  Proposto
                </p>
                <p className="font-mono text-sm font-semibold text-slate-900">
                  {codice || "—"}
                </p>
                {editingCode ? (
                  <input
                    value={codice}
                    onChange={(e) => setCodice(e.target.value)}
                    className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1 font-mono text-xs"
                    autoFocus
                  />
                ) : null}
              </div>
              <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                <p className="text-[10px] font-medium uppercase text-slate-400">
                  Catalogo esistente
                </p>
                {match.matched_product_id ? (
                  <>
                    <p className="font-mono text-sm font-semibold">
                      {match.matched_codice}
                    </p>
                    <p className="text-xs text-slate-600">{match.matched_nome}</p>
                    <p className="text-[10px] text-slate-400">
                      {match.matched_kind}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    Nessun prodotto associato — nuova targa
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={() => setEditingCode((v) => !v)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Modifica targa/codice
          </button>
          <button
            type="button"
            onClick={() => {
              onAssociaManualmente();
              onClose();
            }}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            Associa manualmente
          </button>
          <button
            type="button"
            disabled={!codice.trim()}
            onClick={() => onConfirm(codice.trim())}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Conferma e inserisci
          </button>
        </div>
      </div>
    </div>
  );
}

/** Badge confidenza cliccabile. */
export function InvoiceAiMatchBadge(props: {
  score: number;
  status: string;
  suggestedCode: string | null;
  isNewTarga: boolean;
  onClick: () => void;
}) {
  const { score, suggestedCode, isNewTarga, onClick } = props;

  let cls = "border-amber-300 bg-amber-50 text-amber-950";
  let label = `Parziale ${score}%`;

  if (score >= 100) {
    cls = "border-emerald-300 bg-emerald-50 text-emerald-900";
    label = "100%";
  } else if (isNewTarga || score < 55) {
    cls = "border-sky-300 bg-sky-50 text-sky-950";
    label = suggestedCode ? `Nuova ${suggestedCode}` : "Nuova targa";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title="Apri spiegazione AI"
    >
      {label}
    </button>
  );
}
