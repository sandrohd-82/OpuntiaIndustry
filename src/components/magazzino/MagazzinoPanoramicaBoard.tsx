"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMagazzinoPanoramicaAction } from "@/app/actions/magazzino";
import { WorkcenterCameraBar } from "@/components/produzione/WorkcenterCameraBar";
import type {
  MagazzinoPanoramica,
  MagazzinoPanoramicaSezione,
} from "@/lib/magazzino/types";

function CardLink({
  href,
  title,
  sezione,
  extra,
}: {
  href: string;
  title: string;
  sezione: MagazzinoPanoramicaSezione;
  extra?: string;
}) {
  const alert = sezione.sottoSoglia + sezione.inSoglia;
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-slate-50"
    >
      <p className="text-xs uppercase text-[var(--muted)]">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{sezione.articoli}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {sezione.conGiacenza} con giacenza
        {extra ? ` · ${extra}` : ""}
      </p>
      {alert > 0 ? (
        <p className="mt-1 text-xs text-amber-800">
          {sezione.sottoSoglia} sotto soglia
          {sezione.inSoglia ? ` · ${sezione.inSoglia} in soglia` : ""}
        </p>
      ) : null}
    </Link>
  );
}

export function MagazzinoPanoramicaBoard() {
  const [data, setData] = useState<MagazzinoPanoramica | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMagazzinoPanoramicaAction().then((res) => {
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setData(res.data);
    });
  }, []);

  return (
    <div className="space-y-5">
      <WorkcenterCameraBar
        targetKind="area"
        areaCodice="magazzino"
        liveLabel="Guarda Live Magazzino"
      />

      <p className="text-sm text-[var(--muted)]">
        Riassunto di materie prime, prodotti di consumo, Agrinsicilia e note di
        acquisto. La telecamera dell’area è disponibile solo in questa pagina.
      </p>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!data && !error ? (
        <p className="text-sm text-[var(--muted)]">Caricamento riassunto…</p>
      ) : null}

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CardLink
            href="/app/magazzino/materia-prima/stato"
            title="Materia prima"
            sezione={data.materiaPrima}
          />
          <CardLink
            href="/app/magazzino/prodotti-di-consumo/elenco"
            title="Prodotti di consumo"
            sezione={data.prodottiConsumo}
          />
          <CardLink
            href="/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita"
            title="Prodotti Agrinsicilia"
            sezione={data.agrinsicilia}
          />
          <Link
            href="/app/magazzino/note-di-acquisto/aperte"
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-slate-50"
          >
            <p className="text-xs uppercase text-[var(--muted)]">
              Note di acquisto
            </p>
            <p className="mt-1 text-2xl font-semibold">{data.noteAperte}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Aperte o in bozza
            </p>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
