"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FaHighlighter, FaXmark } from "react-icons/fa6";
import { createNotaBozzaPnAction } from "@/app/actions/promemorie-e-note";
import {
  makePlaceholderToken,
  nextPlaceholderKey,
} from "@/lib/promemorie-e-note/bozze";
import type {
  PnNotaBozza,
  PnNotaBozzaPlaceholder,
} from "@/lib/promemorie-e-note/types";

type Props = {
  open: boolean;
  titoloNota: string;
  bodyTemplate: string;
  onClose: () => void;
  onSaved: (item: PnNotaBozza) => void;
  onError: (msg: string) => void;
};

/**
 * Modale z alta: richiede titolo bozza + titolo nota, evidenzia variabili.
 */
export function NotaSalvaBozzaModal({
  open,
  titoloNota: titoloNotaInitial,
  bodyTemplate: bodyInitial,
  onClose,
  onSaved,
  onError,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [titoloBozza, setTitoloBozza] = useState("");
  const [titoloNota, setTitoloNota] = useState(titoloNotaInitial);
  const [body, setBody] = useState(bodyInitial);
  const [placeholders, setPlaceholders] = useState<PnNotaBozzaPlaceholder[]>(
    []
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitoloBozza("");
    setTitoloNota(titoloNotaInitial);
    setBody(bodyInitial);
    setPlaceholders([]);
  }, [open, titoloNotaInitial, bodyInitial]);

  function evidenziaSelezione() {
    const el = taRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end <= start) {
      onError("Seleziona il testo da rendere variabile (stile evidenziatore).");
      return;
    }
    const selected = body.slice(start, end);
    if (!selected.trim()) {
      onError("La selezione è vuota.");
      return;
    }
    const key = nextPlaceholderKey(placeholders);
    const label = selected.trim().slice(0, 120);
    const token = makePlaceholderToken(key, label);
    const nextBody = body.slice(0, start) + token + body.slice(end);
    setBody(nextBody);
    setPlaceholders((prev) => [
      ...prev,
      { key, label: label.slice(0, 80) || key, sample: label },
    ]);
    requestAnimationFrame(() => {
      const pos = start + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function removePlaceholder(key: string) {
    const ph = placeholders.find((p) => p.key === key);
    if (!ph) return;
    const token = makePlaceholderToken(ph.key, ph.sample || ph.label);
    setBody((b) => b.split(token).join(ph.sample || ph.label));
    setPlaceholders((prev) => prev.filter((p) => p.key !== key));
  }

  function save() {
    const tb = titoloBozza.trim();
    if (!tb) {
      onError("Il titolo della bozza è obbligatorio.");
      return;
    }
    if (!body.trim()) {
      onError("Il testo della bozza è obbligatorio.");
      return;
    }
    startTransition(async () => {
      const res = await createNotaBozzaPnAction({
        titoloBozza: tb,
        titoloNota: titoloNota.trim(),
        bodyTemplate: body,
        placeholders,
        documentoStato: "approvata",
      });
      if (!res.success) {
        onError(res.error);
        return;
      }
      onSaved(res.item);
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rivedi e salva come bozza"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">Rivedi e Salva come Bozza</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Serve il <strong>titolo della bozza</strong> (catalogo) e il titolo
              della nota. Evidenzia i pezzi variabili.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <FaXmark size={14} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <label className="block text-xs font-medium text-slate-600">
            Titolo della bozza *
            <input
              value={titoloBozza}
              onChange={(e) => setTitoloBozza(e.target.value.slice(0, 200))}
              placeholder="Es. Follow-up primo contatto"
              className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm"
              autoFocus
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Titolo della nota
            <input
              value={titoloNota}
              onChange={(e) => setTitoloNota(e.target.value.slice(0, 200))}
              placeholder="Titolo precompilato nelle note future"
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-600">
                Testo / evidenzia variabili
              </label>
              <button
                type="button"
                onClick={evidenziaSelezione}
                className="inline-flex items-center gap-1.5 rounded-lg border border-yellow-400 bg-yellow-100 px-2.5 py-1 text-[11px] font-medium text-yellow-950 hover:bg-yellow-200"
              >
                <FaHighlighter size={11} />
                Evidenzia selezione
              </button>
            </div>
            <textarea
              ref={taRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm leading-relaxed"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Seleziona nome azienda, numeri, riferimenti… poi Evidenzia (anche
              più volte). Diventeranno campi matita nella nuova nota.
            </p>
          </div>

          {placeholders.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50/80 p-2">
              {placeholders.map((p) => (
                <li
                  key={p.key}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span>
                    <span className="rounded bg-yellow-200 px-1.5 py-0.5 font-mono text-[10px]">
                      {p.key}
                    </span>{" "}
                    {p.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePlaceholder(p.key)}
                    className="text-[10px] text-red-700 hover:underline"
                  >
                    Rimuovi
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={pending || !titoloBozza.trim() || !body.trim()}
            onClick={save}
            className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Salva bozza"}
          </button>
        </div>
      </div>
    </div>
  );
}
