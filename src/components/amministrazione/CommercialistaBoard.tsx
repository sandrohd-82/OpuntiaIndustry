"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCommercialistaSummaryAction,
  type CommercialistaSummaryResult,
} from "@/app/actions/commercialista";
import type {
  CommercialistaSummary,
  ImportoConIva,
} from "@/lib/amministrazione/commercialista";
import { formatEuro } from "@/lib/amministrazione/fatture";
import {
  labelTrimestre,
  type TrimestreNumero,
} from "@/lib/amministrazione/trimestre-commerciale";

const TRIMESTRI: TrimestreNumero[] = [1, 2, 3, 4];

function VoceImporti({
  label,
  valori,
}: {
  label: string;
  valori: ImportoConIva;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
          {formatEuro(valori.totale)}
        </p>
      </div>
      <dl className="space-y-1 text-xs text-[var(--muted)]">
        <div className="flex items-baseline justify-between gap-2">
          <dt>Imponibile</dt>
          <dd className="tabular-nums text-slate-700">
            {formatEuro(valori.imponibile)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt>IVA</dt>
          <dd className="tabular-nums text-slate-700">
            {formatEuro(valori.iva)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ColonnaRiepilogo({
  titolo,
  documenti,
  vocePrimariaLabel,
  vocePrimaria,
  beni,
  conteggio,
}: {
  titolo: string;
  documenti: ImportoConIva;
  vocePrimariaLabel: string;
  vocePrimaria: ImportoConIva;
  beni: ImportoConIva;
  conteggio: number;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
        {titolo}
      </h2>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
            {formatEuro(documenti.totale)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {conteggio} document{conteggio === 1 ? "o" : "i"}
          </p>
        </div>
        <dl className="shrink-0 space-y-1 text-right text-xs text-[var(--muted)]">
          <div className="flex items-baseline justify-end gap-3">
            <dt>Imponibile</dt>
            <dd className="min-w-[5.5rem] tabular-nums text-sm text-slate-700">
              {formatEuro(documenti.imponibile)}
            </dd>
          </div>
          <div className="flex items-baseline justify-end gap-3">
            <dt>IVA</dt>
            <dd className="min-w-[5.5rem] tabular-nums text-sm text-slate-700">
              {formatEuro(documenti.iva)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4">
        <VoceImporti label={vocePrimariaLabel} valori={vocePrimaria} />
        <VoceImporti label="Beni ammortizzabili" valori={beni} />
      </div>
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
          Riepilogo trimestrale (regime IVA ordinario{" "}
          {data?.ivaAliquotaDefaultPct ?? 22}%). Per ogni voce: imponibile e
          IVA. I totali documento usano i campi delle fatture; le sottovoci
          ripartiscono gli importi riga.
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
            documenti={data.emesse.documenti}
            vocePrimariaLabel="Prodotti venduti"
            vocePrimaria={data.emesse.vocePrimaria}
            beni={data.emesse.beniAmmortizzabili}
            conteggio={data.emesse.conteggioDocumenti}
          />
          <ColonnaRiepilogo
            titolo="Fatture ricevute"
            documenti={data.ricevute.documenti}
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
