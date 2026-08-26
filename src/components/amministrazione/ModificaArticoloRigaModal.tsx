"use client";

import { useEffect, useId, useState } from "react";
import type { NuovoArticoloSyncDraft } from "@/lib/amministrazione/fattura-sync-prep";
import {
  catalogoKindPrefix,
  generateSkuProposal,
  type CatalogoAcquistoKind,
} from "@/lib/sku-generator";

type Props = {
  open: boolean;
  draft: NuovoArticoloSyncDraft;
  descrizioneRiga: string;
  onClose: () => void;
  onApply: (next: NuovoArticoloSyncDraft) => void;
};

const KIND_OPTIONS: Array<{ value: CatalogoAcquistoKind; label: string }> = [
  { value: "prodotto", label: "Pr — Prodotto" },
  { value: "servizio", label: "Sz — Servizio" },
  { value: "materia", label: "Mp — Materia prima" },
  { value: "contributo", label: "Ct — Contributo" },
];

export function ModificaArticoloRigaModal({
  open,
  draft,
  descrizioneRiga,
  onClose,
  onApply,
}: Props) {
  const titleId = useId();
  const [kind, setKind] = useState<CatalogoAcquistoKind>(draft.kind);
  const [codice, setCodice] = useState(draft.codice);
  const [nome, setNome] = useState(draft.nome);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(draft.kind);
    setCodice(draft.codice);
    setNome(draft.nome);
    setError(null);
  }, [open, draft]);

  if (!open) return null;

  const prefix = catalogoKindPrefix(kind);

  function onKindChange(next: CatalogoAcquistoKind) {
    setKind(next);
    const body = codice.replace(/^(Sz|Pr|Mp|Ct)/i, "");
    const nextPrefix = catalogoKindPrefix(next);
    setCodice(
      `${nextPrefix}${body || generateSkuProposal(nome || descrizioneRiga, next).body}`
    );
  }

  function apply() {
    const code = codice.trim();
    const name = nome.trim();
    if (!code || !name) {
      setError("Targa e nome sono obbligatori.");
      return;
    }
    if (!code.toLowerCase().startsWith(prefix.toLowerCase())) {
      setError(`Il codice deve iniziare con ${prefix}.`);
      return;
    }
    onApply({
      rigaKey: draft.rigaKey,
      descrizione: descrizioneRiga,
      kind,
      codice: code,
      nome: name,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white shadow-xl"
      >
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            Modifica targa / categoria
          </h2>
          <p className="text-xs text-slate-500">
            Le modifiche restano in memoria finché non salvi la fattura.
          </p>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Descrizione riga
            </p>
            <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-slate-800">
              {descrizioneRiga || "—"}
            </p>
          </div>

          <label className="block text-xs text-slate-500">
            Categoria
            <select
              value={kind}
              onChange={(e) =>
                onKindChange(e.target.value as CatalogoAcquistoKind)
              }
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-900"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-500">
            Targa / codice
            <input
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block text-xs text-slate-500">
            Nome anagrafica
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Applica
          </button>
        </div>
      </div>
    </div>
  );
}
