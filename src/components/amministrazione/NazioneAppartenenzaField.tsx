"use client";

import { useEffect, useState } from "react";
import {
  listNazioniIndirizzoAction,
  type NazioneIndirizzo,
} from "@/app/actions/nazioni-indirizzo";

type Props = {
  value: string;
  onChange: (nome: string) => void;
};

export function NazioneAppartenenzaField({ value, onChange }: Props) {
  const [nazioni, setNazioni] = useState<NazioneIndirizzo[]>([]);
  const corrente = value.trim() || "Italia";

  useEffect(() => {
    let attivo = true;
    void listNazioniIndirizzoAction().then((res) => {
      if (attivo && res.success) setNazioni(res.nazioni);
    });
    return () => {
      attivo = false;
    };
  }, []);

  const presente = nazioni.some((nazione) => nazione.nome === corrente);

  return (
    <label className="block text-sm sm:col-span-2">
      <span className="mb-1 block font-medium">Nazione di appartenenza</span>
      <select
        value={corrente}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
      >
        {!presente ? <option value={corrente}>{corrente}</option> : null}
        {nazioni.map((nazione) => (
          <option key={nazione.iso2} value={nazione.nome}>
            {nazione.nome}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-[var(--muted)]">
        Partita IVA e codice fiscale seguono le regole di questo Paese.
      </span>
    </label>
  );
}
