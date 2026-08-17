"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaFloppyDisk, FaXmark } from "react-icons/fa6";
import {
  getElaborazioneContabileAction,
  saveElaborazioneContabileAction,
} from "@/app/actions/elaborazione-contabile";
import type { ElaborazioneContabileView } from "@/lib/amministrazione/elaborazione-contabile";
import { assignNumeriVignetta } from "@/lib/amministrazione/elaborazione-contabile";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import {
  buildTrimestreOptions,
  labelTrimestreKey,
  parseTrimestreKey,
  type TrimestreKey,
  type TrimestreNumero,
} from "@/lib/amministrazione/trimestre-commerciale";
import type { ElaborazioneContabileKind } from "@/types/database";

type Props = {
  kind: ElaborazioneContabileKind;
  /** Date emissione documenti per costruire le opzioni trimestre. */
  isoDates: string[];
  onClose: () => void;
};

export function ElaboraContabilitaModal({ kind, isoDates, onClose }: Props) {
  const titleId = useId();
  const options = useMemo(() => {
    const built = buildTrimestreOptions(isoDates);
    if (built.length > 0) return built;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const trim = (m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4) as TrimestreNumero;
    const key: TrimestreKey = `${y}-${trim}`;
    return [{ key, label: labelTrimestreKey(key) }];
  }, [isoDates]);

  const [trimestreKey, setTrimestreKey] = useState<TrimestreKey>(
    () => options[0]?.key ?? `${new Date().getFullYear()}-1`
  );
  const [view, setView] = useState<ElaborazioneContabileView | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (key: TrimestreKey) => {
    const parsed = parseTrimestreKey(key);
    if (!parsed) {
      setError("Trimestre non valido.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getElaborazioneContabileAction({
        kind,
        anno: parsed.anno,
        trimestre: parsed.trim,
      });
      if (!res.success) {
        setError(res.error);
        setView(null);
        return;
      }
      setView(res.elaborazione);
      const next: Record<string, boolean> = {};
      for (const v of res.elaborazione.voci) {
        next[v.fatturaId] = v.numeraConVignetta;
      }
      setChecks(next);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load(trimestreKey);
  }, [load, trimestreKey]);

  const previewVignette = useMemo(() => {
    if (!view) return new Map<string, number | null>();
    const ordered = view.voci.map((v) => ({
      fatturaId: v.fatturaId,
      numeraConVignetta: Boolean(checks[v.fatturaId]),
    }));
    const numbered = assignNumeriVignetta(ordered);
    return new Map(numbered.map((n) => [n.fatturaId, n.numeroVignetta]));
  }, [view, checks]);

  async function handleSave() {
    if (!view) return;
    const parsed = parseTrimestreKey(trimestreKey);
    if (!parsed) {
      setError("Trimestre non valido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveElaborazioneContabileAction({
        kind,
        anno: parsed.anno,
        trimestre: parsed.trim,
        note: view.note,
        voci: view.voci.map((v) => ({
          fatturaId: v.fatturaId,
          numeraConVignetta: Boolean(checks[v.fatturaId]),
        })),
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setView(res.elaborazione);
      const next: Record<string, boolean> = {};
      for (const v of res.elaborazione.voci) {
        next[v.fatturaId] = v.numeraConVignetta;
      }
      setChecks(next);
    } finally {
      setSaving(false);
    }
  }

  const kindLabel = kind === "emessa" ? "emesse" : "ricevute";

  const dialog = (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8 sm:py-12"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[85vw] max-w-[85vw] rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Elabora contabilità — fatture {kindLabel}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Seleziona il trimestre, spunta «Numera con vignetta» e salva.
              I numeri 1…X seguono la data dal più vicino all’inizio trimestre.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={16} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Trimestre
            </span>
            <select
              value={trimestreKey}
              onChange={(e) => setTrimestreKey(e.target.value as TrimestreKey)}
              className="min-w-[180px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {view ? (
            <p className="pb-2 text-xs text-[var(--muted)]">
              Stato {view.documentoStato} · v{view.versione}
              {view.id ? " · salvata" : " · bozza nuova"}
            </p>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={saving || loading || !view}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              <FaFloppyDisk size={13} />
              {saving ? "Salvataggio…" : "Salva elaborazione"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          {loading ? (
            <p className="p-6 text-sm text-[var(--muted)]">Caricamento…</p>
          ) : !view || view.voci.length === 0 ? (
            <p className="p-6 text-sm text-[var(--muted)]">
              Nessuna fattura nel trimestre selezionato.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">N. interno</th>
                  <th className="px-3 py-2">Anagrafica</th>
                  <th className="px-3 py-2 text-right">Totale</th>
                  <th className="px-3 py-2">Numera con vignetta</th>
                  <th className="px-3 py-2 text-center">Vignetta</th>
                </tr>
              </thead>
              <tbody>
                {view.voci.map((v) => {
                  const checked = Boolean(checks[v.fatturaId]);
                  const num = previewVignette.get(v.fatturaId);
                  return (
                    <tr
                      key={v.fatturaId}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-3 py-2 tabular-nums">
                        {formatDateIt(v.dataEmissione)}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {v.numeroInterno}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-[var(--muted)]">
                          {v.anagraficaCodiceTarga}
                        </span>{" "}
                        {v.anagraficaRagioneSociale}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEuro(v.totale)}
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setChecks((prev) => ({
                                ...prev,
                                [v.fatturaId]: e.target.checked,
                              }))
                            }
                            className="rounded border-[var(--border)]"
                          />
                          Numera
                        </label>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {checked && num != null ? (
                          <span
                            className="inline-block min-w-[1.75rem] font-serif text-lg font-light italic tracking-wide text-slate-600"
                            style={{
                              fontFamily:
                                '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
                            }}
                            title="Numerazione vignetta"
                          >
                            {num}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
