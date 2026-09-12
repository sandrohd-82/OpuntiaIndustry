"use client";

import { useMemo, useRef, useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import {
  anteprimaFornitoreRapidoIngressoAction,
  createFornitoreRapidoIngressoAction,
} from "@/app/actions/produzione-ingresso-mp";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { labelFornitoreTipologia } from "@/lib/amministrazione/catalogo-offerta";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [nuovo, setNuovo] = useState(false);
  const [nome, setNome] = useState("");
  const [piva, setPiva] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = fornitori.find((f) => f.id === value);
  const visibili = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fornitori.filter((f) => {
      if (filtro && !f.tipologie.includes(filtro)) return false;
      if (!q) return true;
      return (
        f.label.toLowerCase().includes(q) || f.targa.toLowerCase().includes(q)
      );
    });
  }, [fornitori, filtro, query]);
  const options =
    selected && !visibili.some((f) => f.id === selected.id)
      ? [selected, ...visibili]
      : visibili;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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
        <button
          type="button"
          disabled={locked}
          aria-pressed={searchOpen}
          aria-label="Cerca ragione sociale o targa"
          onClick={() => {
            setSearchOpen((v) => {
              const next = !v;
              if (next) {
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }
              return next;
            });
          }}
          className={`mt-0.5 shrink-0 rounded-lg p-2 ${
            searchOpen
              ? "bg-[var(--primary)] text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FaMagnifyingGlass size={14} />
        </button>
      </div>

      {searchOpen ? (
        <input
          ref={searchRef}
          disabled={locked}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca ragione sociale o targa…"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      ) : null}

      <SelectMenu
        disabled={locked}
        loading={loading}
        placeholder="Seleziona fornitore"
        count={visibili.length}
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          onChange(
            id,
            fornitori.find((x) => x.id === id)
          );
        }}
      >
        {options.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
            {f.tipologie.length
              ? ` · ${f.tipologie.map(labelFornitoreTipologia).join(", ")}`
              : " · senza tipologia"}
          </option>
        ))}
      </SelectMenu>

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
                onChange(item.id, item);
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
