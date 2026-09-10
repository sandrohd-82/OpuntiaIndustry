"use client";

import { useEffect, useMemo, useState } from "react";
import { listClientiAction } from "@/app/actions/clienti";
import {
  getGraficiProvvigioniDettaglioAction,
  getGraficiProvvigioniMultiAnnoAction,
  listCommercialiProvvigioniFiltroAction,
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
  type GraficiKpi,
  type GraficiProvvigioniDettaglio,
} from "@/lib/amministrazione/grafici";
import { formatProvvigionePct } from "@/lib/auth/commerciale";

function badgeClass(a: GraficiAndamento): string {
  if (a === "crescita") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (a === "calo") return "bg-rose-50 text-rose-800 border-rose-200";
  if (a === "stabile") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function emptyDettaglio(anno: number): GraficiProvvigioniDettaglio {
  const vita = isInteraVita(anno);
  return {
    anno,
    granularita: vita ? "anno" : "mese",
    totale: 0,
    totaleProvvigione: 0,
    aziende: [],
    mesi: vita
      ? []
      : emptySerieAnno(anno).serie.map((s) => ({
          mese: s.mese,
          label: s.label,
          totale: 0,
          perAzienda: [],
        })),
    mesiProvvigione: [],
    andamentoAziende: [],
    andamentoProvvigioni: [],
    periodiLabels: vita ? [] : [...MESI_IT],
    prodotti: [],
    percentualePerAzienda: {},
  };
}

export function GraficiProvvigioniBoard() {
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [commercialeId, setCommercialeId] = useState<string | null>(null);
  const [anniConfronto, setAnniConfronto] = useState<number[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [canFilterComm, setCanFilterComm] = useState(false);
  const [commerciali, setCommerciali] = useState<
    Array<{ id: string; nome: string; percentuale: number | null }>
  >([]);
  const [dettaglio, setDettaglio] = useState<GraficiProvvigioniDettaglio>(() =>
    emptyDettaglio(currentAnno())
  );
  const [multiInc, setMultiInc] = useState<GraficiKpi[] | null>(null);
  const [multiProv, setMultiProv] = useState<GraficiKpi[] | null>(null);
  const [andamentoInc, setAndamentoInc] = useState<GraficiAndamento>("n/d");
  const [notaInc, setNotaInc] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const multiMode = anniConfronto.length > 0 && !isInteraVita(anno);

  useEffect(() => {
    void listClientiAction().then((r) => {
      if (r.success) {
        setClienti(r.clienti.filter((c) => c.commercialeId));
      }
    });
    void listCommercialiProvvigioniFiltroAction().then((r) => {
      if (r.success) {
        setCanFilterComm(r.canFilter);
        setCommerciali(r.commerciali);
      }
    });
  }, []);

  useEffect(() => {
    setAnniConfronto((prev) => prev.filter((y) => y !== anno));
  }, [anno]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setReady(false);
      const dettaglioP = getGraficiProvvigioniDettaglioAction({
        anno,
        mese,
        clienteId,
        commercialeId,
      });
      if (multiMode) {
        const [detR, multiR] = await Promise.all([
          dettaglioP,
          getGraficiProvvigioniMultiAnnoAction({
            anno,
            mese,
            clienteId,
            commercialeId,
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
          setMultiInc(null);
          setMultiProv(null);
          if (detR.success) setError(multiR.error);
        } else {
          setMultiInc(multiR.data.incassi.seriePerAnno);
          setMultiProv(multiR.data.provvigioni.seriePerAnno);
          setAndamentoInc(multiR.data.incassi.andamento);
          setNotaInc(multiR.data.incassi.notaAndamento);
        }
      } else {
        const detR = await dettaglioP;
        if (cancelled) return;
        if (!detR.success) {
          setError(detR.error);
          setDettaglio(emptyDettaglio(anno));
          setMultiInc(null);
          setMultiProv(null);
        } else {
          setError(null);
          setDettaglio(detR.data);
          setMultiInc(null);
          setMultiProv(null);
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [anno, mese, clienteId, commercialeId, multiMode, anniConfronto]);

  const clienteLabel = useMemo(() => {
    if (!clienteId) return "Aziende collegate";
    const c = clienti.find((x) => x.id === clienteId);
    return c ? `${c.codiceTarga} — ${c.ragioneSociale}` : "Azienda selezionata";
  }, [clienteId, clienti]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Incasso delle fatture emesse delle aziende <strong>collegate</strong> al
        commerciale, e provvigione calcolata con la % attuale della scheda su
        tutto lo storico del periodo (anno/mese). Lo scope «da oggi» delle
        altre statistiche non taglia le provvigioni.
      </p>

      <GraficiPeriodoFilters
        anno={anno}
        mese={mese}
        onAnnoChange={setAnno}
        onMeseChange={setMese}
        anniConfronto={anniConfronto}
        onAnniConfrontoChange={setAnniConfronto}
      >
        {canFilterComm ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Commerciale</span>
            <select
              value={commercialeId ?? ""}
              onChange={(e) => setCommercialeId(e.target.value || null)}
              className="min-w-[240px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="">Tutti i commerciali</option>
              {commerciali.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.percentuale != null
                    ? ` · ${formatProvvigionePct(c.percentuale)}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Azienda (cliente)</span>
          <select
            value={clienteId ?? ""}
            onChange={(e) => setClienteId(e.target.value || null)}
            className="min-w-[240px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="">Tutte le aziende collegate</option>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Incasso · {clienteLabel}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {ready ? formatEuro(dettaglio.totale) : "…"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Provvigioni
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {ready ? formatEuro(dettaglio.totaleProvvigione) : "…"}
              </p>
            </div>
            {multiMode && multiInc ? (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${badgeClass(andamentoInc)}`}
              >
                <p className="font-semibold">{labelAndamento(andamentoInc)}</p>
                <p className="mt-0.5 text-xs opacity-90">{notaInc}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">
          {dettaglio.granularita === "anno"
            ? "Incassi annuali per azienda"
            : "Incassi mensili per azienda"}
        </h3>
        <StackedBarChart
          mesi={dettaglio.mesi}
          aziende={dettaglio.aziende}
          height={280}
          emptyLabel="Nessun incasso nel periodo"
          valueFormatter={formatEuro}
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">
          {dettaglio.granularita === "anno"
            ? "Provvigioni annuali per azienda"
            : "Provvigioni mensili per azienda"}
        </h3>
        <StackedBarChart
          mesi={dettaglio.mesiProvvigione}
          aziende={dettaglio.aziende}
          height={280}
          emptyLabel="Nessuna provvigione nel periodo"
          valueFormatter={formatEuro}
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Dettaglio incassi
        </h3>
        <IncassiAziendeTable
          aziende={dettaglio.aziende}
          mesi={dettaglio.mesi}
          granularita={dettaglio.granularita}
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Dettaglio provvigioni
        </h3>
        {dettaglio.aziende.length > 0 ? (
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            {dettaglio.aziende.map((az) => (
              <li key={az.id}>
                {az.label}:{" "}
                {formatProvvigionePct(dettaglio.percentualePerAzienda[az.id])}
              </li>
            ))}
          </ul>
        ) : null}
        <IncassiAziendeTable
          aziende={dettaglio.aziende}
          mesi={dettaglio.mesiProvvigione}
          granularita={dettaglio.granularita}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Prodotti venduti (incasso)
          </h3>
          <PieChartProdotti prodotti={dettaglio.prodotti} />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Andamento provvigioni
          </h3>
          <CompanyLineChart
            series={dettaglio.andamentoProvvigioni}
            periodLabels={dettaglio.periodiLabels}
            granularita={dettaglio.granularita}
            height={260}
            emptyLabel="Nessuna provvigione nel periodo"
            secondsPerCompany={5}
          />
        </div>
      </div>

      {multiMode && multiInc && multiProv ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              Confronto anni · incassi
            </h3>
            <MultiYearLineChart
              seriePerAnno={multiInc}
              height={260}
              emptyLabel="Nessun incasso nel confronto anni"
              valueFormatter={formatEuro}
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              Confronto anni · provvigioni
            </h3>
            <MultiYearLineChart
              seriePerAnno={multiProv}
              height={260}
              emptyLabel="Nessuna provvigione nel confronto anni"
              valueFormatter={formatEuro}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
