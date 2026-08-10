"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGraficiHomeAnnoAction } from "@/app/actions/grafici";
import { MiniBarChart } from "@/components/amministrazione/grafici/MiniBarChart";
import {
  currentAnno,
  emptySerieAnno,
  formatEuro,
  formatQty,
  type GraficiKpi,
} from "@/lib/amministrazione/grafici";

type CardProps = {
  title: string;
  description: string;
  href: string;
  kpiLabel: string;
  kpiValue: string;
  serie: GraficiKpi["serie"];
  emptyLabel: string;
  valueFormatter?: (n: number) => string;
  muted?: boolean;
};

function GraficiCard({
  title,
  description,
  href,
  kpiLabel,
  kpiValue,
  serie,
  emptyLabel,
  valueFormatter,
  muted,
}: CardProps) {
  return (
    <section className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
        </div>
        <Link
          href={href}
          className="text-xs font-medium text-[var(--primary)] hover:underline"
        >
          Apri sezione
        </Link>
      </div>
      <p className="mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">
        {kpiLabel}
      </p>
      <p
        className={`text-2xl font-semibold tabular-nums ${muted ? "text-[var(--muted)]" : "text-slate-900"}`}
      >
        {kpiValue}
      </p>
      <div className="mt-3">
        <MiniBarChart
          serie={serie}
          emptyLabel={emptyLabel}
          valueFormatter={valueFormatter}
        />
      </div>
    </section>
  );
}

export function GraficiHomeBoard() {
  const anno = currentAnno();
  const [ordini, setOrdini] = useState<GraficiKpi>(() => emptySerieAnno(anno));
  const [incassi, setIncassi] = useState<GraficiKpi>(() => emptySerieAnno(anno));
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getGraficiHomeAnnoAction(anno);
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
      } else {
        setOrdini(result.ordini);
        setIncassi(result.incassi);
        setError(null);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [anno]);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Caricamento panoramica grafici {anno}…
      </p>
    );
  }

  const emptyProd = emptySerieAnno(anno);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Panoramica anno <span className="font-semibold text-slate-800">{anno}</span>
        . I dati di Ordini e Incassi arrivano dal database; Produttività e Materia
        prima resteranno vuoti finché non sarà registrata la produzione /
        l’ingresso MP (ISO 9001: solo dati tracciati).
      </p>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <GraficiCard
          title="Produttività"
          description="Prodotto finito generato"
          href="/app/amministrazione/grafici/produttivita"
          kpiLabel="Totale anno"
          kpiValue="—"
          serie={emptyProd.serie}
          emptyLabel="Nessun dato di produzione finita registrato"
          muted
        />
        <GraficiCard
          title="Ordini"
          description="Quantità ordinata (righe prodotto)"
          href="/app/amministrazione/grafici/ordini"
          kpiLabel="Quantità totale anno"
          kpiValue={formatQty(ordini.totale)}
          serie={ordini.serie}
          emptyLabel="Nessuna quantità ordinata nell’anno"
          valueFormatter={formatQty}
        />
        <GraficiCard
          title="Materia prima"
          description="Ingressi materia prima"
          href="/app/amministrazione/grafici/materia-prima"
          kpiLabel="Totale anno"
          kpiValue="—"
          serie={emptyProd.serie}
          emptyLabel="Nessun ingresso materia prima registrato"
          muted
        />
        <GraficiCard
          title="Incassi"
          description="Ordini pagati"
          href="/app/amministrazione/grafici/incassi"
          kpiLabel="Incassato anno"
          kpiValue={formatEuro(incassi.totale)}
          serie={incassi.serie}
          emptyLabel="Nessun ordine pagato nell’anno"
          valueFormatter={formatEuro}
        />
      </div>
    </div>
  );
}
