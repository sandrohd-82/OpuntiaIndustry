"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  confirmCodificaArticoloAction,
  matchCatalogoAcquistiAction,
} from "@/app/actions/codifica-articoli";
import {
  CODIFICA_SIMILARITY_THRESHOLD_PCT,
  type CatalogoMatchHit,
} from "@/lib/amministrazione/codifica-articoli";
import {
  catalogoKindPrefix,
  generateSkuProposal,
  type CatalogoAcquistoKind,
} from "@/lib/sku-generator";

type Props = {
  initialText: string;
  initialKind?: CatalogoAcquistoKind;
  fatturaRicevutaId?: string | null;
  fatturaRigaId?: string | null;
  onClose: () => void;
  onConfirmed: (result: {
    codice: string;
    nome: string;
    catalogoKind: CatalogoAcquistoKind;
    catalogoId: string | null;
  }) => void;
};

export function CodificaArticoloRevisioneModal({
  initialText,
  initialKind,
  fatturaRicevutaId = null,
  fatturaRigaId = null,
  onClose,
  onConfirmed,
}: Props) {
  const titleId = useId();
  const [testoSorgente, setTestoSorgente] = useState(initialText.trim());
  const [kind, setKind] = useState<CatalogoAcquistoKind>(
    initialKind ?? generateSkuProposal(initialText).kind
  );
  const [codiceBody, setCodiceBody] = useState(() => {
    const p = generateSkuProposal(initialText, initialKind);
    return p.body;
  });
  const [matches, setMatches] = useState<CatalogoMatchHit[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingMatches, setLoadingMatches] = useState(false);

  const proposal = useMemo(
    () => generateSkuProposal(testoSorgente, kind),
    [testoSorgente, kind]
  );

  const prefix = catalogoKindPrefix(kind);
  const codiceProposto = `${prefix}${codiceBody.replace(/[^A-Za-z0-9\-_\/]/g, "")}`;

  // Ricalcolo corpo SKU al variare del testo o del tipo catalogo
  useEffect(() => {
    setCodiceBody(generateSkuProposal(testoSorgente, kind).body);
  }, [testoSorgente, kind]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const q = testoSorgente.trim();
      if (!q) {
        setMatches([]);
        return;
      }
      setLoadingMatches(true);
      setMatchError(null);
      const res = await matchCatalogoAcquistiAction(
        q,
        CODIFICA_SIMILARITY_THRESHOLD_PCT
      );
      if (cancelled) return;
      setLoadingMatches(false);
      if (!res.success) {
        setMatchError(res.error);
        setMatches([]);
        return;
      }
      setMatches(res.matches);
      if (
        res.matches[0] &&
        res.matches[0].affinitaPercentuale >= CODIFICA_SIMILARITY_THRESHOLD_PCT
      ) {
        setSelectedMatchId(res.matches[0].catalogoId);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [testoSorgente]);

  const selectedMatch = matches.find((m) => m.catalogoId === selectedMatchId);

  function submitAssocia() {
    if (!selectedMatch) {
      setFormError("Seleziona un prodotto simile da associare.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const res = await confirmCodificaArticoloAction({
        testoOriginale: initialText.trim() || testoSorgente.trim(),
        testoNormalizzato: proposal.nomeNormalizzato,
        codiceAssegnato: selectedMatch.codice,
        catalogoKind: selectedMatch.catalogoKind,
        catalogoId: selectedMatch.catalogoId,
        affinitaPercentuale: selectedMatch.affinitaPercentuale,
        azione: "associa_esistente",
        nomeArticolo: selectedMatch.nome,
        fatturaRicevutaId,
        fatturaRigaId,
      });
      if (!res.success) {
        setFormError(res.error);
        return;
      }
      onConfirmed({
        codice: res.codice,
        nome: res.nome,
        catalogoKind: res.catalogoKind,
        catalogoId: res.catalogoId,
      });
    });
  }

  function submitNuovo(e: FormEvent) {
    e.preventDefault();
    if (!codiceProposto || codiceProposto.length < 3) {
      setFormError("Codice proposto non valido.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const res = await confirmCodificaArticoloAction({
        testoOriginale: initialText.trim() || testoSorgente.trim(),
        testoNormalizzato: proposal.nomeNormalizzato,
        codiceAssegnato: codiceProposto,
        catalogoKind: kind,
        catalogoId: null,
        affinitaPercentuale: null,
        azione: "crea_nuovo",
        nomeArticolo: proposal.nomeNormalizzato || testoSorgente.trim(),
        note: "Codificato da fattura ricevuta — uso ripristino magazzino / fogli ordine",
        fatturaRicevutaId,
        fatturaRigaId,
      });
      if (!res.success) {
        setFormError(res.error);
        return;
      }
      onConfirmed({
        codice: res.codice,
        nome: res.nome,
        catalogoKind: res.catalogoKind,
        catalogoId: res.catalogoId,
      });
    });
  }

  const overlay = (
    <div
      data-nested-modal="codifica-articolo"
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Revisione e codifica articolo
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Deduplica catalogo acquisti (soglia {CODIFICA_SIMILARITY_THRESHOLD_PCT}
          %). Il codice servirà anche per ripristino magazzino e fogli ordine.
        </p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Testo sorgente fattura</span>
          <textarea
            value={testoSorgente}
            onChange={(e) => setTestoSorgente(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            required
          />
        </label>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Prodotti simili trovati</h3>
            {loadingMatches ? (
              <span className="text-xs text-[var(--muted)]">Ricerca…</span>
            ) : null}
          </div>
          {matchError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Match non disponibile: {matchError}
            </p>
          ) : null}
          {!matchError && matches.length === 0 && !loadingMatches ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--muted)]">
              Nessun articolo con affinità ≥ {CODIFICA_SIMILARITY_THRESHOLD_PCT}%.
              Puoi creare un nuovo codice.
            </p>
          ) : null}
          {matches.length > 0 ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {matches.map((m) => (
                <li
                  key={`${m.catalogoKind}:${m.catalogoId}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                    selectedMatchId === m.catalogoId
                      ? "border-[var(--primary)] bg-slate-50"
                      : "border-[var(--border)]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold">
                      {m.codice}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {m.nome} · Affinità: {m.affinitaPercentuale}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMatchId(m.catalogoId)}
                    className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-white"
                  >
                    Seleziona
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {selectedMatch ? (
            <button
              type="button"
              disabled={pending}
              onClick={submitAssocia}
              className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Associa articolo selezionato
            </button>
          ) : null}
        </div>

        <form onSubmit={submitNuovo} className="mt-6 space-y-3 border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-medium">Proposta nuovo codice</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tipo catalogo</span>
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as CatalogoAcquistoKind)
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="prodotto">Prodotto fornitore (Pr)</option>
                <option value="materia">Materia prima (Mp)</option>
                <option value="servizio">Servizio (Sz)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Corpo SKU parlante</span>
              <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
                <span className="bg-slate-100 px-2.5 py-2 font-mono text-xs font-semibold text-slate-700">
                  {prefix}
                </span>
                <input
                  value={codiceBody}
                  onChange={(e) =>
                    setCodiceBody(
                      e.target.value.replace(/[^A-Za-z0-9\-_\/]/g, "").toUpperCase()
                    )
                  }
                  className="min-w-0 flex-1 px-2 py-2 font-mono text-sm outline-none"
                  required
                />
              </div>
            </label>
          </div>
          <p className="font-mono text-xs text-[var(--muted)]">
            Codice completo: {codiceProposto || "—"}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Nome anagrafica: {proposal.nomeNormalizzato || "—"}
          </p>
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Salvataggio…" : "Crea nuovo codice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
