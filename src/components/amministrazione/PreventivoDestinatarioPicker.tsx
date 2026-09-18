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
import {
  PreventivoDocField,
  PreventivoDocQa,
} from "@/components/amministrazione/PreventivoDocPencil";
import { PreventivoEditModal } from "@/components/amministrazione/PreventivoEditModal";
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
  onEdit: () => void;
};

type ModalProps = {
  value: DestinatarioPreventivo | null;
  onChange: (dest: DestinatarioPreventivo | null) => void;
  onClose: () => void;
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
    email: c.email ?? "",
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
    email: c.email ?? "",
    sede: c.sedeAmministrativa,
  };
}

export function PreventivoDestinatarioPicker({
  value,
  onEdit,
}: Props) {
  const addr = value ? formatDestinatarioIndirizzo(value.sede) : null;
  const ph = !value;

  return (
    <section className="mt-5">
      <PreventivoDocField
        label="Modifica destinatario"
        onEdit={onEdit}
        pencilRight
      >
        <div className="grid grid-cols-2 gap-6 text-[12px] leading-[1.45] text-slate-900">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
              Destinatario
            </p>
            <p
              className={`mt-1 font-semibold uppercase ${
                ph ? "text-slate-400" : ""
              }`}
            >
              {value?.ragioneSociale || "Spett.le Ragione sociale"}
            </p>
            <PreventivoDocQa
              className={ph ? "text-slate-400" : undefined}
              domanda="P.IVA"
              risposta={value?.partitaIva || "—"}
            />
            <PreventivoDocQa
              className={ph ? "text-slate-400" : undefined}
              domanda="CF"
              risposta={value?.codiceFiscale || "—"}
            />
          </div>
          <div className="pt-5 text-right uppercase">
            <p className={!addr?.via ? "text-slate-400 normal-case" : undefined}>
              {addr?.via || "Via / indirizzo"}
            </p>
            <p
              className={
                !addr?.capCitta ? "text-slate-400 normal-case" : undefined
              }
            >
              {addr?.capCitta || "CAP Città (PR)"}
            </p>
          </div>
        </div>
      </PreventivoDocField>
    </section>
  );
}

export function PreventivoDestinatarioModal({
  value,
  onChange,
  onClose,
}: ModalProps) {
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
  const [open, setOpen] = useState(true);
  const [highlight, setHighlight] = useState(0);
  const [commercialeArea, setCommercialeArea] = useState("");
  const [creating, setCreating] = useState<"cliente" | "possibile" | null>(
    null
  );
  const [saveError, setSaveError] = useState<string | null>(null);
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
    setHighlight(0);
  }, [query]);

  function pick(hit: Hit | null) {
    if (!hit) {
      onChange(null);
      setQuery("");
      return;
    }
    onChange(
      hit.kind === "cliente" ? fromCliente(hit.item) : fromPossibile(hit.item)
    );
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[highlight];
      if (hit) pick(hit);
    }
  }

  return (
    <>
      <PreventivoEditModal
        title="Destinatario"
        onClose={onClose}
        confirmLabel="Chiudi"
        onConfirm={onClose}
      >
        <div className="flex flex-col gap-3">
          {showAreaFilter ? (
            <div className="w-full">
              <CommercialeAreaFilterSelect
                value={commercialeArea}
                onChange={setCommercialeArea}
                records={[...clienti, ...possibili]}
                presetOptions={areaFilterOptions}
                includeAzienda={includeAzienda}
              />
            </div>
          ) : null}
          <div className="relative min-w-0 w-full">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              disabled={!ready}
              placeholder={
                ready
                  ? "Cerca cliente o possibile cliente…"
                  : "Caricamento anagrafiche"
              }
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-slate-700 disabled:opacity-60"
              autoComplete="off"
            />
            <FieldLoadingOverlay show={!ready} />
            {open && ready ? (
              <ul
                role="listbox"
                className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg"
              >
                {hits.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">
                    Nessun destinatario corrisponde.
                  </li>
                ) : (
                  hits.map((hit, i) => (
                    <li key={`${hit.kind}-${hit.item.id}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => pick(hit)}
                        className={`flex w-full flex-col px-3 py-1.5 text-left text-sm ${
                          i === highlight ? "bg-slate-100" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-medium">
                          {hit.item.ragioneSociale}
                        </span>
                        <span className="text-xs text-slate-500">
                          {hit.kind === "cliente"
                            ? "Cliente"
                            : "Possibile cliente"}
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
        </div>
        <div className="flex flex-wrap gap-1">
          <ActionGate actionKey={AZ.nuovoCliente}>
            <button
              type="button"
              onClick={() => {
                setSaveError(null);
                setCreating("cliente");
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
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
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
            >
              <FaPlus size={10} />
              Nuovo possibile
            </button>
          </ActionGate>
        </div>
        {value ? (
          <p className="text-sm text-slate-600">
            Selezionato: <span className="font-medium">{value.ragioneSociale}</span>
          </p>
        ) : null}
        {saveError ? (
          <p className="text-xs text-red-600">{saveError}</p>
        ) : null}
      </PreventivoEditModal>

      {creating === "cliente" ? (
        <ClienteFormModal
          mode="create"
          elevated
          stackTop
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
              setCreating(null);
              onClose();
              return { id: created.id };
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
          stackTop
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
              setCreating(null);
              onClose();
              return { id: created.id };
            } catch {
              setSaveError(
                "Salvataggio possibile cliente non riuscito. Riprova."
              );
              return false;
            }
          }}
        />
      ) : null}
    </>
  );
}
