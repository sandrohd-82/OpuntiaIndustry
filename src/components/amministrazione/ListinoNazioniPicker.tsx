"use client";

import { useMemo, useState } from "react";
import {
  GEO_CONTINENTE_LABEL,
  GEO_CONTINENTI,
  labelLingua,
  type GeoContinenteCodice,
  type GeoNazione,
} from "@/lib/ecosystem/geo-nazioni";

export function ListinoNazioniPicker({
  nazioni,
  selectedIds,
  disabled,
  defaultOpen = false,
  onChange,
}: {
  nazioni: GeoNazione[];
  selectedIds: string[];
  disabled?: boolean;
  defaultOpen?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [continente, setContinente] = useState<GeoContinenteCodice>("europa");
  const selected = useMemo(
    () => nazioni.filter((n) => selectedIds.includes(n.id)),
    [nazioni, selectedIds]
  );
  const filtered = useMemo(
    () =>
      nazioni.filter((n) => n.continenteCodice === continente).sort((a, b) =>
        a.nome.localeCompare(b.nome, "it")
      ),
    [nazioni, continente]
  );

  function toggle(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-[var(--border)] bg-slate-50 px-2 py-1.5 text-left text-xs font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          Nazioni ({selected.length})
          {selected.length
            ? ` · ${selected
                .slice(0, 4)
                .map((n) => n.nome)
                .join(", ")}${selected.length > 4 ? "…" : ""}`
            : " · nessuna selezionata"}
        </span>
        <span className="text-[var(--muted)]">{open ? "▲ chiudi" : "▼ espandi"}</span>
      </button>
      {!open && selected.length ? (
        <div className="flex flex-wrap gap-1">
          {selected.slice(0, 8).map((n) => (
            <span
              key={n.id}
              className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
            >
              {n.nome}
            </span>
          ))}
          {selected.length > 8 ? (
            <span className="text-[11px] text-[var(--muted)]">
              +{selected.length - 8}
            </span>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <>
      <div className="flex flex-wrap gap-1">
        {GEO_CONTINENTI.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              continente === c
                ? "bg-slate-800 text-white"
                : "border border-[var(--border)] bg-white"
            }`}
            onClick={() => setContinente(c)}
          >
            {GEO_CONTINENTE_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
        {filtered.length ? (
          <ul className="columns-2 gap-3 text-xs sm:columns-3">
            {filtered.map((n) => (
              <li key={n.id} className="break-inside-avoid py-0.5">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedIds.includes(n.id)}
                    onChange={() => toggle(n.id)}
                  />
                  <span>
                    {n.nome}{" "}
                    <span className="text-[var(--muted)]">({n.iso2})</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--muted)]">Nessuna nazione.</p>
        )}
      </div>
      {selected.length ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((n) => (
            <button
              key={n.id}
              type="button"
              disabled={disabled}
              className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
              onClick={() => toggle(n.id)}
              title="Rimuovi"
            >
              {n.nome}
              {n.lingueIso.length
                ? ` · ${n.lingueIso.map(labelLingua).join("/")}`
                : ""}{" "}
              ×
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-800">
          Seleziona una o più nazioni (anche da continenti diversi).
        </p>
      )}
        </>
      ) : null}
    </div>
  );
}
