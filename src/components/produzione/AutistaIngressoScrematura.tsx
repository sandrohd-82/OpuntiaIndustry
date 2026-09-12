"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaMagnifyingGlass } from "react-icons/fa6";
import {
  listRubricaContattiAction,
  listRubricaMansioniAction,
} from "@/app/actions/rubrica";
import { RubricaContattoFormModal } from "@/components/amministrazione/RubricaContattoFormModal";
import { SelectMenu } from "@/components/ui/SelectMenu";
import {
  displayContattoName,
  type RubricaContatto,
  type RubricaMansione,
} from "@/lib/rubrica/types";

type Props = {
  locked?: boolean;
  value: string;
  onChange: (id: string, item: RubricaContatto | undefined) => void;
  testMode?: boolean;
  defaultAziendaTipo?: "fornitore";
  defaultAziendaId?: string;
  defaultAziendaLabel?: string;
  onTestNotice?: (msg: string) => void;
  onError?: (msg: string) => void;
  onCreated?: (item: RubricaContatto) => void;
};

export function AutistaIngressoScrematura({
  locked = false,
  value,
  onChange,
  testMode = false,
  defaultAziendaTipo = "fornitore",
  defaultAziendaId = "",
  defaultAziendaLabel = "",
  onTestNotice,
  onError,
  onCreated,
}: Props) {
  const [mansioni, setMansioni] = useState<RubricaMansione[]>([]);
  const [filtro, setFiltro] = useState("");
  const [contatti, setContatti] = useState<RubricaContatto[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [fetching, setFetching] = useState(true);
  const [mansioniReady, setMansioniReady] = useState(false);
  const [showRubrica, setShowRubrica] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void listRubricaMansioniAction().then((res) => {
      if (!res.success) {
        onError?.(res.error);
        setMansioniReady(true);
        return;
      }
      setMansioni(res.items);
      const autista = res.items.find((m) => m.codice === "autista");
      if (autista) setFiltro(autista.id);
      setMansioniReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mansioniReady) return;
    let cancelled = false;
    setFetching(true);
    void listRubricaContattiAction({
      query: debouncedQuery,
      mansioneId: filtro || null,
      skipScope: true,
    }).then((res) => {
      if (cancelled) return;
      setFetching(false);
      if (!res.success) {
        onError?.(res.error);
        return;
      }
      setContatti(res.items);
    });
    return () => {
      cancelled = true;
    };
  }, [filtro, debouncedQuery, mansioniReady, onError]);

  const loading = fetching || query !== debouncedQuery;

  const selected = contatti.find((c) => c.id === value);
  const visibili = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contatti;
    return contatti.filter((c) => {
      const label = `${c.nome} ${c.cognome} ${c.aziendaLabel} ${c.telefono}`.toLowerCase();
      return label.includes(q);
    });
  }, [contatti, query]);
  const options =
    selected && !visibili.some((c) => c.id === selected.id)
      ? [selected, ...visibili]
      : visibili;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Screma per mansione
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={locked}
              onClick={() => setFiltro("")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
                filtro === ""
                  ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                  : "bg-white text-slate-700 ring-[var(--border)] hover:bg-slate-50"
              }`}
            >
              Tutti
            </button>
            {mansioni.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={locked}
                onClick={() => setFiltro(m.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
                  filtro === m.id
                    ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                    : "bg-white text-slate-700 ring-[var(--border)] hover:bg-slate-50"
                }`}
              >
                {m.nome}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={locked}
          aria-pressed={searchOpen}
          aria-label="Cerca nome o azienda"
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
          placeholder="Cerca nome, telefono o azienda…"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      ) : null}

      <SelectMenu
        disabled={locked}
        loading={loading}
        placeholder="Seleziona autista"
        count={visibili.length}
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          onChange(
            id,
            contatti.find((c) => c.id === id)
          );
        }}
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {displayContattoName(c)}
            {c.aziendaLabel ? ` — ${c.aziendaLabel}` : ""}
            {c.mansione ? ` · ${c.mansione}` : ""}
          </option>
        ))}
      </SelectMenu>

      {!locked ? (
        <button
          type="button"
          onClick={() => setShowRubrica(true)}
          className="text-sm text-[var(--primary)] underline"
        >
          + Nuovo autista
        </button>
      ) : null}

      {showRubrica ? (
        <RubricaContattoFormModal
          elevated
          testMode={testMode}
          defaultMansioneId={filtro}
          defaultAziendaTipo={defaultAziendaId ? defaultAziendaTipo : "nessuna"}
          defaultAziendaId={defaultAziendaId}
          defaultAziendaLabel={defaultAziendaLabel}
          lockToThisAzienda={Boolean(defaultAziendaId)}
          onClose={() => setShowRubrica(false)}
          onCreated={(item) => {
            setContatti((cur) =>
              cur.some((c) => c.id === item.id) ? cur : [...cur, item]
            );
            if (item.mansioneId && !mansioni.some((m) => m.id === item.mansioneId)) {
              void listRubricaMansioniAction().then((res) => {
                if (res.success) setMansioni(res.items);
              });
            }
            if (item.mansioneId) setFiltro(item.mansioneId);
            onCreated?.(item);
            onChange(item.id, item);
            if (testMode) {
              onTestNotice?.(
                `Contatto ${displayContattoName(item)} valido. Non salvato in rubrica.`
              );
            }
            setShowRubrica(false);
          }}
        />
      ) : null}
    </div>
  );
}
