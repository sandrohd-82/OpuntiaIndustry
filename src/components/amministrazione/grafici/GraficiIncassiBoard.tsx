"use client";

import { useEffect, useState } from "react";
import { listClientiAction } from "@/app/actions/clienti";
import { getGraficiIncassiAction } from "@/app/actions/grafici";
import { GraficiPeriodoFilters } from "@/components/amministrazione/grafici/GraficiPeriodoFilters";
import { MiniBarChart } from "@/components/amministrazione/grafici/MiniBarChart";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  currentAnno,
  emptySerieAnno,
  formatEuro,
  type GraficiKpi,
} from "@/lib/amministrazione/grafici";

export function GraficiIncassiBoard() {
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [kpi, setKpi] = useState<GraficiKpi>(() => emptySerieAnno(currentAnno()));
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void listClientiAction().then((r) => {
      if (r.success) setClienti(r.clienti);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setReady(false);
      const result = await getGraficiIncassiAction({
        anno,
        mese,
        clienteId,
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
  }, [anno, mese, clienteId]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Solo ordini con flag <strong>Pagato = Sì</strong>. Importo = totale
        ordine (€).
      </p>

      <GraficiPeriodoFilters
        anno={anno}
        mese={mese}
        onAnnoChange={setAnno}
        onMeseChange={setMese}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Azienda (cliente)</span>
          <select
            value={clienteId ?? ""}
            onChange={(e) => setClienteId(e.target.value || null)}
            className="min-w-[240px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="">Tutte le aziende</option>
            {clienti.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codiceTarga} — {c.ragioneSociale}
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
          Totale incassato
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {ready ? formatEuro(kpi.totale) : "…"}
        </p>
        <div className="mt-4">
          <MiniBarChart
            serie={kpi.serie}
            height={220}
            emptyLabel="Nessun ordine pagato nel periodo"
            valueFormatter={formatEuro}
          />
        </div>
      </div>
    </div>
  );
}
