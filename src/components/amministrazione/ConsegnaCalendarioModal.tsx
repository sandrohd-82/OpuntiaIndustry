"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  listCalendarioImpegniAction,
  spostaImpegnoCalendarioAction,
} from "@/app/actions/calendario-produzione";
import {
  buildBloccoCalendarioOrdine,
  dataConsegnaDaBlocco,
  formatIsoIt,
  monthFromIso,
  monthMatrix,
  type BloccoCalendarioOrdine,
  type CalendarioImpegno,
} from "@/lib/amministrazione/calendario-produzione";
import {
  ClearableNumberInput,
} from "@/components/ui/ClearableNumberInput";

type Props = {
  giorniProduzioneNecessari: number;
  usaSabato: boolean;
  onToggleSabato: (v: boolean) => void;
  initialGiorniProduzione?: string[];
  initialGiorniPreparazione?: string[];
  /** Default 1; ripristinato se già confermato. */
  initialCountPreparazione?: number;
  onConfirm: (payload: {
    giorniProduzione: string[];
    giorniPreparazione: string[];
    dataConsegna: string;
  }) => void;
  onClose: () => void;
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function emptyBlocco(): BloccoCalendarioOrdine {
  return {
    produzione: [],
    preparazione: [],
    tutti: [],
    dataConsegna: null,
    skippedOccupied: [],
    conflicts: [],
  };
}

export function ConsegnaCalendarioModal({
  giorniProduzioneNecessari,
  usaSabato,
  onToggleSabato,
  initialGiorniProduzione = [],
  initialGiorniPreparazione = [],
  initialCountPreparazione,
  onConfirm,
  onClose,
}: Props) {
  const titleId = useId();
  const today = new Date();
  const seedConsegna =
    initialGiorniProduzione.length > 0 &&
    initialGiorniPreparazione.length > 0
      ? dataConsegnaDaBlocco(
          [...initialGiorniProduzione, ...initialGiorniPreparazione],
          usaSabato
        )
      : null;
  const seedIso =
    seedConsegna ??
    initialGiorniPreparazione[initialGiorniPreparazione.length - 1] ??
    initialGiorniProduzione[0] ??
    null;
  const seedMonth = seedIso ? monthFromIso(seedIso) : null;
  const [year, setYear] = useState(
    seedMonth?.year ?? today.getFullYear()
  );
  const [month0, setMonth0] = useState(
    seedMonth?.month0 ?? today.getMonth()
  );
  const [impegni, setImpegni] = useState<CalendarioImpegno[]>([]);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [countPrep, setCountPrep] = useState<number | "">(
    initialCountPreparazione && initialCountPreparazione > 0
      ? initialCountPreparazione
      : initialGiorniPreparazione.length > 0
        ? initialGiorniPreparazione.length
        : 1
  );
  const [produzione, setProduzione] = useState<string[]>(
    initialGiorniProduzione
  );
  const [preparazione, setPreparazione] = useState<string[]>(
    initialGiorniPreparazione
  );
  const [dataConsegna, setDataConsegna] = useState<string | null>(() => {
    if (
      initialGiorniProduzione.length > 0 &&
      initialGiorniPreparazione.length > 0
    ) {
      return dataConsegnaDaBlocco(
        [...initialGiorniProduzione, ...initialGiorniPreparazione],
        usaSabato
      );
    }
    return null;
  });
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

  const nPrep = typeof countPrep === "number" && countPrep > 0 ? countPrep : 0;

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
    setPreparazione(blocco.preparazione);
    setDataConsegna(blocco.dataConsegna);
    setError(null);
    // Mostra sempre il mese della data consegna (o ultimo giorno del blocco)
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

  // Se cambia il n° giorni preparazione con selezione già fatta, riallinea dal primo giorno prod.
  useEffect(() => {
    if (produzione.length === 0 || nPrep <= 0) return;
    if (
      produzione.length === giorniProduzioneNecessari &&
      preparazione.length === nPrep
    ) {
      return;
    }
    const start = produzione[0]!;
    const blocco = buildBloccoCalendarioOrdine({
      startIso: start,
      giorniProduzione: giorniProduzioneNecessari,
      giorniPreparazione: nPrep,
      usaSabato,
      occupiedSet,
      skipOccupied: !forceMode,
    });
    if (
      blocco.tutti.length === giorniProduzioneNecessari + nPrep &&
      blocco.skippedOccupied.length === 0
    ) {
      applyBlocco(blocco);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nPrep, usaSabato]);

  const preview = useMemo(() => {
    if (!hoverIso || giorniProduzioneNecessari <= 0 || nPrep <= 0) {
      return emptyBlocco();
    }
    return buildBloccoCalendarioOrdine({
      startIso: hoverIso,
      giorniProduzione: giorniProduzioneNecessari,
      giorniPreparazione: nPrep,
      usaSabato,
      occupiedSet,
      skipOccupied: !forceMode,
    });
  }, [
    hoverIso,
    giorniProduzioneNecessari,
    nPrep,
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
    if (preparazione.includes(iso)) {
      return "bg-amber-300 text-amber-950 border-amber-500 ring-2 ring-amber-400 font-semibold";
    }
    if (produzione.includes(iso)) {
      return "bg-emerald-400/90 text-emerald-950 border-emerald-600 ring-2 ring-emerald-300 font-semibold";
    }
    if (preview.preparazione.includes(iso)) {
      return "bg-amber-200/90 text-amber-950 border-amber-400 ring-2 ring-amber-300 font-semibold";
    }
    if (preview.produzione.includes(iso)) {
      return "bg-lime-300/90 text-lime-950 border-lime-500 ring-2 ring-lime-400 font-semibold";
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
    if (nPrep <= 0) {
      setError("Imposta almeno 1 giorno di preparazione e imballaggio.");
      return;
    }
    const blocco = buildBloccoCalendarioOrdine({
      startIso,
      giorniProduzione: giorniProduzioneNecessari,
      giorniPreparazione: nPrep,
      usaSabato,
      occupiedSet,
      skipOccupied: true,
    });
    if (blocco.skippedOccupied.length > 0) {
      const forced = buildBloccoCalendarioOrdine({
        startIso,
        giorniProduzione: giorniProduzioneNecessari,
        giorniPreparazione: nPrep,
        usaSabato,
        occupiedSet,
        skipOccupied: false,
      });
      setConflictAsk({ blocco: forced });
      return;
    }
    const needed = giorniProduzioneNecessari + nPrep;
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

  const monthLabel = new Date(year, month0, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const canConfirm =
    produzione.length === giorniProduzioneNecessari &&
    preparazione.length === nPrep &&
    nPrep > 0 &&
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
              Passa il mouse: {giorniProduzioneNecessari} giorni verdi
              (lavorazione) + {nPrep || "…"} gialli (preparazione e
              imballaggio). Clic per fissare. La data consegna (azzurra) è il
              giorno lavorativo successivo.
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

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Giorni preparazione e imballaggio
            </span>
            <ClearableNumberInput
              min={1}
              max={60}
              value={countPrep}
              onValueChange={(v) => {
                if (v === "") {
                  setCountPrep("");
                  return;
                }
                setCountPrep(Math.max(1, Math.floor(v)));
              }}
              emptyAsZeroOnBlur={false}
              className="w-24 rounded-lg border border-[var(--border)] px-3 py-1.5"
            />
          </label>
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            ←
          </button>
          <span className="min-w-[10rem] pb-1.5 text-center text-sm font-semibold capitalize">
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
            <span className="inline-block h-3.5 w-3.5 rounded border border-slate-200 bg-white/40" />
            Libero
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-green-600" />
            Occupato
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-emerald-400 ring-1 ring-emerald-600" />
            Lavorazione
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-amber-300 ring-1 ring-amber-500" />
            Preparazione e imballaggio
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-sky-500 ring-2 ring-sky-300" />
            Consegna
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-slate-200" />
            Sabato (off)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-slate-700" />
            Domenica
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
                    className="aspect-square rounded-lg border border-transparent bg-transparent"
                  />
                );
              }
              const dow = new Date(iso + "T12:00:00").getDay();
              const isSun = dow === 0;
              const occ = occupiedMap.get(iso) ?? [];
              const inPreview = preview.tutti.includes(iso);
              const inSelected =
                produzione.includes(iso) || preparazione.includes(iso);
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
                      : preparazione.includes(iso)
                        ? `Preparazione e imballaggio · ${iso}`
                        : produzione.includes(iso)
                          ? `Lavorazione · ${iso}`
                          : occ.length
                            ? `Occupato: ${occ.map((o) => o.etichetta || o.ordineId).join(", ")}`
                            : iso
                  }
                >
                  <span className="absolute left-1.5 top-1 text-xs tabular-nums">
                    {Number(iso.slice(8, 10))}
                  </span>
                  {dataConsegna === iso ? (
                    <span className="absolute inset-x-0.5 bottom-0.5 rounded bg-sky-900/40 px-0.5 text-[8px] font-bold uppercase leading-tight tracking-tight">
                      Consegna
                    </span>
                  ) : preparazione.includes(iso) ||
                    preview.preparazione.includes(iso) ? (
                    <span className="absolute inset-x-0.5 bottom-0.5 rounded bg-amber-900/20 px-0.5 text-[8px] font-bold uppercase leading-tight tracking-tight">
                      Prep.
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
            Lavorazione (verdi):{" "}
            <strong>{produzione.length}</strong> /{" "}
            {giorniProduzioneNecessari}
          </p>
          {produzione.length ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {produzione.map(formatIsoIt).join(" · ")}
            </p>
          ) : null}
          <p className="mt-2">
            Preparazione e imballaggio (gialli):{" "}
            <strong>{preparazione.length}</strong> / {nPrep || "—"}
          </p>
          {preparazione.length ? (
            <p className="mt-1 text-xs text-amber-900">
              {preparazione.map(formatIsoIt).join(" · ")}
            </p>
          ) : null}
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
          {preview.skippedOccupied.length > 0 && !forceMode ? (
            <p className="mt-2 text-xs text-amber-800">
              Anteprima: saltati {preview.skippedOccupied.length} giorni già
              impegnati.
            </p>
          ) : null}
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
                giorniPreparazione: preparazione,
                dataConsegna,
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
              Nel blocco ci sono giorni già occupati. Vuoi modificare forzatamente
              i giorni (sovrascrivendo / sostituendo gli impegni)?
            </p>
            <ul className="mt-2 list-inside list-disc text-xs text-amber-900">
              {conflictAsk.blocco.conflicts.map((d) => (
                <li key={d}>{formatIsoIt(d)}</li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => setConflictAsk(null)}
              >
                No, riposiziona
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
              . Puoi spostarlo su un altro giorno libero dal calendario oppure
              sostituirlo con questo ordine.
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
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-950"
                onClick={() => {
                  setForceMode(true);
                  trySelectFrom(displaceAsk.targetDay);
                  setDisplaceAsk(null);
                }}
              >
                Sostituisci con ordine attuale
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => {
                  const target = window.prompt(
                    "Nuova data (AAAA-MM-GG) libera per spostare l’impegno:",
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
                Sposta impegno…
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
