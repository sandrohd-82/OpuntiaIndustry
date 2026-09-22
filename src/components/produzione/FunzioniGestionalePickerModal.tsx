"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  etichettaAvvioFunzione,
  groupFunzioniByArea,
  listFunzioniGestionaleCatalogo,
  type FunzioneGestionale,
} from "@/lib/produzione/funzioni-gestionale";

type Props = {
  open: boolean;
  selectedKeys: string[];
  onClose: () => void;
  onConfirm: (keys: string[]) => void;
};

function normalizza(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokensQuery(query: string): string[] {
  return normalizza(query)
    .split(/[\s/._-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function punteggioRicerca(
  f: FunzioneGestionale,
  tokens: string[]
): number | null {
  if (tokens.length === 0) return 0;
  const etichetta = normalizza(f.etichetta);
  const area = normalizza(f.area);
  const percorso = normalizza(f.percorso);
  const spiegazione = normalizza(f.spiegazione);
  const avvio = normalizza(etichettaAvvioFunzione(f));
  let score = 0;
  for (const token of tokens) {
    if (etichetta === token) score += 100;
    else if (etichetta.startsWith(token)) score += 70;
    else if (etichetta.includes(token)) score += 40;
    else if (avvio.includes(token)) score += 30;
    else if (percorso.includes(token)) score += 20;
    else if (area.includes(token)) score += 12;
    else if (spiegazione.includes(token)) score += 8;
    else return null;
  }
  return score;
}

function evidenzia(testo: string, tokens: string[]): ReactNode {
  if (tokens.length === 0) return testo;
  const source = testo;
  const lower = normalizza(source);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    let from = 0;
    while (from <= lower.length - token.length) {
      const at = lower.indexOf(token, from);
      if (at < 0) break;
      ranges.push({ start: at, end: at + token.length });
      from = at + token.length;
    }
  }
  if (ranges.length === 0) return testo;
  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const out: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((r, i) => {
    if (r.start > cursor) out.push(source.slice(cursor, r.start));
    out.push(
      <mark
        key={`${r.start}-${i}`}
        className="rounded-sm bg-amber-200 px-0.5 text-inherit"
      >
        {source.slice(r.start, r.end)}
      </mark>
    );
    cursor = r.end;
  });
  if (cursor < source.length) out.push(source.slice(cursor));
  return out;
}

export function FunzioniGestionalePickerModal({
  open,
  selectedKeys,
  onClose,
  onConfirm,
}: Props) {
  const catalog = useMemo(() => listFunzioniGestionaleCatalogo(), []);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(selectedKeys);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(selectedKeys);
    setQuery("");
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, selectedKeys]);

  const tokens = useMemo(() => tokensQuery(query), [query]);
  const hits = useMemo(() => {
    if (tokens.length === 0) return catalog;
    return catalog
      .map((f) => ({ f, score: punteggioRicerca(f, tokens) }))
      .filter((row): row is { f: FunzioneGestionale; score: number } =>
        row.score != null
      )
      .sort((a, b) => b.score - a.score || a.f.etichetta.localeCompare(b.f.etichetta, "it"))
      .map((row) => row.f);
  }, [catalog, tokens]);

  const filtered = useMemo(() => groupFunzioniByArea(hits), [hits]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query]);

  if (!open) return null;

  function toggle(key: string) {
    setDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function labelTipo(f: FunzioneGestionale): string {
    if (f.tipo === "inline") return "Procedura sul foglio";
    if (f.tipo === "azione") return "Azione di registrazione";
    return "Percorso interno";
  }

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Collega funzioni del gestionale"
        className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">
              Funzioni e processi di registrazione
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Elenco letto dal gestionale (menu, azioni e procedure). Seleziona
              quelle che l’operatore dovrà eseguire in questo passo.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark size={16} />
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-5 py-3">
          <input
            ref={searchRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="Scrivi e i risultati appaiono subito: prelievo, pesata…"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            {draft.length} selezionate
            {tokens.length > 0
              ? ` · ${hits.length} risultat${hits.length === 1 ? "o" : "i"} per «${query.trim()}»`
              : ` · ${catalog.length} funzioni in catalogo`}
          </p>
        </div>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
        >
          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Nessun risultato per «{query.trim()}».
            </p>
          ) : (
            filtered.map((group) => (
              <section key={group.area} className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {group.area}
                  {tokens.length > 0 ? ` · ${group.items.length}` : ""}
                </h3>
                <ul className="space-y-2">
                  {group.items.map((f) => {
                    const checked = draft.includes(f.key);
                    return (
                      <li key={f.key}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                            checked
                              ? "border-[var(--primary)] bg-slate-50"
                              : "border-[var(--border)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => toggle(f.key)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {evidenzia(f.etichetta, tokens)}
                            </span>
                            <span className="mt-0.5 block font-mono text-[11px] text-[var(--muted)]">
                              {evidenzia(f.percorso, tokens)}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--muted)]">
                              {evidenzia(f.spiegazione, tokens)}
                            </span>
                            <span className="mt-1 inline-flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                              <span>{labelTipo(f)}</span>
                              <span>· {etichettaAvvioFunzione(f)}</span>
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => onConfirm(draft)}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
          >
            Collega selezionate
          </button>
        </div>
      </div>
    </div>
  );
}
