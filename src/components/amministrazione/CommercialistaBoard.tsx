"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import {
  applySequenzaCommercialistaAction,
  getCommercialistaSummaryAction,
  resetTrimestreCommercialistaAction,
  upsertTrimestreCommercialistaAction,
  type CommercialistaSummaryResult,
} from "@/app/actions/commercialista";
import { CommercialistaElaboraFattureModal } from "@/components/amministrazione/CommercialistaElaboraFattureModal";
import { CommercialistaStampaFattureModal } from "@/components/amministrazione/CommercialistaStampaFattureModal";
import type {
  CommercialistaColonnaTotali,
  CommercialistaSummary,
  ImportoConIva,
} from "@/lib/amministrazione/commercialista";
import { formatEuro, formatDateIt } from "@/lib/amministrazione/fatture";
import {
  dateRangeForTrimestre,
  labelTrimestre,
  type TrimestreNumero,
} from "@/lib/amministrazione/trimestre-commerciale";
import type { ElaborazioneContabileKind } from "@/types/database";

const TRIMESTRI: TrimestreNumero[] = [1, 2, 3, 4];

const MATITA_STYLE: CSSProperties = {
  fontFamily: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
  fontWeight: 300,
  color: "#94a3b8",
  WebkitTextStroke: "0.35px #cbd5e1",
  letterSpacing: "0.04em",
};

function NumeroMatita({ n }: { n: number | null }) {
  if (n == null) return null;
  return (
    <span
      className="pointer-events-none absolute right-3 top-2 text-2xl italic leading-none opacity-80 select-none"
      style={MATITA_STYLE}
      title={`Sequenza provvisoria ${n}`}
      aria-hidden
    >
      {n}
    </span>
  );
}

