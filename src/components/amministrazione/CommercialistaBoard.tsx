"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCommercialistaSummaryAction,
  type CommercialistaSummaryResult,
} from "@/app/actions/commercialista";
import type { CommercialistaSummary } from "@/lib/amministrazione/commercialista";
import { formatEuro } from "@/lib/amministrazione/fatture";
import {
  labelTrimestre,
  type TrimestreNumero,
} from "@/lib/amministrazione/trimestre-commerciale";

const TRIMESTRI: TrimestreNumero[] = [1, 2, 3, 4];

function ColonnaRiepilogo({
  titolo,
  totale,
  vocePrimariaLabel,
  vocePrimaria,
  beni,
  conteggio,
}: {
  titolo: string;
  totale: number;
  vocePrimariaLabel: string;
  vocePrimaria: number;
  beni: number;
  conteggio: number;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
        {titolo}
      </h2>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
        {formatEuro(totale)}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {conteggio} document{conteggio === 1 ? "o" : "i"}
      </p>
      <ul className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-slate-700">{vocePrimariaLabel}</span>
          <span className="text-sm font-medium tabular-nums text-slate-900">
            {formatEuro(vocePrimaria)}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-slate-700">Beni ammortizzabili</span>
          <span className="text-sm font-medium tabular-nums text-slate-900">
            {formatEuro(beni)}
          </span>
        </li>
      </ul>
    </section>
  );
}

export function CommercialistaBoard() {
  const now = useMemo(() => new Date(), []);
  const defaultTrim = (Math.floor(now.getMonth() / 3) + 1) as TrimestreNumero;
  const [anno, setAnno] = useState(now.getFullYear());
  const [trimestre, setTrimestre] = useState<TrimestreNumero>(defaultTrim);
  const [data, setData] = useState<CommercialistaSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setReady(false);
    setError(null);
    const res: CommercialistaSummaryResult =
      await getCommercialistaSummaryAction({ anno, trimestre });
    if (!res.success) {
      setError(res.error);
      setData(null);
      setReady(true);
      return;
    }
    setData(res.data);
    setReady(true);
  }, [anno, trimestre]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Riepilogo trimestrale per il commercialista. I totali documento sono
          la somma delle fatture; le sottovoci sommano gli importi riga
          (prodotti / materiale vs beni ammortizzabili).
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Anno
            </span>
            <input
              type="number"
              value={anno}
              onChange={(e) => setAnno(Number(e.target.value) || anno)}
              className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Trimestre
            </span>
            <select
              value={trimestre}
              onChange={(e) =>
                setTrimestre(Number(e.target.value) as TrimestreNumero)
              }
              className="min-w-[140px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              {TRIMESTRI.map((t) => (
                <option key={t} value={t}>
                  {labelTrimestre(anno, t)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ColonnaRiepilogo
            titolo="Fatture emesse"
            totale={data.emesse.totaleDocumenti}
            vocePrimariaLabel="Prodotti venduti"
            vocePrimaria={data.emesse.vocePrimaria}
            beni={data.emesse.beniAmmortizzabili}
            conteggio={data.emesse.conteggioDocumenti}
          />
          <ColonnaRiepilogo
            titolo="Fatture ricevute"
            totale={data.ricevute.totaleDocumenti}
            vocePrimariaLabel="Materiale di consumo"
            vocePrimaria={data.ricevute.vocePrimaria}
            beni={data.ricevute.beniAmmortizzabili}
            conteggio={data.ricevute.conteggioDocumenti}
          />
        </div>
      ) : null}
    </div>
  );
}
