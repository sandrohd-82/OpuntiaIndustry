"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  anteprimaFornitoreRapidoIngressoAction,
  createFornitoreRapidoIngressoAction,
} from "@/app/actions/produzione-ingresso-mp";
import { FieldLoadingOverlay } from "@/components/ui/SelectMenu";
import { labelFornitoreTipologia } from "@/lib/amministrazione/catalogo-offerta";
import {
  normalizeMansioneNome,
  scoreMansioneAffinita,
} from "@/lib/rubrica/mansioni-affinita";
import type { FornitoreTipologia } from "@/types/database";

export type FornitoreFiltroIngresso = "" | "servizio" | "prodotto" | "materia_prima";

export type FornitoreIngressoOpt = {
  id: string;
  label: string;
  targa: string;
  isBio: boolean;
  tipologie: FornitoreTipologia[];
};

const FILTRI: Array<{ value: FornitoreFiltroIngresso; label: string }> = [
  { value: "", label: "Tutti" },
  { value: "servizio", label: "Servizi" },
  { value: "prodotto", label: "Prodotti" },
  { value: "materia_prima", label: "Materia prima" },
];

type Props = {
  locked?: boolean;
  loading?: boolean;
  fornitori: FornitoreIngressoOpt[];
  value: string;
  onChange: (id: string, item: FornitoreIngressoOpt | undefined) => void;
  onCreated: (item: FornitoreIngressoOpt) => void;
  testMode?: boolean;
  defaultFiltro?: FornitoreFiltroIngresso;
  tipologiaSeTutti?: FornitoreTipologia;
  showCreate?: boolean;
  onTestNotice?: (msg: string) => void;
  onError?: (msg: string) => void;
};

function scoreAzienda(query: string, item: FornitoreIngressoOpt): number {
  const q = normalizeMansioneNome(query);
  if (!q) return 1;
  const hay = normalizeMansioneNome(`${item.label} ${item.targa}`);
  if (hay.includes(q) || normalizeMansioneNome(item.targa).includes(q)) {
    return 1;
  }
  return Math.max(
    scoreMansioneAffinita(q, hay),
    scoreMansioneAffinita(q, item.label),
    scoreMansioneAffinita(q, item.targa)
  );
}

export function FornitoreIngressoScrematura({
  locked = false,
  loading = false,
  fornitori,
  value,
  onChange,
  onCreated,
  testMode = false,
  defaultFiltro = "materia_prima",
  tipologiaSeTutti = "materia_prima",
  showCreate = true,
  onTestNotice,
  onError,
}: Props) {
  const [filtro, setFiltro] = useState<FornitoreFiltroIngresso>(defaultFiltro);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [nuovo, setNuovo] = useState(false);
  const [nome, setNome] = useState("");
  const [piva, setPiva] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = fornitori.find((f) => f.id === value);

  const affini = useMemo(() => {
    const nelFiltro = fornitori.filter(
      (f) => !filtro || f.tipologie.includes(filtro)
    );
    const q = query.trim();
    const ranked = nelFiltro
      .map((f) => ({ item: f, score: scoreAzienda(q, f) }))
      .filter((row) => (q ? row.score >= 0.35 : true))
      .sort(
        (a, b) =>
          b.score - a.score || a.item.label.localeCompare(b.item.label, "it")
      )
      .slice(0, 20)
      .map((row) => row.item);
    if (
      selected &&
      (!filtro || selected.tipologie.includes(filtro)) &&
      !ranked.some((f) => f.id === selected.id)
    ) {
      return [selected, ...ranked].slice(0, 20);
    }
    return ranked;
  }, [fornitori, filtro, query, selected]);

  useEffect(() => {
    if (open) return;
    setQuery(selected?.label ?? "");
  }, [selected, open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, filtro, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selected]);

  function pick(item: FornitoreIngressoOpt) {
    onChange(item.id, item);
    setQuery(item.label);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(affini.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = affini[highlight];
      if (hit) pick(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(selected?.label ?? "");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Screma per tipologia
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FILTRI.map((f) => (
            <button
              key={f.value || "tutti"}
              type="button"
              disabled={locked}
              onClick={() => setFiltro(f.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
                filtro === f.value
                  ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                  : "bg-white text-slate-700 ring-[var(--border)] hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={rootRef} className="relative">
        <input
          ref={searchRef}
          disabled={locked || loading}
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-busy={loading}
          placeholder={
            loading ? "Seleziona fornitore" : "Digita ragione sociale o targa…"
          }
          onFocus={() => {
            if (locked || loading) return;
            setOpen(true);
            if (selected && query === selected.label) setQuery("");
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (selected && next !== selected.label) {
              onChange("", undefined);
            }
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-[var(--primary)] disabled:opacity-60"
        />
        <FieldLoadingOverlay show={loading} />
        {open && !loading && !locked ? (
          <ul
            role="listbox"
            className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
          >
            {affini.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[var(--muted)]">
                {query.trim()
                  ? `Nessuna azienda affine a «${query.trim()}».`
                  : "Nessun fornitore in questa tipologia."}
              </li>
            ) : (
              affini.map((f, i) => (
                <li key={f.id} role="option" aria-selected={f.id === value}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(f)}
                    className={`flex w-full flex-col px-3 py-1.5 text-left text-sm ${
                      i === highlight || f.id === value
                        ? "bg-slate-100"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-medium">{f.label}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {f.tipologie.length
                        ? f.tipologie.map(labelFornitoreTipologia).join(", ")
                        : "senza tipologia"}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {showCreate && !locked ? (
        <button
          type="button"
          onClick={() => setNuovo((v) => !v)}
          className="text-sm text-[var(--primary)] underline"
        >
          {nuovo ? "Nascondi nuovo fornitore" : "+ Crea nuovo fornitore"}
        </button>
      ) : null}

      {nuovo && !locked ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ragione sociale"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            value={piva}
            onChange={(e) => setPiva(e.target.value)}
            placeholder="Partita IVA"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                const tipologie: FornitoreTipologia[] = filtro
                  ? [filtro]
                  : [tipologiaSeTutti];
                const body = {
                  ragioneSociale: nome,
                  partitaIva: piva,
                  tipologie,
                };
                const res = testMode
                  ? await anteprimaFornitoreRapidoIngressoAction(body)
                  : await createFornitoreRapidoIngressoAction(body);
                setBusy(false);
                if (!res.success) {
                  onError?.(res.error);
                  return;
                }
                const item: FornitoreIngressoOpt = {
                  id: res.id,
                  label: res.label,
                  targa: res.targa,
                  isBio: false,
                  tipologie: res.tipologie,
                };
                if (testMode) {
                  onTestNotice?.(
                    `Fornitore ${res.label} valido. Non salvato in anagrafica.`
                  );
                }
                onCreated(item);
                pick(item);
                setNuovo(false);
                setNome("");
                setPiva("");
              })();
            }}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
          >
            {busy ? "Salvataggio…" : "Salva fornitore"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
