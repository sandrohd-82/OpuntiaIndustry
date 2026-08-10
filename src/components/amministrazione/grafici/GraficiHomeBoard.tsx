"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGraficiHomeAnnoAction } from "@/app/actions/grafici";
import { GraficiPeriodoFilters } from "@/components/amministrazione/grafici/GraficiPeriodoFilters";
import { MiniBarChart } from "@/components/amministrazione/grafici/MiniBarChart";
import {
  currentAnno,
  emptySerieAnno,
  formatEuro,
  formatQty,
  MESI_IT,
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
  loading?: boolean;
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
  loading,
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
        {loading ? "…" : kpiValue}
      </p>
      <div className={`mt-3 ${loading ? "opacity-60" : ""}`}>
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
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [ordini, setOrdini] = useState<GraficiKpi>(() =>
    emptySerieAnno(currentAnno())
  );
  const [incassi, setIncassi] = useState<GraficiKpi>(() =>
    emptySerieAnno(currentAnno())
  );
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await getGraficiHomeAnnoAction({ anno, mese });
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        setOrdini(emptySerieAnno(anno));
        setIncassi(emptySerieAnno(anno));
      } else {
        setOrdini(result.ordini);
        setIncassi(result.incassi);
        setError(null);
      }
      setReady(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [anno, mese]);

  const emptyProd = emptySerieAnno(anno);
  const periodoLabel = mese
    ? `${MESI_IT[mese - 1]} ${anno}`
    : `Anno ${anno}`;
  const kpiSuffix = mese ? "mese" : "anno";

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Caricamento panoramica grafici…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Panoramica per{" "}
        <span className="font-semibold text-slate-800">{periodoLabel}</span>.
        Cambia anno o mese per aggiornare subito i grafici. Ordini e Incassi
        usano il database; Produttività e Materia prima restano vuoti finché non
        c’è registrazione produzione / ingresso MP (ISO 9001).
      </p>

      <GraficiPeriodoFilters
        anno={anno}
        mese={mese}
        onAnnoChange={setAnno}
        onMeseChange={setMese}
      />

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
          kpiLabel={`Totale ${kpiSuffix}`}
          kpiValue="—"
          serie={emptyProd.serie}
          emptyLabel="Nessun dato di produzione finita registrato"
          muted
          loading={loading}
        />
        <GraficiCard
          title="Ordini"
          description="Quantità ordinata (righe prodotto)"
          href="/app/amministrazione/grafici/ordini"
          kpiLabel={`Quantità totale ${kpiSuffix}`}
          kpiValue={formatQty(ordini.totale)}
          serie={ordini.serie}
          emptyLabel="Nessuna quantità ordinata nel periodo"
          valueFormatter={formatQty}
          loading={loading}
        />
        <GraficiCard
          title="Materia prima"
          description="Ingressi materia prima"
          href="/app/amministrazione/grafici/materia-prima"
          kpiLabel={`Totale ${kpiSuffix}`}
          kpiValue="—"
          serie={emptyProd.serie}
          emptyLabel="Nessun ingresso materia prima registrato"
          muted
          loading={loading}
        />
        <GraficiCard
          title="Incassi"
          description="Ordini pagati"
          href="/app/amministrazione/grafici/incassi"
          kpiLabel={`Incassato ${kpiSuffix}`}
          kpiValue={formatEuro(incassi.totale)}
          serie={incassi.serie}
          emptyLabel="Nessun ordine pagato nel periodo"
          valueFormatter={formatEuro}
          loading={loading}
        />
      </div>
    </div>
  );
}
