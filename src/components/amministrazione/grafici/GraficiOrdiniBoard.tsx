"use client";

import { useEffect, useState } from "react";
import { getGraficiOrdiniQtyAction } from "@/app/actions/grafici";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { GraficiPeriodoFilters } from "@/components/amministrazione/grafici/GraficiPeriodoFilters";
import { MiniBarChart } from "@/components/amministrazione/grafici/MiniBarChart";
import {
  currentAnno,
  emptySerieAnno,
  formatQty,
  type GraficiKpi,
} from "@/lib/amministrazione/grafici";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

export function GraficiOrdiniBoard() {
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [prodottoId, setProdottoId] = useState<string | null>(null);
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [kpi, setKpi] = useState<GraficiKpi>(() => emptySerieAnno(currentAnno()));
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void listProdottiPropriAction().then((r) => {
      if (r.success) setProdotti(r.prodotti);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setReady(false);
      const result = await getGraficiOrdiniQtyAction({
        anno,
        mese,
        prodottoId,
      });
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        setKpi(emptySerieAnno(anno));
      } else {
        setError(null);
        setKpi(result.data);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [anno, mese, prodottoId]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Quantità ordinata = somma delle quantità nelle righe prodotto (non il
        conteggio degli ordini).
      </p>

      <GraficiPeriodoFilters
        anno={anno}
        mese={mese}
        onAnnoChange={setAnno}
        onMeseChange={setMese}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Prodotto proprio</span>
          <select
            value={prodottoId ?? ""}
            onChange={(e) => setProdottoId(e.target.value || null)}
            className="min-w-[220px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="">Tutti i prodotti</option>
            {prodotti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codice} — {p.nome}
              </option>
            ))}
          </select>
        </label>
      </GraficiPeriodoFilters>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Totale quantità
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {ready ? formatQty(kpi.totale) : "…"}
        </p>
        <div className="mt-4">
          <MiniBarChart
            serie={kpi.serie}
            height={220}
            emptyLabel="Nessuna quantità ordinata nel periodo"
            valueFormatter={formatQty}
          />
        </div>
      </div>
    </div>
  );
}
