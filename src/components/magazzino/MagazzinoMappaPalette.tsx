"use client";

import { useState } from "react";
import {
  MAPPA_LINEA_COLORI,
  MAPPA_LINEA_PALETTE,
  normalizzaColoreLinea,
} from "@/lib/magazzino/mappa";

export function MagazzinoMappaPalette({
  colore,
  onChange,
}: {
  colore: string;
  onChange: (hex: string) => void;
}) {
  const [aperta, setAperta] = useState(false);
  const [hexLibero, setHexLibero] = useState(colore);
  const attuale = normalizzaColoreLinea(colore);

  function applica(hex: string) {
    const next = normalizzaColoreLinea(hex);
    setHexLibero(next);
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium">Colore linea</span>
        {MAPPA_LINEA_COLORI.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Colore ${c}`}
            onClick={() => applica(c)}
            className={`h-6 w-6 rounded-full border ${
              attuale === c ? "ring-2 ring-teal-600 ring-offset-1" : "border-slate-300"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <label className="ml-1 inline-flex items-center gap-1 text-xs">
          Libero
          <input
            type="color"
            value={attuale}
            onChange={(e) => applica(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5"
            title="Scegli un colore qualsiasi"
          />
        </label>
        <button
          type="button"
          onClick={() => setAperta((v) => !v)}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-slate-50"
        >
          {aperta ? "Chiudi palette" : "Palette colori"}
        </button>
      </div>
      {aperta ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
          <p className="mb-1.5 text-[11px] text-slate-600">
            Colori particolari. Oppure scegli un colore libero dal selettore.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MAPPA_LINEA_PALETTE.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.nome}
                aria-label={c.nome}
                onClick={() => applica(c.hex)}
                className={`h-7 w-7 rounded-md border shadow-sm ${
                  attuale === c.hex
                    ? "ring-2 ring-teal-600 ring-offset-1"
                    : "border-slate-300"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
          <label className="mt-2 block text-xs">
            Codice HEX
            <input
              type="text"
              value={hexLibero}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value.startsWith("#")
                  ? e.target.value
                  : `#${e.target.value}`;
                setHexLibero(v);
                if (/^#[0-9A-Fa-f]{6}$/.test(v)) applica(v);
              }}
              className="ml-1 w-24 rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-xs"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
