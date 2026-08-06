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
  const cittaListId = useId();
  const viaListId = useId();
  const [paesi, setPaesi] = useState<PaeseSuggestion[]>([]);
  const [showPaesi, setShowPaesi] = useState(false);
  const [paesiLoading, setPaesiLoading] = useState(false);
  const [cittaQuery, setCittaQuery] = useState(value.citta);
  const [capOptions, setCapOptions] = useState<string[]>([]);
  const [streets, setStreets] = useState<StreetSuggestion[]>([]);
  const [showStreets, setShowStreets] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const paeseAbort = useRef<AbortController | null>(null);
  const streetAbort = useRef<AbortController | null>(null);

  function setField<K extends keyof SedeFornitore>(key: K, v: string) {
    onChange({ ...value, [key]: v });
  }

  useEffect(() => {
    setCittaQuery(value.citta);
  }, [value.citta]);

  useEffect(() => {
    const q = cittaQuery.trim();
    if (q.length < 2) {
      setPaesi([]);
      setShowPaesi(false);
      setPaesiLoading(false);
      return;
    }

    // Se la query coincide già con la città selezionata e non stiamo cercando, non forzare il menu
    const timer = window.setTimeout(async () => {
      paeseAbort.current?.abort();
      const controller = new AbortController();
      paeseAbort.current = controller;
      setPaesiLoading(true);

      try {
        const res = await fetch(
          `/api/address/paesi?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        const data = (await res.json()) as { suggestions?: PaeseSuggestion[] };
        if (!controller.signal.aborted) {
          setPaesi(data.suggestions ?? []);
        }
      } catch {
        if (!controller.signal.aborted) setPaesi([]);
      } finally {
        if (!controller.signal.aborted) setPaesiLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      paeseAbort.current?.abort();
    };
  }, [cittaQuery]);

  function selectPaese(paese: PaeseSuggestion) {
    const caps = paese.caps?.length ? paese.caps : paese.cap ? [paese.cap] : [];
    setCapOptions(caps);
    onChange({
      ...value,
      citta: paese.citta,
      provincia: paese.provincia,
      nazione: paese.nazione,
      cap: paese.cap || value.cap,
    });
    setCittaQuery(paese.citta);
    setShowPaesi(false);
  }

  useEffect(() => {
    const { street } = splitStreetAndCivico(value.indirizzo);
    if (street.length < 3 || !value.citta.trim()) {
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
          q: value.indirizzo,
          citta: value.citta,
        });
        if (value.cap.trim()) params.set("cap", value.cap.trim());
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

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <p className="text-xs text-[var(--muted)]">
        Parti dal paese: i suggerimenti compilano gli altri campi, ma tutto resta
        modificabile.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="relative block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Città / Paese</span>
          <input
            value={cittaQuery}
            onChange={(e) => {
              setCittaQuery(e.target.value);
              setShowPaesi(true);
              setField("citta", e.target.value);
            }}
            onFocus={() => {
              if (cittaQuery.trim().length >= 2) setShowPaesi(true);
            }}
            required
            placeholder="Inizia a scrivere il paese…"
            aria-autocomplete="list"
            aria-controls={cittaListId}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
          {paesiLoading && showPaesi && (
            <p className="mt-1 text-xs text-[var(--muted)]">Ricerca paesi…</p>
          )}
          {showPaesi && cittaQuery.trim().length >= 2 && (
            <div id={cittaListId}>
              <SuggestionList
                items={paesi}
                onSelect={selectPaese}
                emptyLabel={
                  !paesiLoading
                    ? "Nessun paese trovato. Puoi lasciare il testo digitato."
                    : undefined
                }
              />
            </div>
          )}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nazione</span>
          <input
            value={value.nazione}
            onChange={(e) => setField("nazione", e.target.value)}
            required
            placeholder="Es. Italia"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Provincia</span>
          <input
            value={value.provincia}
            onChange={(e) => setField("provincia", e.target.value)}
            required
            placeholder="Es. Arezzo"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">CAP</span>
          <input
            value={value.cap}
            onChange={(e) =>
              setField("cap", e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            inputMode="numeric"
            autoComplete="postal-code"
            required
            placeholder="Modificabile liberamente"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
          {capOptions.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {capOptions.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => setField("cap", cap)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
                    value.cap === cap
                      ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                      : "bg-white text-slate-700 ring-[var(--border)] hover:bg-slate-50"
                  }`}
                >
                  {cap}
                </button>
              ))}
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
            placeholder="Es. via Roma 12"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-controls={viaListId}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
          {streetLoading && (
            <p className="mt-1 text-xs text-[var(--muted)]">Ricerca vie…</p>
          )}
          {showStreets &&
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
                      : "Nessuna via trovata. Puoi scrivere via e civico manualmente."
                  }
                />
              </div>
            )}
        </label>
      </div>
    </fieldset>
  );
}
