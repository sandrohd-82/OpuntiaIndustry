"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  joinStreetAndCivico,
  splitStreetAndCivico,
} from "@/lib/address/street";
import type {
  PaeseSuggestion,
  StreetSuggestion,
} from "@/lib/address/types";
import type { SedeFornitore } from "@/lib/amministrazione/fornitori";

type Props = {
  title: string;
  value: SedeFornitore;
  onChange: (next: SedeFornitore) => void;
};

function SuggestionList<T extends { id: string; label: string }>({
  items,
  onSelect,
  emptyLabel,
}: {
  items: T[];
  onSelect: (item: T) => void;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className="mt-1 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs text-[var(--muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AddressSedeFields({ title, value, onChange }: Props) {
  const capListId = useId();
  const cittaListId = useId();
  const viaListId = useId();
  const [paesi, setPaesi] = useState<PaeseSuggestion[]>([]);
  const [showPaesi, setShowPaesi] = useState(false);
  const [paesiLoading, setPaesiLoading] = useState(false);
  const [cittaQuery, setCittaQuery] = useState("");
  const [streets, setStreets] = useState<StreetSuggestion[]>([]);
  const [showStreets, setShowStreets] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const paeseAbort = useRef<AbortController | null>(null);
  const streetAbort = useRef<AbortController | null>(null);

  function setField<K extends keyof SedeFornitore>(key: K, v: string) {
    onChange({ ...value, [key]: v });
  }

  function onCapChange(raw: string) {
    const cap = raw.replace(/\D/g, "").slice(0, 5);
    onChange({
      ...value,
      cap,
      nazione: "",
      provincia: "",
      citta: "",
      indirizzo: "",
    });
    setCittaQuery("");
    setPaesi([]);
    setShowPaesi(false);
    setStreets([]);
    setShowStreets(false);
  }

  useEffect(() => {
    if (value.cap.length !== 5) {
      setPaesi([]);
      setShowPaesi(false);
      setPaesiLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      paeseAbort.current?.abort();
      const controller = new AbortController();
      paeseAbort.current = controller;
      setPaesiLoading(true);

      try {
        const params = new URLSearchParams({ cap: value.cap });
        if (cittaQuery.trim()) params.set("q", cittaQuery.trim());
        const res = await fetch(`/api/address/paesi?${params}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { suggestions?: PaeseSuggestion[] };
        if (!controller.signal.aborted) {
          setPaesi(data.suggestions ?? []);
          setShowPaesi(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPaesi([]);
          setShowPaesi(false);
        }
      } finally {
        if (!controller.signal.aborted) setPaesiLoading(false);
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
      paeseAbort.current?.abort();
    };
  }, [value.cap, cittaQuery]);

  function selectPaese(paese: PaeseSuggestion) {
    onChange({
      ...value,
      // conserva il CAP digitato dall'utente
      cap: value.cap || paese.cap,
      nazione: paese.nazione,
      provincia: paese.provincia,
      citta: paese.citta,
    });
    setCittaQuery(paese.citta);
    setShowPaesi(false);
  }

  useEffect(() => {
    const { street } = splitStreetAndCivico(value.indirizzo);
    if (value.cap.length !== 5 || street.length < 3 || !value.citta) {
      setStreets([]);
      setShowStreets(false);
      setStreetLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      streetAbort.current?.abort();
      const controller = new AbortController();
      streetAbort.current = controller;
      setStreetLoading(true);

      try {
        const params = new URLSearchParams({
          cap: value.cap,
          q: value.indirizzo,
          citta: value.citta,
        });
        const res = await fetch(`/api/address/streets?${params}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { suggestions?: StreetSuggestion[] };
        if (!controller.signal.aborted) {
          setStreets(data.suggestions ?? []);
          setShowStreets(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setStreets([]);
          setShowStreets(false);
        }
      } finally {
        if (!controller.signal.aborted) setStreetLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      streetAbort.current?.abort();
    };
  }, [value.indirizzo, value.cap, value.citta]);

  const locationFilled = Boolean(value.citta && value.provincia && value.nazione);

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="relative block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">CAP</span>
          <input
            value={value.cap}
            onChange={(e) => onCapChange(e.target.value)}
            onFocus={() => {
              if (value.cap.length === 5 && paesi.length > 0) setShowPaesi(true);
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            required
            placeholder="Inserisci il CAP"
            aria-autocomplete="list"
            aria-controls={capListId}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
          {paesiLoading && !locationFilled && (
            <p className="mt-1 text-xs text-[var(--muted)]">Ricerca paesi…</p>
          )}
          {showPaesi && !locationFilled && (
            <div id={capListId}>
              <SuggestionList
                items={paesi}
                onSelect={selectPaese}
                emptyLabel={
                  value.cap.length === 5 && !paesiLoading
                    ? "Nessun paese trovato per questo CAP."
                    : undefined
                }
              />
            </div>
          )}
          {value.cap.length === 5 && !locationFilled && paesi.length > 0 && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Seleziona il paese corretto (possono esserci più opzioni nella zona).
            </p>
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nazione</span>
          <input
            value={value.nazione}
            readOnly
            required
            placeholder="Autocompilata"
            className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Provincia</span>
          <input
            value={value.provincia}
            readOnly
            required
            placeholder="Autocompilata"
            className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 outline-none"
          />
        </label>

        <label className="relative block text-sm sm:col-span-2">
          <span className="mb-1 flex items-center justify-between gap-2 font-medium">
            <span>Città / Paese</span>
            {locationFilled && (
              <button
                type="button"
                onClick={() => {
                  setCittaQuery(value.citta);
                  setShowPaesi(true);
                }}
                className="text-xs font-medium text-[var(--primary)] hover:underline"
              >
                Cambia
              </button>
            )}
          </span>
          <input
            value={locationFilled && !showPaesi ? value.citta : cittaQuery}
            onChange={(e) => {
              const next = e.target.value;
              setCittaQuery(next);
              setShowPaesi(true);
              if (locationFilled) {
                onChange({
                  ...value,
                  citta: "",
                  provincia: "",
                  nazione: "",
                  indirizzo: "",
                });
              }
            }}
            onFocus={() => {
              if (value.cap.length === 5) {
                setCittaQuery(value.citta || cittaQuery);
                setShowPaesi(true);
              }
            }}
            required={!locationFilled}
            disabled={value.cap.length !== 5}
            placeholder={
              value.cap.length === 5
                ? "Cerca o seleziona il paese…"
                : "Prima inserisci il CAP"
            }
            aria-autocomplete="list"
            aria-controls={cittaListId}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)] disabled:bg-slate-50 disabled:text-[var(--muted)]"
          />
          {showPaesi && value.cap.length === 5 && (
            <div id={cittaListId}>
              <SuggestionList
                items={paesi}
                onSelect={selectPaese}
                emptyLabel={
                  !paesiLoading
                    ? "Nessun paese trovato. Prova a scrivere il nome."
                    : undefined
                }
              />
            </div>
          )}
        </label>

        <label className="relative block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Indirizzo (via e civico)</span>
          <input
            value={value.indirizzo}
            onChange={(e) => {
              setField("indirizzo", e.target.value);
              setShowStreets(true);
            }}
            onFocus={() => {
              if (streets.length > 0) setShowStreets(true);
            }}
            required
            disabled={!locationFilled}
            placeholder={
              locationFilled
                ? "Es. via Roma 12 — maiuscole/minuscole indifferenti"
                : "Prima seleziona CAP e paese"
            }
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-controls={viaListId}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)] disabled:bg-slate-50 disabled:text-[var(--muted)]"
          />
          {streetLoading && (
            <p className="mt-1 text-xs text-[var(--muted)]">Ricerca vie…</p>
          )}
          {showStreets &&
            locationFilled &&
            splitStreetAndCivico(value.indirizzo).street.trim().length >= 3 && (
              <div id={viaListId}>
                <SuggestionList
                  items={streets}
                  onSelect={(street) => {
                    const { civico } = splitStreetAndCivico(value.indirizzo);
                    const { street: selectedStreet, civico: selectedCivico } =
                      splitStreetAndCivico(street.indirizzo);
                    setField(
                      "indirizzo",
                      joinStreetAndCivico(
                        selectedStreet,
                        selectedCivico || civico
                      )
                    );
                    setShowStreets(false);
                  }}
                  emptyLabel={
                    streetLoading
                      ? undefined
                      : "Nessuna via trovata. Puoi scrivere via e numero civico manualmente."
                  }
                />
              </div>
            )}
        </label>
      </div>
    </fieldset>
  );
}
