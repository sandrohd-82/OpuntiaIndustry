"use client";

import { useEffect, useState } from "react";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { GraficiPeriodoFilters } from "@/components/amministrazione/grafici/GraficiPeriodoFilters";
import { MiniBarChart } from "@/components/amministrazione/grafici/MiniBarChart";
import {
  currentAnno,
  emptySerieAnno,
} from "@/lib/amministrazione/grafici";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

export function GraficiProduttivitaBoard() {
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [prodottoId, setProdottoId] = useState<string | null>(null);
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);

  useEffect(() => {
    void listProdottiPropriAction().then((r) => {
      if (r.success) setProdotti(r.prodotti);
    });
  }, []);

  const serie = emptySerieAnno(anno).serie;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Qui comparirà la quantità di <strong>prodotto finito</strong> generata,
        filtrabile per prodotto proprio. I dati arriveranno quando la
        produzione sarà registrata su database (ISO 9001: niente stime inventate).
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

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Totale prodotto finito
        </p>
        <p className="text-2xl font-semibold tabular-nums text-[var(--muted)]">
          —
        </p>
        <div className="mt-4">
          <MiniBarChart
            serie={serie}
            height={220}
            emptyLabel="Nessun dato di produzione finita registrato"
          />
        </div>
      </div>
    </div>
  );
}
