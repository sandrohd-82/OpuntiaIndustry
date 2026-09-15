"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { FaPlus } from "react-icons/fa6";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { PossibileClienteFormModal } from "@/components/amministrazione/PossibileClienteFormModal";
import { CommercialeAreaFilterSelect } from "@/components/amministrazione/CommercialeAreaFilterSelect";
import { FieldLoadingOverlay } from "@/components/ui/SelectMenu";
import { useClienti } from "@/hooks/useClienti";
import { useClientiPossibili } from "@/hooks/useClientiPossibili";
import { useCommercialeAreaFilter } from "@/hooks/useCommercialeAreaFilter";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  formatDestinatarioIndirizzo,
  type DestinatarioPreventivo,
} from "@/lib/amministrazione/preventivo-letterhead";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";
import {
  commercialeAssegnazioneSearchText,
  formatCommercialeAssegnazione,
  matchesCommercialeArea,
} from "@/lib/auth/commerciale";

type Props = {
  value: DestinatarioPreventivo | null;
  onChange: (dest: DestinatarioPreventivo | null) => void;
};

type Hit =
  | { kind: "cliente"; item: Cliente }
  | { kind: "possibile"; item: ClientePossibile };

function normalizeSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fromCliente(c: Cliente): DestinatarioPreventivo {
  return {
    kind: "cliente",
    id: c.id,
    ragioneSociale: c.ragioneSociale,
    partitaIva: c.partitaIva,
    codiceFiscale: c.codiceFiscale,
    codiceTarga: c.codiceTarga,
    sede: c.sedeAmministrativa,
  };
}

function fromPossibile(c: ClientePossibile): DestinatarioPreventivo {
  return {
    kind: "possibile",
    id: c.id,
    ragioneSociale: c.ragioneSociale,
    partitaIva: c.partitaIva,
    codiceFiscale: c.codiceFiscale,
    codiceTarga: "PC",
    sede: c.sedeAmministrativa,
  };
}

function labelHit(hit: Hit) {
  return hit.item.ragioneSociale;
}