function VoceImporti({
  label,
  valori,
}: {
  label: string;
  valori: ImportoConIva;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-slate-800">{label}</p>
      <p className="text-base font-semibold tabular-nums text-slate-900">
        {formatEuro(valori.totale)}
      </p>
      <dl className="space-y-0.5 text-[11px] text-[var(--muted)]">
        <div className="flex justify-between gap-2">
          <dt>Imponibile</dt>
          <dd className="tabular-nums">{formatEuro(valori.imponibile)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>IVA</dt>
          <dd className="tabular-nums">{formatEuro(valori.iva)}</dd>
        </div>
      </dl>
    </div>
  );
}

function ColonnaCommercialista({
  kind,
  titoloTotale,
  titoloDettaglio,
  vocePrimariaLabel,
  colonna,
  anno,
  trimestre,
  onSequenzaDone,
}: {
  kind: ElaborazioneContabileKind;
  titoloTotale: string;
  titoloDettaglio: string;
  vocePrimariaLabel: string;
  colonna: CommercialistaColonnaTotali;
  anno: number;
  trimestre: TrimestreNumero;
  onSequenzaDone: () => void;
}) {
  const [openResoconto, setOpenResoconto] = useState(false);
  const [openBeni, setOpenBeni] = useState(false);
  const [openDocs, setOpenDocs] = useState(false);
  const [seqMsg, setSeqMsg] = useState<string | null>(null);
  const [seqPending, startSeq] = useTransition();
  const [elaboraOpen, setElaboraOpen] = useState(false);
  const [stampaOpen, setStampaOpen] = useState(false);

  function applySequenza() {
    setSeqMsg(null);
    startSeq(async () => {
      const res = await applySequenzaCommercialistaAction({
        kind,
        anno,
        trimestre,
      });
      if (!res.success) {
        setSeqMsg(res.error);
        return;
      }
      setSeqMsg(
        `Assegnati ${res.assegnati} numeri sequenziali (provvisori).`
      );
      onSequenzaDone();
    });
  }

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {titoloTotale}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
          {formatEuro(colonna.documenti.totale)}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg bg-slate-50 px-2 py-1.5">
            <dt className="text-[var(--muted)]">Fatture</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {colonna.conteggioDocumenti}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-1.5">
            <dt className="text-[var(--muted)]">{vocePrimariaLabel}</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {colonna.conteggioVociPrimarie}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-1.5">
            <dt className="text-[var(--muted)]">Beni amm.</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {colonna.conteggioBeniAmmortizzabili}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          {titoloDettaglio}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <VoceImporti label={vocePrimariaLabel} valori={colonna.vocePrimaria} />
          <VoceImporti
            label="Beni ammortizzabili"
            valori={colonna.beniAmmortizzabili}
          />
        </div>

        <button
          type="button"
          disabled={seqPending || colonna.conteggioDocumenti === 0}
          onClick={applySequenza}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          Aggiungi sequenza numerica alle fatture
        </button>
        {seqMsg ? (
          <p className="text-xs text-slate-600">{seqMsg}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={colonna.conteggioDocumenti === 0}
            onClick={() => setElaboraOpen(true)}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            Elabora fatture
          </button>
          <button
            type="button"
            disabled={colonna.conteggioDocumenti === 0}
            onClick={() => setStampaOpen(true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Stampa fatture
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpenDocs((v) => !v)}
          className="flex w-full items-center gap-2 text-left text-sm font-medium text-slate-800"
        >
          {openDocs ? <FaChevronDown size={11} /> : <FaChevronRight size={11} />}
          Fatture del periodo ({colonna.documentiLista.length})
        </button>
        {openDocs ? (
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {colonna.documentiLista.map((d) => (
              <li
                key={d.id}
                className="relative rounded-lg border border-[var(--border)] bg-white px-3 pb-2 pt-7"
              >
                <NumeroMatita n={d.numeroSequenza} />
                <p className="pr-10 font-mono text-xs font-semibold">
                  {d.numeroInterno}
                </p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {d.anagraficaRagioneSociale}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-slate-700">
                  {formatDateIt(d.dataEmissione)} · {formatEuro(d.totale)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={() => setOpenBeni((v) => !v)}
          className="flex w-full items-center gap-2 text-left text-sm font-medium text-slate-800"
        >
          {openBeni ? <FaChevronDown size={11} /> : <FaChevronRight size={11} />}
          Beni ammortizzabili ({colonna.beniLista.length})
        </button>
        {openBeni ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1.5">Seq.</th>
                  <th className="px-2 py-1.5">Bene</th>
                  <th className="px-2 py-1.5">Fattura</th>
                  <th className="px-2 py-1.5 text-right">Importo</th>
                </tr>
              </thead>
              <tbody>
                {colonna.beniLista.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-3 text-center text-[var(--muted)]"
                    >
                      Nessun bene ammortizzabile nel periodo.
                    </td>
                  </tr>
                ) : (
                  colonna.beniLista.map((b) => (
                    <tr
                      key={b.rigaId}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-2 py-1.5">
                        {b.numeroSequenza != null ? (
                          <span
                            className="text-base italic"
                            style={MATITA_STYLE}
                          >
                            {b.numeroSequenza}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="max-w-[10rem] truncate px-2 py-1.5">
                        {b.descrizione}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px]">
                        {b.numeroInterno}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatEuro(b.importo)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setOpenResoconto((v) => !v)}
          className="flex w-full items-center gap-2 text-left text-sm font-medium text-slate-800"
        >
          {openResoconto ? (
            <FaChevronDown size={11} />
          ) : (
            <FaChevronRight size={11} />
          )}
          Resoconto importi documento
        </button>
        {openResoconto ? (
          <dl className="space-y-1 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs text-[var(--muted)]">
            <div className="flex justify-between gap-2">
              <dt>Imponibile documenti</dt>
              <dd className="tabular-nums text-slate-800">
                {formatEuro(colonna.documenti.imponibile)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>IVA documenti</dt>
              <dd className="tabular-nums text-slate-800">
                {formatEuro(colonna.documenti.iva)}
              </dd>
            </div>
            <div className="flex justify-between gap-2 font-medium text-slate-900">
              <dt>Totale</dt>
              <dd className="tabular-nums">
                {formatEuro(colonna.documenti.totale)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {elaboraOpen ? (
        <CommercialistaElaboraFattureModal
          kind={kind}
          anno={anno}
          trimestre={trimestre}
          onClose={() => setElaboraOpen(false)}
        />
      ) : null}
      {stampaOpen ? (
        <CommercialistaStampaFattureModal
          kind={kind}
          anno={anno}
          trimestre={trimestre}
          onClose={() => setStampaOpen(false)}
        />
      ) : null}
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
  const [dalEdit, setDalEdit] = useState("");
  const [alEdit, setAlEdit] = useState("");
  const [periodoMsg, setPeriodoMsg] = useState<string | null>(null);
  const [savingPeriodo, startSavePeriodo] = useTransition();

  const calendarDefault = useMemo(
    () => dateRangeForTrimestre(anno, trimestre),
    [anno, trimestre]
  );

  const load = useCallback(async () => {
    setReady(false);
    setError(null);
    setPeriodoMsg(null);
    const res: CommercialistaSummaryResult =
      await getCommercialistaSummaryAction({ anno, trimestre });
    if (!res.success) {
      setError(res.error);
      setData(null);
      setReady(true);
      return;
    }
    setData(res.data);
    setDalEdit(res.data.dal);
    setAlEdit(res.data.al);
    setReady(true);
  }, [anno, trimestre]);

  useEffect(() => {
    void load();
  }, [load]);

  function savePeriodo() {
    setPeriodoMsg(null);
    startSavePeriodo(async () => {
      const res = await upsertTrimestreCommercialistaAction({
        anno,
        trimestre,
        dal: dalEdit,
        al: alEdit,
      });
      if (!res.success) {
        setPeriodoMsg(res.error);
        return;
      }
      setPeriodoMsg("Periodo aggiornato.");
      await load();
    });
  }

  function resetPeriodo() {
    setPeriodoMsg(null);
    startSavePeriodo(async () => {
      const res = await resetTrimestreCommercialistaAction({
        anno,
        trimestre,
      });
      if (!res.success) {
        setPeriodoMsg(res.error);
        return;
      }
      setPeriodoMsg("Ripristinate le date di calendario.");
      await load();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Riepilogo trimestrale (IVA ordinario{" "}
          {data?.ivaAliquotaDefaultPct ?? 22}%). Sinistra emesse, destra
          ricevute. Sequenza numerica stile matita sulle fatture del periodo.
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

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Periodo {labelTrimestre(anno, trimestre)}
          {data?.periodoPersonalizzato ? (
            <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-900">
              Personalizzato
            </span>
          ) : (
            <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-[var(--muted)]">
              Calendario
            </span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dalEdit}
            onChange={(e) => setDalEdit(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <span className="text-xs text-[var(--muted)]">→</span>
          <input
            type="date"
            value={alEdit}
            onChange={(e) => setAlEdit(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={savingPeriodo || !dalEdit || !alEdit}
            onClick={savePeriodo}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Salva periodo
          </button>
          <button
            type="button"
            disabled={savingPeriodo || !data?.periodoPersonalizzato}
            onClick={resetPeriodo}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
            title={`Default: ${calendarDefault.dal} → ${calendarDefault.al}`}
          >
            Ripristina calendario
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Default calendario: {formatDateIt(calendarDefault.dal)} –{" "}
          {formatDateIt(calendarDefault.al)}
        </p>
        {periodoMsg ? (
          <p className="mt-1 text-xs text-slate-700">{periodoMsg}</p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <ColonnaCommercialista
            kind="emessa"
            titoloTotale="Totale fatture emesse"
            titoloDettaglio="Dettaglio fatture emesse"
            vocePrimariaLabel="Prodotti venduti"
            colonna={data.emesse}
            anno={anno}
            trimestre={trimestre}
            onSequenzaDone={() => void load()}
          />
          <ColonnaCommercialista
            kind="ricevuta"
            titoloTotale="Totale fatture ricevute"
            titoloDettaglio="Dettaglio fatture ricevute"
            vocePrimariaLabel="Materiale di consumo"
            colonna={data.ricevute}
            anno={anno}
            trimestre={trimestre}
            onSequenzaDone={() => void load()}
          />
        </div>
      ) : null}
    </div>
  );
}
