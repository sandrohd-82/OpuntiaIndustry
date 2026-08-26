"use client";

import { useEffect, useId, useState } from "react";
import {
  scanModificaArticoloRigaAction,
  type ScanModificaCandidato,
} from "@/app/actions/invoice-ai-match";
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
  quantita?: number | "";
  prezzoUnitario?: number | "";
  fatturaId?: string | null;
  fornitoreId?: string | null;
  onClose: () => void;
  onApply: (next: NuovoArticoloSyncDraft) => void;
};

const KIND_OPTIONS: Array<{
  value: "all" | CatalogoAcquistoKind;
  label: string;
}> = [
  { value: "all", label: "Tutte le categorie" },
  { value: "prodotto", label: "Pr — Prodotto" },
  { value: "servizio", label: "Sz — Servizio" },
  { value: "materia", label: "Mp — Materia prima" },
  { value: "contributo", label: "Ct — Contributo" },
];

const DEFAULT_MIN_SCORE = 50;

export function ModificaArticoloRigaModal({
  open,
  draft,
  descrizioneRiga,
  quantita,
  prezzoUnitario,
  fatturaId,
  fornitoreId,
  onClose,
  onApply,
}: Props) {
  const titleId = useId();
  /** Filtro ricerca (default: tutte). */
  const [filterKind, setFilterKind] = useState<"all" | CatalogoAcquistoKind>(
    "all"
  );
  /** Categoria articolo / targa (per Applica). */
  const [kind, setKind] = useState<CatalogoAcquistoKind>(draft.kind);
  const [codice, setCodice] = useState(draft.codice);
  const [nome, setNome] = useState(draft.nome);
  const [testoRicerca, setTestoRicerca] = useState(descrizioneRiga);
  const [minScore, setMinScore] = useState(DEFAULT_MIN_SCORE);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<ScanModificaCandidato[] | null>(
    null
  );
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastScanScore, setLastScanScore] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setFilterKind("all");
    setKind(draft.kind);
    setCodice(draft.codice);
    setNome(draft.nome);
    setTestoRicerca(descrizioneRiga);
    setMinScore(DEFAULT_MIN_SCORE);
    setError(null);
    setScanning(false);
    setCandidates(null);
    setScanNote(null);
    setSelectedId(null);
    setLastScanScore(null);
  }, [open, draft, descrizioneRiga]);

  if (!open) return null;

  const prefix = catalogoKindPrefix(kind);

  function onFilterKindChange(next: "all" | CatalogoAcquistoKind) {
    setFilterKind(next);
    setSelectedId(null);
    setCandidates(null);
    setScanNote(null);
    setLastScanScore(null);
    if (next !== "all") {
      setKind(next);
      const body = codice.replace(/^(Sz|Pr|Mp|Ct)/i, "");
      const nextPrefix = catalogoKindPrefix(next);
      setCodice(
        `${nextPrefix}${body || generateSkuProposal(nome || descrizioneRiga, next).body}`
      );
    }
  }

  function pickCandidate(c: ScanModificaCandidato) {
    setSelectedId(c.id);
    setKind(c.kind);
    if (filterKind !== "all") setFilterKind(c.kind);
    setCodice(c.codice);
    setNome(c.nome);
    setError(null);
  }

  function clampScore(raw: number): number {
    if (!Number.isFinite(raw)) return DEFAULT_MIN_SCORE;
    return Math.min(95, Math.max(20, Math.round(raw)));
  }

  async function runScan() {
    const soglia = clampScore(minScore);
    setMinScore(soglia);
    const query = testoRicerca.trim();
    if (!query) {
      setError("Inserisci un testo per la ricerca targa.");
      return;
    }
    setScanning(true);
    setError(null);
    setScanNote(null);
    setSelectedId(null);
    const res = await scanModificaArticoloRigaAction({
      descrizione: descrizioneRiga,
      testoRicerca: query,
      quantita: typeof quantita === "number" ? quantita : undefined,
      prezzoUnitario:
        typeof prezzoUnitario === "number" ? prezzoUnitario : undefined,
      codiceAttuale: codice,
      fatturaId: fatturaId ?? null,
      fornitoreId: fornitoreId ?? null,
      kind: filterKind,
      minScore: soglia,
    });
    setScanning(false);
    if (!res.success) {
      setError(res.error);
      setCandidates([]);
      return;
    }
    setCandidates(res.candidates);
    setLastScanScore(res.minScore);
    const kindLabel =
      KIND_OPTIONS.find((o) => o.value === res.kind)?.label ?? res.kind;
    const parts: string[] = [];
    if (res.usedGemini) parts.push(`Gemini (${res.model})`);
    else parts.push(res.model);
    parts.push(kindLabel);
    parts.push(`soglia ≥ ${res.minScore}%`);
    if (res.candidates.length === 0) {
      parts.push("nessun codice sopra soglia");
      if (res.suggestedCode) {
        parts.push(`proposta nuova targa: ${res.suggestedCode}`);
        setCodice(res.suggestedCode);
      }
    } else {
      parts.push(`${res.candidates.length} candidati`);
    }
    if (res.geminiReasoning) {
      setScanNote(`${parts.join(" · ")}\n${res.geminiReasoning}`);
    } else {
      setScanNote(parts.join(" · "));
    }
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl"
      >
        <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            Modifica targa / categoria
          </h2>
          <p className="text-xs text-slate-500">
            Puoi adattare il testo di ricerca senza cambiare la descrizione
            della riga in fattura.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Descrizione riga (fattura — non modificabile qui)
            </p>
            <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-slate-800">
              {descrizioneRiga || "—"}
            </p>
          </div>

          <label className="block text-xs text-slate-500">
            Testo per ricerca targa
            <textarea
              value={testoRicerca}
              onChange={(e) => setTestoRicerca(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-900"
              placeholder="Es. gestione spedizioni"
            />
            <span className="mt-0.5 block text-[10px] text-slate-400">
              Solo per lo scan: non aggiorna la descrizione della riga.
            </span>
          </label>

          <label className="block text-xs text-slate-500">
            Categoria ricerca (default: tutte)
            <select
              value={filterKind}
              onChange={(e) =>
                onFilterKindChange(
                  e.target.value as "all" | CatalogoAcquistoKind
                )
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

          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs text-slate-500">
              Soglia corrispondenza %
              <input
                type="number"
                min={20}
                max={95}
                step={5}
                value={minScore}
                onChange={(e) =>
                  setMinScore(clampScore(Number(e.target.value)))
                }
                className="mt-1 w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <button
              type="button"
              disabled={scanning || !testoRicerca.trim()}
              onClick={() => void runScan()}
              className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {scanning ? "Scansione…" : "Scansiona catalogo"}
            </button>
            <span className="pb-2 text-[11px] text-slate-500">
              {filterKind === "all"
                ? "Tutte le categorie"
                : `Solo ${prefix}*`}{" "}
              · score ≥ soglia
            </span>
          </div>

          {scanNote ? (
            <p className="whitespace-pre-wrap rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
              {scanNote}
            </p>
          ) : null}

          {candidates != null ? (
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Candidati
                {filterKind === "all" ? " (tutte)" : ` ${prefix}*`}
                {lastScanScore != null ? ` (≥ ${lastScanScore}%)` : ""}
              </p>
              {candidates.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-xs text-slate-500">
                  Nessun match sopra soglia in questa categoria. Abbassa la %,
                  modifica il testo di ricerca o inserisci targa/nome a mano.
                </p>
              ) : (
                <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                  {candidates.map((c) => {
                    const active = selectedId === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => pickCandidate(c)}
                          className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                            active
                              ? "border-sky-500 bg-sky-50 ring-1 ring-sky-300"
                              : "border-[var(--border)] hover:bg-slate-50"
                          }`}
                        >
                          <span className="mt-0.5 shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                            {c.score}%
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-xs font-semibold text-slate-900">
                              {c.codice}
                            </span>
                            <span className="block truncate text-xs text-slate-600">
                              {c.nome}
                            </span>
                            <span className="text-[10px] uppercase text-slate-400">
                              {c.kind}
                              {c.source === "gemini" ? " · AI" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          <label className="block text-xs text-slate-500">
            Categoria articolo (targa)
            <select
              value={kind}
              onChange={(e) => {
                const next = e.target.value as CatalogoAcquistoKind;
                setKind(next);
                if (filterKind !== "all") setFilterKind(next);
                setSelectedId(null);
                const body = codice.replace(/^(Sz|Pr|Mp|Ct)/i, "");
                setCodice(
                  `${catalogoKindPrefix(next)}${body || generateSkuProposal(nome || descrizioneRiga, next).body}`
                );
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-900"
            >
              {KIND_OPTIONS.filter((o) => o.value !== "all").map((o) => (
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
              onChange={(e) => {
                setCodice(e.target.value);
                setSelectedId(null);
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block text-xs text-slate-500">
            Nome anagrafica
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setSelectedId(null);
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
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
