"use client";

import { useEffect, useMemo, useState } from "react";
import { listClientiAction } from "@/app/actions/clienti";
import {
  getGraficiIncassiDettaglioAction,
  getGraficiIncassiMultiAnnoAction,
} from "@/app/actions/grafici";
import { CompanyLineChart } from "@/components/amministrazione/grafici/CompanyLineChart";
import { GraficiPeriodoFilters } from "@/components/amministrazione/grafici/GraficiPeriodoFilters";
import { IncassiAziendeTable } from "@/components/amministrazione/grafici/IncassiAziendeTable";
import { MultiYearLineChart } from "@/components/amministrazione/grafici/MultiYearLineChart";
import { PieChartProdotti } from "@/components/amministrazione/grafici/PieChartProdotti";
import { StackedBarChart } from "@/components/amministrazione/grafici/StackedBarChart";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  currentAnno,
  emptySerieAnno,
  formatEuro,
  isInteraVita,
  labelAndamento,
  MESI_IT,
  type GraficiAndamento,
  type GraficiFonteIncassi,
  type GraficiIncassiDettaglio,
  type GraficiKpi,
  type GraficiMultiAnno,
} from "@/lib/amministrazione/grafici";

function badgeClass(a: GraficiAndamento): string {
  if (a === "crescita") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (a === "calo") return "bg-rose-50 text-rose-800 border-rose-200";
  if (a === "stabile") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function emptyDettaglio(anno: number): GraficiIncassiDettaglio {
  const vita = isInteraVita(anno);
  return {
    anno,
    granularita: vita ? "anno" : "mese",
    totale: 0,
    aziende: [],
    mesi: vita
      ? []
      : emptySerieAnno(anno).serie.map((s) => ({
          mese: s.mese,
          label: s.label,
          totale: 0,
          perAzienda: [],
        })),
    andamentoAziende: [],
    periodiLabels: vita ? [] : [...MESI_IT],
    prodotti: [],
  };
}

export function GraficiIncassiBoard() {
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [fonte, setFonte] = useState<GraficiFonteIncassi>("fatture");
  const [anniConfronto, setAnniConfronto] = useState<number[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [dettaglio, setDettaglio] = useState<GraficiIncassiDettaglio>(() =>
    emptyDettaglio(currentAnno())
  );
  const [multi, setMulti] = useState<GraficiMultiAnno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const multiMode = anniConfronto.length > 0 && !isInteraVita(anno);

  useEffect(() => {
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
      const dettaglioP = getGraficiIncassiDettaglioAction({
        anno,
        mese,
        clienteId,
        fonte,
      });

      if (multiMode) {
        const [detR, multiR] = await Promise.all([
          dettaglioP,
          getGraficiIncassiMultiAnnoAction({
            anno,
            mese,
            clienteId,
            fonte,
            anniConfronto: [anno, ...anniConfronto],
          }),
        ]);
        if (cancelled) return;
        if (!detR.success) {
          setError(detR.error);
          setDettaglio(emptyDettaglio(anno));
        } else {
          setDettaglio(detR.data);
          setError(null);
        }
        if (!multiR.success) {
          setMulti(null);
          if (detR.success) setError(multiR.error);
        } else {
          setMulti(multiR.data);
        }
      } else {
        const detR = await dettaglioP;
        if (cancelled) return;
        if (!detR.success) {
          setError(detR.error);
          setDettaglio(emptyDettaglio(anno));
          setMulti(null);
        } else {
          setError(null);
          setDettaglio(detR.data);
          setMulti(null);
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [anno, mese, clienteId, fonte, multiMode, anniConfronto]);

  const clienteLabel = useMemo(() => {
    if (!clienteId) return "Tutte le aziende";
    const c = clienti.find((x) => x.id === clienteId);
    return c ? `${c.codiceTarga} — ${c.ragioneSociale}` : "Azienda selezionata";
  }, [clienteId, clienti]);

  const fonteLabel =
    fonte === "fatture"
      ? "fatture emesse"
      : fonte === "ordini"
        ? "ordini pagati"
        : "fatture + ordini pagati";

  const kpiTotale = dettaglio.totale;
  const serieMulti: GraficiKpi[] = multi?.seriePerAnno ?? [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Incassi da <strong>{fonteLabel}</strong>. Barre stacked per azienda
        (importo in cima), tabella mensile, torta prodotti e andamento a linee.
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
          <span className="mb-1 block font-medium">Fonte dati</span>
          <select
            value={fonte}
            onChange={(e) => setFonte(e.target.value as GraficiFonteIncassi)}
            className="min-w-[200px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="fatture">Fatture emesse</option>
            <option value="ordini">Solo ordini pagati</option>
            <option value="entrambi">Fatture + ordini pagati</option>
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
              Totale · {clienteLabel}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {ready ? formatEuro(kpiTotale) : "…"}
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
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            {dettaglio.granularita === "anno"
              ? "Incassi annuali per azienda"
              : "Incassi mensili per azienda"}
          </h3>
          <StackedBarChart
            mesi={dettaglio.mesi}
            aziende={dettaglio.aziende}
            height={300}
            emptyLabel="Nessuna fattura / incasso nel periodo"
            valueFormatter={formatEuro}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          {dettaglio.granularita === "anno"
            ? "Dettaglio per azienda e anno"
            : "Dettaglio per azienda e mese"}
        </h3>
        <IncassiAziendeTable
          aziende={dettaglio.aziende}
          mesi={dettaglio.mesi}
          granularita={dettaglio.granularita}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Prodotti venduti
          </h3>
          <PieChartProdotti prodotti={dettaglio.prodotti} />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Andamento aziende (slideshow)
          </h3>
          <CompanyLineChart
            series={dettaglio.andamentoAziende}
            periodLabels={dettaglio.periodiLabels}
            granularita={dettaglio.granularita}
            height={260}
            emptyLabel="Nessun andamento nel periodo"
            secondsPerCompany={5}
          />
        </div>
      </div>

      {multiMode && multi ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Confronto anni
          </h3>
          <MultiYearLineChart
            seriePerAnno={serieMulti}
            height={280}
            emptyLabel="Nessun incasso nel confronto anni"
            valueFormatter={formatEuro}
          />
        </div>
      ) : null}
    </div>
  );
}
