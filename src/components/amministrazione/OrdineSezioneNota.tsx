"use client";

import { useEffect, useState } from "react";
import {
  ORDINE_SEZIONE_LABEL,
  testoNota,
  type NoteSezioniOrdine,
  type OrdineSezioneChiave,
} from "@/lib/amministrazione/ordine-sezione-note";

export function TitoloConNota({
  titolo,
  valore,
  onChange,
}: {
  titolo: string;
  valore: string;
  onChange: (testo: string) => void;
}) {
  const [aperta, setAperta] = useState(Boolean(valore.trim()));

  useEffect(() => {
    if (valore.trim()) setAperta(true);
  }, [valore]);

  return (
    <span className="block">
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span>{titolo}</span>
        <button
          type="button"
          className="border-0 bg-transparent p-0 text-sm font-normal text-amber-600 underline decoration-amber-600"
          onClick={() => setAperta((open) => !open)}
        >
          (+ Aggiungi Nota Qui)
        </button>
      </span>
      {aperta ? (
        <textarea
          value={valore}
          maxLength={2000}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Nota ${titolo}`}
          className="mt-2 block w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-normal text-slate-900"
        />
      ) : null}
    </span>
  );
}

export function NotaSezioneTesto({ testo }: { testo: string }) {
  if (!testo.trim()) return null;
  return (
    <p className="mt-1 whitespace-pre-wrap text-sm text-amber-800">{testo}</p>
  );
}

export function NoteSezioniElenco({
  note,
}: {
  note: NoteSezioniOrdine;
}) {
  const voci = (Object.keys(ORDINE_SEZIONE_LABEL) as OrdineSezioneChiave[])
    .map((chiave) => ({
      chiave,
      titolo: ORDINE_SEZIONE_LABEL[chiave],
      testo: testoNota(note, chiave),
    }))
    .filter((voce) => voce.testo);
  if (!voci.length) return null;
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
      {voci.map((voce) => (
        <div key={voce.chiave}>
          <p className="text-xs font-medium text-amber-900">{voce.titolo}</p>
          <p className="whitespace-pre-wrap text-sm text-amber-950">
            {voce.testo}
          </p>
        </div>
      ))}
    </div>
  );
}
