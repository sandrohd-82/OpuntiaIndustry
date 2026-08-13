"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  listCalendarioImpegniAction,
  spostaImpegnoCalendarioAction,
} from "@/app/actions/calendario-produzione";
import {
  ClearableNumberInput,
} from "@/components/ui/ClearableNumberInput";
import {
  calcGiorniAttivita,
  type AttivitaOrdineDraft,
} from "@/lib/amministrazione/attivita";
import {
  buildBloccoCalendarioOrdine,
  formatIsoIt,
  monthFromIso,
  monthMatrix,
  type BloccoCalendarioOrdine,
  type CalendarioImpegno,
} from "@/lib/amministrazione/calendario-produzione";

type Props = {
  giorniProduzioneNecessari: number;
  kgOrdine: number;
  usaSabato: boolean;
  onToggleSabato: (v: boolean) => void;
  attivitaDrafts: AttivitaOrdineDraft[];
  onAttivitaDraftsChange: (next: AttivitaOrdineDraft[]) => void;
  initialGiorniProduzione?: string[];
  initialGiorniAttivita?: string[];
  initialDataConsegna?: string | null;
  onConfirm: (payload: {
    giorniProduzione: string[];
    giorniAttivita: string[];
    segmentiAttivita: Array<{
      attivitaId: string;
      codice: string;
      titolo: string;
      dates: string[];
    }>;
    dataConsegna: string;
    attivitaDrafts: AttivitaOrdineDraft[];
  }) => void;
  onClose: () => void;
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function emptyBlocco(): BloccoCalendarioOrdine {
  return {
    produzione: [],
    preparazione: [],
    attivita: [],
    tutti: [],
    dataConsegna: null,
    skippedOccupied: [],
    conflicts: [],
  };
}

function segmentiFromDrafts(
  drafts: AttivitaOrdineDraft[],
  kgOrdine: number,
  giorniProd: number
) {
  return drafts
    .filter((d) => d.enabled)
    .map((d) => ({
      attivitaId: d.attivitaId,
      codice: d.codice,
      titolo: d.titolo,
      giorni: calcGiorniAttivita({
        kgOrdine,
        giorniProduzione: giorniProd,
        kgPerOra: d.kgPerOra,
        oreGiorno: d.oreGiorno,
        incastrabileDuranteLavorazione: d.incastrabileDuranteLavorazione,
        giorniOverride: d.giorniOverride,
      }),
    }))
    .filter((s) => s.giorni > 0);
}

export function ConsegnaCalendarioModal({
  giorniProduzioneNecessari,
  kgOrdine,
  usaSabato,
  onToggleSabato,
  attivitaDrafts,
  onAttivitaDraftsChange,
  initialGiorniProduzione = [],
  initialGiorniAttivita = [],
  initialDataConsegna = null,
  onConfirm,
  onClose,
}: Props) {
  const titleId = useId();
  const today = new Date();
  const seedIso =
    initialDataConsegna ??
    initialGiorniAttivita[initialGiorniAttivita.length - 1] ??
    initialGiorniProduzione[0] ??
    null;
  const seedMonth = seedIso ? monthFromIso(seedIso) : null;
  const [year, setYear] = useState(seedMonth?.year ?? today.getFullYear());
  const [month0, setMonth0] = useState(seedMonth?.month0 ?? today.getMonth());
  const [impegni, setImpegni] = useState<CalendarioImpegno[]>([]);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [produzione, setProduzione] = useState<string[]>(
    initialGiorniProduzione
  );
  const [attivitaDates, setAttivitaDates] = useState<string[]>(
    initialGiorniAttivita
  );
  const [segmentiSel, setSegmentiSel] = useState<
    BloccoCalendarioOrdine["attivita"]
  >([]);
  const [dataConsegna, setDataConsegna] = useState<string | null>(
    initialDataConsegna
  );
  const [forceMode, setForceMode] = useState(false);
  const [conflictAsk, setConflictAsk] = useState<{
    blocco: BloccoCalendarioOrdine;
  } | null>(null);
  const [displaceAsk, setDisplaceAsk] = useState<{
    impegno: CalendarioImpegno;
    targetDay: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const segmentiCalc = useMemo(
    () =>
      segmentiFromDrafts(
        attivitaDrafts,
        kgOrdine,
        giorniProduzioneNecessari
      ),
    [attivitaDrafts, kgOrdine, giorniProduzioneNecessari]
  );
  const giorniAttTotal = segmentiCalc.reduce((s, x) => s + x.giorni, 0);

  const range = useMemo(() => {
    const from = `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
    const last = new Date(year, month0 + 1, 0).getDate();
    const to = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    return { from, to };
  }, [year, month0]);

  async function refreshImpegni() {
    setLoading(true);
    const res = await listCalendarioImpegniAction(range);
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setImpegni(res.impegni);
    setError(null);
  }

  useEffect(() => {
    void refreshImpegni();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function goToIsoMonth(iso: string) {
    const m = monthFromIso(iso);
    setYear(m.year);
    setMonth0(m.month0);
  }

  function applyBlocco(blocco: BloccoCalendarioOrdine) {
    setProduzione(blocco.produzione);
    setAttivitaDates(blocco.preparazione);
    setSegmentiSel(blocco.attivita);
    setDataConsegna(blocco.dataConsegna);
    setError(null);
    const focus =
      blocco.dataConsegna ??
      blocco.tutti[blocco.tutti.length - 1] ??
      null;
    if (focus) goToIsoMonth(focus);
  }

  const occupiedMap = useMemo(() => {
    const m = new Map<string, CalendarioImpegno[]>();
    for (const i of impegni) {
      const list = m.get(i.dataGiorno) ?? [];
      list.push(i);
      m.set(i.dataGiorno, list);
    }
    return m;
  }, [impegni]);

  const occupiedSet = useMemo(
    () => new Set(impegni.map((i) => i.dataGiorno)),
    [impegni]
  );

  // Ricalcolo immediato se cambiano attività e c'è già una selezione
  useEffect(() => {
    if (produzione.length === 0) return;
    const start = produzione[0]!;
    const blocco = buildBloccoCalendarioOrdine({
      startIso: start,
      giorniProduzione: giorniProduzioneNecessari,
      segmentiAttivita: segmentiCalc,
      usaSabato,
      occupiedSet,
      skipOccupied: !forceMode,
    });
    const needed = giorniProduzioneNecessari + giorniAttTotal;
    if (blocco.tutti.length === needed) {
      applyBlocco(blocco);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attivitaDrafts, kgOrdine, giorniProduzioneNecessari, usaSabato]);

  // Ripristino consegna se passata ma non ricalcolata
  useEffect(() => {
    if (initialDataConsegna && !dataConsegna) {
      setDataConsegna(initialDataConsegna);
      goToIsoMonth(initialDataConsegna);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = useMemo(() => {
    if (!hoverIso || giorniProduzioneNecessari <= 0) return emptyBlocco();
    return buildBloccoCalendarioOrdine({
      startIso: hoverIso,
      giorniProduzione: giorniProduzioneNecessari,
      segmentiAttivita: segmentiCalc,
      usaSabato,
      occupiedSet,
      skipOccupied: !forceMode,
    });
  }, [
    hoverIso,
    giorniProduzioneNecessari,
    segmentiCalc,
    usaSabato,
    occupiedSet,
    forceMode,
  ]);

  const rows = useMemo(() => monthMatrix(year, month0), [year, month0]);

  function cellClass(iso: string | null): string {
    if (!iso) return "bg-transparent border-transparent";
    const dow = new Date(iso + "T12:00:00").getDay();
    if (dow === 0) {
      return "bg-slate-700 text-slate-300 border-slate-800 cursor-not-allowed opacity-80";
    }
    if (dow === 6 && !usaSabato) {
      return "bg-slate-200 text-slate-500 border-slate-300";
    }
    if (dataConsegna === iso) {
      return "bg-sky-500 text-white border-sky-700 ring-4 ring-sky-300 shadow-lg scale-[1.03] z-10 font-bold";
    }
    if (attivitaDates.includes(iso) || preview.preparazione.includes(iso)) {
      return "bg-amber-300 text-amber-950 border-amber-500 ring-2 ring-amber-400 font-semibold";
    }
    if (produzione.includes(iso) || preview.produzione.includes(iso)) {
      return "bg-emerald-400/90 text-emerald-950 border-emerald-600 ring-2 ring-emerald-300 font-semibold";
    }
    if (occupiedSet.has(iso)) {
      return "bg-green-600 text-white border-green-800";
    }
    if (dow === 6 && usaSabato) {
      return "bg-slate-100 text-slate-800 border-slate-300 hover:bg-lime-100";
    }
    return "bg-white/40 text-slate-800 border-slate-200/80 hover:bg-lime-50 backdrop-blur-sm";
  }

  function trySelectFrom(startIso: string) {
    const blocco = buildBloccoCalendarioOrdine({
      startIso,
      giorniProduzione: giorniProduzioneNecessari,
      segmentiAttivita: segmentiCalc,
      usaSabato,
      occupiedSet,
      skipOccupied: true,
    });
    if (blocco.skippedOccupied.length > 0) {
      const forced = buildBloccoCalendarioOrdine({
        startIso,
        giorniProduzione: giorniProduzioneNecessari,
        segmentiAttivita: segmentiCalc,
        usaSabato,
        occupiedSet,
        skipOccupied: false,
      });
      setConflictAsk({ blocco: forced });
      return;
    }
    const needed = giorniProduzioneNecessari + giorniAttTotal;
    if (blocco.tutti.length < needed) {
      setError(
        "Impossibile posizionare tutti i giorni lavorativi da questa data."
      );
      return;
    }
    applyBlocco(blocco);
  }

  function confirmForced() {
    if (!conflictAsk) return;
    applyBlocco(conflictAsk.blocco);
    setForceMode(true);
    setConflictAsk(null);
  }

  function prevMonth() {
    if (month0 === 0) {
      setYear((y) => y - 1);
      setMonth0(11);
    } else setMonth0((m) => m - 1);
  }

  function nextMonth() {
    if (month0 === 11) {
      setYear((y) => y + 1);
      setMonth0(0);
    } else setMonth0((m) => m + 1);
  }

  function patchDraft(id: string, patch: Partial<AttivitaOrdineDraft>) {
    onAttivitaDraftsChange(
      attivitaDrafts.map((d) => (d.attivitaId === id ? { ...d, ...patch } : d))
    );
  }

  const monthLabel = new Date(year, month0, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const canConfirm =
    produzione.length === giorniProduzioneNecessari &&
    attivitaDates.length === giorniAttTotal &&
    Boolean(dataConsegna);

  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-3 py-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Calendario consegna / produzione
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {giorniProduzioneNecessari} giorni verdi (lavorazione)
              {giorniAttTotal > 0
                ? ` + ${giorniAttTotal} gialli (attività)`
                : ""}
              . La consegna (azzurro) è il giorno lavorativo successivo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3">
          <h3 className="text-sm font-semibold text-amber-950">
            Oltre la lavorazione per ottenere il prodotto occorrerà
          </h3>
          {attivitaDrafts.length === 0 ? (
            <p className="mt-2 text-xs text-amber-900">
              Nessuna attività collegata al prodotto. Collega attività in Schede
              → Prodotti Agrinsicilia, oppure procedi solo con la lavorazione.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {attivitaDrafts.map((d) => {
                const g = calcGiorniAttivita({
                  kgOrdine,
                  giorniProduzione: giorniProduzioneNecessari,
                  kgPerOra: d.kgPerOra,
                  oreGiorno: d.oreGiorno,
                  incastrabileDuranteLavorazione:
                    d.incastrabileDuranteLavorazione,
                  giorniOverride: d.giorniOverride,
                });
                return (
                  <li
                    key={d.attivitaId}
                    className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={d.enabled}
                          onChange={(e) =>
                            patchDraft(d.attivitaId, {
                              enabled: e.target.checked,
                            })
                          }
                        />
                        <span>
                          <span className="font-mono text-xs font-semibold">
                            {d.codice}
                          </span>
                          <span className="ml-2 font-medium">{d.titolo}</span>
                          {d.spiegazione ? (
                            <span className="mt-0.5 block text-xs text-[var(--muted)]">
                              {d.spiegazione}
                            </span>
                          ) : null}
                        </span>
                      </label>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
                        {d.enabled ? `${g} gg` : "off"}
                      </span>
                    </div>
                    {d.enabled ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="text-xs">
                          <span className="mb-0.5 block text-[var(--muted)]">
                            kg/ora
                          </span>
                          <ClearableNumberInput
                            value={d.kgPerOra}
                            onValueChange={(v) =>
                              patchDraft(d.attivitaId, {
                                kgPerOra: v === "" ? d.kgPerOra : v,
                              })
                            }
                            className="w-full rounded border border-[var(--border)] px-2 py-1"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="mb-0.5 block text-[var(--muted)]">
                            ore/giorno
                          </span>
                          <ClearableNumberInput
                            value={d.oreGiorno}
                            onValueChange={(v) =>
                              patchDraft(d.attivitaId, {
                                oreGiorno: v === "" ? d.oreGiorno : v,
                              })
                            }
                            className="w-full rounded border border-[var(--border)] px-2 py-1"
                          />
                        </label>
                        <label className="text-xs">
                          <span className="mb-0.5 block text-[var(--muted)]">
                            Giorni (override)
                          </span>
                          <ClearableNumberInput
                            value={d.giorniOverride ?? ""}
                            onValueChange={(v) =>
                              patchDraft(d.attivitaId, {
                                giorniOverride: v === "" ? null : Math.max(0, Math.floor(v)),
                              })
                            }
                            placeholder="auto"
                            className="w-full rounded border border-[var(--border)] px-2 py-1"
                          />
                        </label>
                        <label className="flex items-end gap-2 text-xs pb-1">
                          <input
                            type="checkbox"
                            checked={d.incastrabileDuranteLavorazione}
                            onChange={(e) =>
                              patchDraft(d.attivitaId, {
                                incastrabileDuranteLavorazione:
                                  e.target.checked,
                              })
                            }
                          />
                          Incastrabile
                        </label>
                      </div>
                    ) : null}
                    {d.enabled && d.incastrabileDuranteLavorazione ? (
                      <p className="mt-1 text-[11px] text-amber-900">
                        Incastrabile: in calendario restano {g} giorno/i extra
                        per l’ultimo quantitativo dopo la lavorazione.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            ←
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold capitalize">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            →
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usaSabato}
              onChange={(e) => onToggleSabato(e.target.checked)}
            />
            Sabato attivabile
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forceMode}
              onChange={(e) => setForceMode(e.target.checked)}
            />
            Forza su giorni impegnati
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-emerald-400" />
            Lavorazione
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-amber-300" />
            Attività
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-sky-500 ring-2 ring-sky-300" />
            Consegna
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-green-600" />
            Occupato
          </span>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"
            >
              {d}
            </div>
          ))}
          {rows.flatMap((row, ri) =>
            row.map((iso, ci) => {
              const key = `${ri}-${ci}`;
              if (!iso) {
                return (
                  <div
                    key={key}
                    className="aspect-square rounded-lg border border-transparent"
                  />
                );
              }
              const dow = new Date(iso + "T12:00:00").getDay();
              const isSun = dow === 0;
              const occ = occupiedMap.get(iso) ?? [];
              const inPreview = preview.tutti.includes(iso);
              const inSelected =
                produzione.includes(iso) || attivitaDates.includes(iso);
              const segLabel =
                segmentiSel.find((s) => s.dates.includes(iso))?.titolo ??
                preview.attivita.find((s) => s.dates.includes(iso))?.titolo;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isSun}
                  onMouseEnter={() => !isSun && setHoverIso(iso)}
                  onMouseLeave={() => setHoverIso(null)}
                  onClick={() => {
                    if (isSun) return;
                    if (occ.length && !forceMode && !inPreview) {
                      setDisplaceAsk({ impegno: occ[0]!, targetDay: iso });
                      return;
                    }
                    trySelectFrom(iso);
                  }}
                  className={`relative aspect-square rounded-lg border text-sm transition ${cellClass(iso)}`}
                  title={
                    dataConsegna === iso
                      ? `Consegna · ${iso}`
                      : segLabel
                        ? `${segLabel} · ${iso}`
                        : occ.length
                          ? `Occupato: ${occ.map((o) => o.etichetta || o.ordineId).join(", ")}`
                          : iso
                  }
                >
                  <span className="absolute left-1.5 top-1 text-xs tabular-nums">
                    {Number(iso.slice(8, 10))}
                  </span>
                  {dataConsegna === iso ? (
                    <span className="absolute inset-x-0.5 bottom-0.5 rounded bg-sky-900/40 px-0.5 text-[8px] font-bold uppercase leading-tight">
                      Consegna
                    </span>
                  ) : segLabel ? (
                    <span className="absolute inset-x-0.5 bottom-0.5 truncate rounded bg-amber-900/20 px-0.5 text-[8px] font-bold uppercase leading-tight">
                      {segLabel.slice(0, 10)}
                    </span>
                  ) : occ.length && !inPreview && !inSelected ? (
                    <span className="absolute inset-x-1 bottom-1 truncate text-[9px] font-medium leading-tight opacity-90">
                      {occ[0]?.etichetta || "Imp."}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {loading ? (
          <p className="mt-3 text-xs text-[var(--muted)]">Carico impegni…</p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-3 text-sm">
          <p>
            Lavorazione: <strong>{produzione.length}</strong> /{" "}
            {giorniProduzioneNecessari}
            {" · "}
            Attività: <strong>{attivitaDates.length}</strong> / {giorniAttTotal}
          </p>
          <p className="mt-2">
            Data consegna:{" "}
            <strong className="text-sky-700">
              {dataConsegna ? formatIsoIt(dataConsegna) : "—"}
            </strong>
            {dataConsegna ? (
              <button
                type="button"
                className="ml-2 text-xs font-medium text-sky-700 underline"
                onClick={() => goToIsoMonth(dataConsegna)}
              >
                Vai al mese
              </button>
            ) : null}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!dataConsegna || !canConfirm) return;
              onConfirm({
                giorniProduzione: produzione,
                giorniAttivita: attivitaDates,
                segmentiAttivita: segmentiSel.map((s) => ({
                  attivitaId: s.attivitaId,
                  codice: s.codice,
                  titolo: s.titolo,
                  dates: s.dates,
                })),
                dataConsegna,
                attivitaDrafts,
              });
            }}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            Conferma calendario
          </button>
        </div>
      </div>

      {conflictAsk ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-amber-950">
              Giorni già impegnati
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              Nel blocco ci sono giorni già occupati. Forzare la selezione?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => setConflictAsk(null)}
              >
                No
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white"
                onClick={confirmForced}
              >
                Sì, forza
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {displaceAsk ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Giorno impegnato</h3>
            <p className="mt-2 text-sm text-slate-700">
              {formatIsoIt(displaceAsk.impegno.dataGiorno)} è occupato
              {displaceAsk.impegno.etichetta
                ? ` (${displaceAsk.impegno.etichetta})`
                : ""}
              .
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => setDisplaceAsk(null)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm"
                onClick={() => {
                  setForceMode(true);
                  trySelectFrom(displaceAsk.targetDay);
                  setDisplaceAsk(null);
                }}
              >
                Sostituisci
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => {
                  const target = window.prompt(
                    "Nuova data (AAAA-MM-GG):",
                    displaceAsk.impegno.dataGiorno
                  );
                  if (!target) return;
                  void (async () => {
                    const res = await spostaImpegnoCalendarioAction({
                      impegnoId: displaceAsk.impegno.id,
                      nuovaData: target,
                      sostituisciSeOccupato: false,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setDisplaceAsk(null);
                    await refreshImpegni();
                  })();
                }}
              >
                Sposta…
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