export function PreventivoDestinatarioPicker({ value, onChange }: Props) {
  const { clienti, ready: clientiReady, addCliente } = useClienti();
  const { items: possibili, ready: leadReady, addPossibile } =
    useClientiPossibili();
  const {
    showFilter: showAreaFilter,
    options: areaFilterOptions,
    includeAzienda,
    defaultArea,
    ready: filterReady,
  } = useCommercialeAreaFilter();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [commercialeArea, setCommercialeArea] = useState("");
  const [creating, setCreating] = useState<"cliente" | "possibile" | null>(
    null
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ready = clientiReady && leadReady;

  useEffect(() => {
    if (!filterReady) return;
    setCommercialeArea(defaultArea);
  }, [filterReady, defaultArea]);

  const hits = useMemo(() => {
    const list: Hit[] = [
      ...clienti.map((item) => ({ kind: "cliente" as const, item })),
      ...possibili
        .filter((p) => p.stato !== "convertito" && p.stato !== "scartato")
        .map((item) => ({ kind: "possibile" as const, item })),
    ];
    list.sort((a, b) =>
      a.item.ragioneSociale.localeCompare(b.item.ragioneSociale, "it", {
        sensitivity: "base",
      })
    );
    const q = normalizeSearch(query);
    return list.filter((hit) => {
      if (
        showAreaFilter &&
        !matchesCommercialeArea(hit.item, commercialeArea)
      ) {
        return false;
      }
      if (!q) return true;
      const extra =
        hit.kind === "cliente" ? hit.item.codiceTarga : hit.item.stato;
      const hay = normalizeSearch(
        `${hit.item.ragioneSociale} ${hit.item.partitaIva} ${hit.item.codiceFiscale} ${extra} ${commercialeAssegnazioneSearchText(hit.item)}`
      );
      return hay.includes(q);
    });
  }, [clienti, possibili, query, commercialeArea, showAreaFilter]);

  useEffect(() => {
    if (!value || open) return;
    setQuery(value.ragioneSociale);
  }, [value, open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value?.ragioneSociale ?? "");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [value]);

  function pick(hit: Hit | null) {
    if (!hit) {
      onChange(null);
      setQuery("");
      setOpen(false);
      return;
    }
    onChange(
      hit.kind === "cliente" ? fromCliente(hit.item) : fromPossibile(hit.item)
    );
    setQuery(labelHit(hit));
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
      setHighlight((h) => Math.min(h + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[highlight];
      if (hit) pick(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(value?.ragioneSociale ?? "");
    }
  }

  const addr = value ? formatDestinatarioIndirizzo(value.sede) : null;

  return (
    <section className="mt-5" ref={rootRef}>
      <div className="print:hidden mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        {showAreaFilter ? (
          <div className="sm:w-52">
            <CommercialeAreaFilterSelect
              value={commercialeArea}
              onChange={setCommercialeArea}
              records={[...clienti, ...possibili]}
              presetOptions={areaFilterOptions}
              includeAzienda={includeAzienda}
            />
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="preventivo-destinatario-list"
            disabled={!ready}
            placeholder={
              ready
                ? "Cerca cliente o possibile cliente…"
                : "Caricamento anagrafiche"
            }
            value={query}
            onFocus={() => {
              setOpen(true);
              if (value && query === value.ragioneSociale) setQuery("");
            }}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setOpen(true);
              if (value && next !== value.ragioneSociale) onChange(null);
            }}
            onKeyDown={onKeyDown}
            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-slate-700 disabled:opacity-60"
            autoComplete="off"
          />
          <FieldLoadingOverlay show={!ready} />
          {open && ready ? (
            <ul
              id="preventivo-destinatario-list"
              role="listbox"
              className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg"
            >
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  Nessun destinatario corrisponde.
                </li>
              ) : (
                hits.map((hit, i) => (
                  <li
                    key={`${hit.kind}-${hit.item.id}`}
                    role="option"
                    aria-selected={
                      value?.kind === hit.kind && value.id === hit.item.id
                    }
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(hit)}
                      className={`flex w-full flex-col px-3 py-1.5 text-left text-sm ${
                        i === highlight
                          ? "bg-slate-100"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-medium">
                        {hit.item.ragioneSociale}
                      </span>
                      <span className="text-xs text-slate-500">
                        {hit.kind === "cliente" ? "Cliente" : "Possibile cliente"}
                        {hit.item.partitaIva
                          ? ` · P.IVA ${hit.item.partitaIva}`
                          : ""}
                        {` · ${formatCommercialeAssegnazione(hit.item)}`}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <ActionGate actionKey={AZ.nuovoCliente}>
            <button
              type="button"
              onClick={() => {
                setSaveError(null);
                setCreating("cliente");
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <FaPlus size={10} />
              Nuovo cliente
            </button>
          </ActionGate>
          <ActionGate actionKey={AZ.nuovoPossibileCliente}>
            <button
              type="button"
              onClick={() => {
                setSaveError(null);
                setCreating("possibile");
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <FaPlus size={10} />
              Nuovo possibile
            </button>
          </ActionGate>
        </div>
      </div>

      {saveError ? (
        <p className="print:hidden mb-2 text-xs text-red-600">{saveError}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-6 text-[12px] leading-[1.45] text-slate-900">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
            Destinatario
          </p>
          {value ? (
            <>
              <p className="mt-1 font-semibold uppercase">
                {value.ragioneSociale}
              </p>
              <p>P.IVA {value.partitaIva || "—"}</p>
              <p>CF {value.codiceFiscale || "—"}</p>
            </>
          ) : (
            <p className="mt-1 text-slate-400">
              Seleziona un cliente o un possibile cliente, oppure aggiungine uno
              nuovo.
            </p>
          )}
        </div>
        <div className="pt-5 text-right uppercase">
          {addr && (addr.via || addr.capCitta) ? (
            <>
              {addr.via ? <p>{addr.via}</p> : null}
              {addr.capCitta ? <p>{addr.capCitta}</p> : null}
            </>
          ) : (
            <p className="text-slate-400 normal-case">Indirizzo</p>
          )}
        </div>
      </div>

      {creating === "cliente" ? (
        <ClienteFormModal
          mode="create"
          elevated
          onClose={() => setCreating(null)}
          onSave={async (values) => {
            try {
              const created = await addCliente(values);
              if (!created) {
                setSaveError("Salvataggio cliente non riuscito. Riprova.");
                return false;
              }
              setSaveError(null);
              onChange(fromCliente(created));
              setQuery(created.ragioneSociale);
              setCreating(null);
              return true;
            } catch {
              setSaveError("Salvataggio cliente non riuscito. Riprova.");
              return false;
            }
          }}
        />
      ) : null}

      {creating === "possibile" ? (
        <PossibileClienteFormModal
          mode="create"
          onClose={() => setCreating(null)}
          onSave={async (values) => {
            try {
              const created = await addPossibile(values);
              if (!created) {
                setSaveError(
                  "Salvataggio possibile cliente non riuscito. Riprova."
                );
                return false;
              }
              setSaveError(null);
              onChange(fromPossibile(created));
              setQuery(created.ragioneSociale);
              setCreating(null);
              return true;
            } catch {
              setSaveError(
                "Salvataggio possibile cliente non riuscito. Riprova."
              );
              return false;
            }
          }}
        />
      ) : null}
    </section>
  );
}
