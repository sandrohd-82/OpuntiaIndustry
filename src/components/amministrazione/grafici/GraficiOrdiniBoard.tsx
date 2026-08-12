"use client";

import { useEffect, useMemo, useState } from "react";
import { listClientiAction } from "@/app/actions/clienti";
import {
  getGraficiOrdiniQtyAction,
  getGraficiOrdiniQtyMultiAnnoAction,
} from "@/app/actions/grafici";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { GraficiPeriodoFilters } from "@/components/amministrazione/grafici/GraficiPeriodoFilters";
import { MiniBarChart } from "@/components/amministrazione/grafici/MiniBarChart";
import { MultiYearLineChart } from "@/components/amministrazione/grafici/MultiYearLineChart";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  currentAnno,
  emptySerieAnno,
  formatQty,
  isInteraVita,
  labelAndamento,
  type GraficiAndamento,
  type GraficiKpi,
  type GraficiMultiAnno,
} from "@/lib/amministrazione/grafici";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function badgeClass(a: GraficiAndamento): string {
  if (a === "crescita") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (a === "calo") return "bg-rose-50 text-rose-800 border-rose-200";
  if (a === "stabile") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function GraficiOrdiniBoard() {
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [prodottoId, setProdottoId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [anniConfronto, setAnniConfronto] = useState<number[]>([]);
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [kpi, setKpi] = useState<GraficiKpi>(() => emptySerieAnno(currentAnno()));
  const [multi, setMulti] = useState<GraficiMultiAnno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const multiMode = anniConfronto.length > 0 && !isInteraVita(anno);

  useEffect(() => {
    void listProdottiPropriAction().then((r) => {
      if (r.success) setProdotti(r.prodotti);
    });
    void listClientiAction().then((r) => {
      if (r.success) setClienti(r.clienti);
    });
  }, []);

  useEffect(() => {
    setAnniConfronto((prev) => prev.filter((y) => y !== anno));
  }, [anno]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setReady(false);
      if (multiMode) {
        const result = await getGraficiOrdiniQtyMultiAnnoAction({
          anno,
          mese,
          prodottoId,
          clienteId,
          anniConfronto: [anno, ...anniConfronto],
        });
        if (cancelled) return;
        if (!result.success) {
          setError(result.error);
          setMulti(null);
          setKpi(emptySerieAnno(anno));
        } else {
          setError(null);
          setMulti(result.data);
          setKpi(
            result.data.seriePerAnno.find((s) => s.anno === anno) ??
              emptySerieAnno(anno)
          );
        }
      } else {
        const result = await getGraficiOrdiniQtyAction({
          anno,
          mese,
          prodottoId,
          clienteId,
        });
        if (cancelled) return;
        if (!result.success) {
          setError(result.error);
          setKpi(emptySerieAnno(anno));
          setMulti(null);
        } else {
          setError(null);
          setKpi(result.data);
          setMulti(null);
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [anno, mese, prodottoId, clienteId, multiMode, anniConfronto]);

  const clienteLabel = useMemo(() => {
    if (!clienteId) return "Tutte le aziende";
    const c = clienti.find((x) => x.id === clienteId);
    return c ? `${c.codiceTarga} — ${c.ragioneSociale}` : "Azienda selezionata";
  }, [clienteId, clienti]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Quantità ordinata = somma delle quantità nelle righe prodotto. Filtra per
        periodo, azienda e prodotto; confronta più anni sullo stesso grafico.
      </p>

      <GraficiPeriodoFilters
        anno={anno}
        mese={mese}
        onAnnoChange={setAnno}
        onMeseChange={setMese}
        anniConfronto={anniConfronto}
        onAnniConfrontoChange={setAnniConfronto}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Totale quantità · {clienteLabel}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {ready ? formatQty(kpi.totale) : "…"}
            </p>
          </div>
          {multi ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${badgeClass(multi.andamento)}`}
            >
              <p className="font-semibold">{labelAndamento(multi.andamento)}</p>
              <p className="mt-0.5 text-xs opacity-90">{multi.notaAndamento}</p>
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          {multiMode && multi ? (
            <MultiYearLineChart
              seriePerAnno={multi.seriePerAnno}
              height={280}
              emptyLabel="Nessuna quantità ordinata nel periodo"
              valueFormatter={formatQty}
            />
          ) : (
            <MiniBarChart
              serie={kpi.serie}
              height={220}
              emptyLabel="Nessuna quantità ordinata nel periodo"
              valueFormatter={formatQty}
            />
          )}
        </div>
      </div>
    </div>
  );
}
