"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { WorkcenterCameraBar } from "@/components/produzione/WorkcenterCameraBar";
import type { ProduzioneArea, ProduzionePostoLavoro } from "@/lib/produzione/aree-posti";

type Props = {
  areaCodice: string;
  postoCodice: string;
};

export function PostoLavoroBoard({ areaCodice, postoCodice }: Props) {
  const [pending, start] = useTransition();
  const [area, setArea] = useState<ProduzioneArea | null>(null);
  const [posto, setPosto] = useState<ProduzionePostoLavoro | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      const a = res.items.find((x) => x.codice === areaCodice) ?? null;
      setArea(a);
      setPosto(a?.posti.find((p) => p.codice === postoCodice) ?? null);
    });
  }, [areaCodice, postoCodice]);

  if (pending && !area) {
    return <p className="text-sm text-[var(--muted)]">Caricamento posto…</p>;
  }
  if (error || !area || !posto) {
    return (
      <p className="text-sm text-red-700">
        {error ?? "Posto lavoro non trovato."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <WorkcenterCameraBar
        targetKind="posto"
        areaCodice={area.codice}
        postoCodice={posto.codice}
      />
      <p className="text-sm text-[var(--muted)]">
        Postazione in area <strong>{area.nome}</strong>. L’operatore esegue{" "}
        <strong>{posto.nome}</strong>
        {posto.descrizione ? ` (${posto.descrizione})` : ""}. Gli altri posti
        dell’area svolgono operazioni diverse sullo stesso lotto.
      </p>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-xs uppercase text-[var(--muted)]">Codice</p>
        <p className="font-mono text-sm">{posto.codice}</p>
        <p className="mt-3 text-xs uppercase text-[var(--muted)]">Area</p>
        <p className="text-sm">{area.nome}</p>
        <p className="mt-3 text-xs uppercase text-[var(--muted)]">
          Posti collegati
        </p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {area.posti.map((p) => (
            <li key={p.id}>
              <Link
                href={`/app/produzione/gestione-aree/${area.codice}/postazioni/${p.codice}`}
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  p.id === posto.id
                    ? "bg-[var(--primary)] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {p.nome}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Link
        href={`/app/produzione/gestione-aree/${area.codice}/postazioni`}
        className="text-sm font-medium text-[var(--primary)] hover:underline"
      >
        Torna alla panoramica {area.nome}
      </Link>
    </div>
  );
}
