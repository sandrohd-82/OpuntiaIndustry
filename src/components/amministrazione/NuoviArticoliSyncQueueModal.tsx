"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  createCatalogoContributoAction,
  createCatalogoProdottoFornitoreAction,
  createCatalogoServizioAction,
} from "@/app/actions/catalogo-offerta";
import { createMateriaPrimaAction } from "@/app/actions/materie-prime";
import type { NuovoArticoloSyncDraft } from "@/lib/amministrazione/fattura-sync-prep";
import {
  catalogoKindPrefix,
  generateSkuProposal,
  type CatalogoAcquistoKind,
} from "@/lib/sku-generator";

type Props = {
  items: NuovoArticoloSyncDraft[];
  currentIndex: number;
  onSaved: (item: {
    rigaKey: string;
    kind: CatalogoAcquistoKind;
    id: string;
    codice: string;
    nome: string;
  }) => void;
  onQueueComplete: () => void;
};

const KIND_OPTIONS: Array<{ value: CatalogoAcquistoKind; label: string }> = [
  { value: "prodotto", label: "Pr — Prodotto" },
  { value: "servizio", label: "Sz — Servizio" },
  { value: "materia", label: "Mp — Materia prima" },
  { value: "contributo", label: "Ct — Contributo" },
];

export function NuoviArticoliSyncQueueModal({
  items,
  currentIndex,
  onSaved,
  onQueueComplete,
}: Props) {
  const titleId = useId();
  const current = items[currentIndex];
  const [kind, setKind] = useState<CatalogoAcquistoKind>("prodotto");
  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!current) return;
    setKind(current.kind);
    setCodice(current.codice);
    setNome(current.nome);
    setError(null);
  }, [current]);

  if (!current) return null;

  const total = items.length;
  const step = currentIndex + 1;
  const prefix = catalogoKindPrefix(kind);
  const isLast = currentIndex >= total - 1;

  function onKindChange(next: CatalogoAcquistoKind) {
    setKind(next);
    const body = codice.replace(/^(Sz|Pr|Mp|Ct)/i, "");
    const nextPrefix = catalogoKindPrefix(next);
    setCodice(
      `${nextPrefix}${body || generateSkuProposal(nome || current.descrizione, next).body}`
    );
  }

  function saveAndContinue() {
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

    startTransition(async () => {
      setError(null);

      if (kind === "materia") {
        const mp = await createMateriaPrimaAction({
          codice: code,
          nome: name,
          note: `Da sync fattura: ${current.descrizione}`,
        });
        if (!mp.success) {
          setError(mp.error);
          return;
        }
        onSaved({
          rigaKey: current.rigaKey,
          kind,
          id: mp.materia.id,
          codice: mp.materia.codice,
          nome: mp.materia.nome,
        });
        if (isLast) onQueueComplete();
        return;
      }

      const create =
        kind === "servizio"
          ? createCatalogoServizioAction
          : kind === "contributo"
            ? createCatalogoContributoAction
            : createCatalogoProdottoFornitoreAction;

      const res = await create({
        codice: code,
        nome: name,
        note: `Da sync fattura: ${current.descrizione}`,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSaved({
        rigaKey: current.rigaKey,
        kind,
        id: res.item.id,
        codice: res.item.codice,
        nome: res.item.nome,
      });
      if (isLast) onQueueComplete();
    });
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
            Nuovo articolo da catalogare
          </h2>
          <p className="text-xs text-slate-500">
            Scheda <strong>{step}</strong> di <strong>{total}</strong> — controlla
            targa e categoria, poi salva.
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sky-600 transition-all"
              style={{ width: `${(step / total) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Descrizione riga fattura
            </p>
            <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-slate-800">
              {current.descrizione || "—"}
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
            Targa / codice interno
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
            disabled={pending}
            onClick={saveAndContinue}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending
              ? "Salvataggio…"
              : isLast
                ? "Salva e termina"
                : "Salva e continua"}
          </button>
        </div>
      </div>
    </div>
  );
}
