"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  listCalendarioImpegniAction,
  spostaImpegnoCalendarioAction,
} from "@/app/actions/calendario-produzione";
import {
  buildWorkingBlock,
  dataConsegnaDaBlocco,
  formatIsoIt,
  monthMatrix,
  type CalendarioImpegno,
} from "@/lib/amministrazione/calendario-produzione";

type Props = {
  giorniNecessari: number;
  usaSabato: boolean;
  onToggleSabato: (v: boolean) => void;
  initialSelected?: string[];
  onConfirm: (payload: {
    giorniProduzione: string[];
    dataConsegna: string;
  }) => void;
  onClose: () => void;
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function ConsegnaCalendarioModal({
  giorniNecessari,
  usaSabato,
  onToggleSabato,
  initialSelected = [],
  onConfirm,
  onClose,
}: Props) {
  const titleId = useId();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const [impegni, setImpegni] = useState<CalendarioImpegno[]>([]);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [forceMode, setForceMode] = useState(false);
  const [conflictAsk, setConflictAsk] = useState<{
    days: string[];
    conflicts: string[];
  } | null>(null);
  const [displaceAsk, setDisplaceAsk] = useState<{
    impegno: CalendarioImpegno;
    targetDay: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const preview = useMemo(() => {
    if (!hoverIso || giorniNecessari <= 0) {
      return { days: [] as string[], skippedOccupied: [] as string[], conflicts: [] as string[] };
    }
    return buildWorkingBlock({
      startIso: hoverIso,
      giorni: giorniNecessari,
      usaSabato,
      occupiedSet,
      skipOccupied: !forceMode,
    });
  }, [hoverIso, giorniNecessari, usaSabato, occupiedSet, forceMode]);

  const selectedConsegna = useMemo(
    () => dataConsegnaDaBlocco(selected, usaSabato),
    [selected, usaSabato]
  );

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
    if (selectedConsegna === iso) {
      return "bg-emerald-500 text-white border-emerald-700 ring-4 ring-emerald-300 shadow-lg scale-[1.03] z-10 font-bold";
    }
    if (selected.includes(iso)) {
      return "bg-emerald-400/90 text-emerald-950 border-emerald-600 ring-2 ring-emerald-300 font-semibold";
    }
    if (preview.days.includes(iso)) {
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
    const block = buildWorkingBlock({
      startIso,
      giorni: giorniNecessari,
      usaSabato,
      occupiedSet,
      skipOccupied: true,
    });
    if (block.skippedOccupied.length > 0) {
      const forced = buildWorkingBlock({
        startIso,
        giorni: giorniNecessari,
        usaSabato,
        occupiedSet,
        skipOccupied: false,
      });
      setConflictAsk({
        days: forced.days,
        conflicts: forced.conflicts,
      });
      return;
    }
    if (block.days.length < giorniNecessari) {
      setError("Impossibile posizionare tutti i giorni lavorativi da questa data.");
      return;
    }
    setSelected(block.days);
    setError(null);
  }

  function confirmForced() {
    if (!conflictAsk) return;
    setSelected(conflictAsk.days);
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
              Passa il mouse: {giorniNecessari} caselle lavorative seguono il
              cursore (saltano domenica
              {usaSabato ? "" : " e sabato"}
              {forceMode ? "" : " e giorni già impegnati"}). Clic per fissare.
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
            <span className="inline-block h-3.5 w-3.5 rounded border border-slate-200 bg-white/40" />
            Libero
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-green-600" />
            Occupato
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-lime-300 ring-1 ring-lime-500" />
            Anteprima blocco
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-emerald-500 ring-2 ring-emerald-300" />
            Selezionato / consegna
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
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isSun}
                  onMouseEnter={() => !isSun && setHoverIso(iso)}
                  onMouseLeave={() => setHoverIso(null)}
                  onClick={() => {
                    if (isSun) return;
                    if (occ.length && !forceMode && !preview.days.includes(iso)) {
                      setDisplaceAsk({ impegno: occ[0]!, targetDay: iso });
                      return;
                    }
                    trySelectFrom(iso);
                  }}
                  className={`relative aspect-square rounded-lg border text-sm transition ${cellClass(iso)}`}
                  title={
                    occ.length
                      ? `Occupato: ${occ.map((o) => o.etichetta || o.ordineId).join(", ")}`
                      : iso
                  }
                >
                  <span className="absolute left-1.5 top-1 text-xs tabular-nums">
                    {Number(iso.slice(8, 10))}
                  </span>
                  {selectedConsegna === iso ? (
                    <span className="absolute inset-x-1 bottom-1 rounded bg-emerald-900/30 px-0.5 text-[9px] font-bold uppercase leading-tight">
                      Consegna
                    </span>
                  ) : null}
                  {occ.length && !preview.days.includes(iso) && !selected.includes(iso) ? (
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
            Giorni produzione selezionati:{" "}
            <strong>{selected.length}</strong> / {giorniNecessari}
          </p>
          {selected.length ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {selected.map(formatIsoIt).join(" · ")}
            </p>
          ) : null}
          <p className="mt-2">
            Data consegna (evidenziata):{" "}
            <strong className="text-emerald-700">
              {selectedConsegna ? formatIsoIt(selectedConsegna) : "—"}
            </strong>
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
            disabled={
              selected.length !== giorniNecessari || !selectedConsegna
            }
            onClick={() => {
              if (!selectedConsegna) return;
              onConfirm({
                giorniProduzione: selected,
                dataConsegna: selectedConsegna,
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
              {conflictAsk.conflicts.map((d) => (
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
              . Puoi spostarlo su un altro giorno libero dal calendario (clicca
              dopo «Sposta») oppure sostituirlo con questo ordine.
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
                  // Modalità spostamento: prossimo click libero sposta l'impegno
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
