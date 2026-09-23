"use client";

import { useEffect, useMemo, useState } from "react";
import { listScalettaCalendarioAction } from "@/app/actions/scaletta-produzione";
import {
  addMonthsIso,
  formatIsoIt,
  monthMatrix,
  startOfWeekMon,
  todayIso,
  weekDaysFrom,
} from "@/lib/amministrazione/calendario-produzione";
import {
  SCALETTA_ESECUZIONE_LABEL,
  SCALETTA_TIPO_LABEL,
  SCALETTA_VISTE,
  type ScalettaImpegno,
  type ScalettaSenzaData,
  type ScalettaTipoImpegno,
  type ScalettaVista,
} from "@/lib/amministrazione/scaletta-produzione";
import { addDays } from "@/lib/amministrazione/produzione-capacita";
import { ScalettaImpegnoModal } from "@/components/produzione/ScalettaImpegnoModal";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function rangeForVista(anchor: string, vista: ScalettaVista): {
  from: string;
  to: string;
} {
  if (vista === "giorno") return { from: anchor, to: anchor };
  if (vista === "settimana") {
    const from = startOfWeekMon(anchor);
    return { from, to: addDays(from, 6) };
  }
  const d = new Date(`${anchor}T12:00:00`);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

function labelPeriodo(anchor: string, vista: ScalettaVista): string {
  const d = new Date(`${anchor}T12:00:00`);
  if (vista === "giorno") {
    return d.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (vista === "settimana") {
    const from = startOfWeekMon(anchor);
    const to = addDays(from, 6);
    return `${formatIsoIt(from)} — ${formatIsoIt(to)}`;
  }
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function classeTipo(tipo: ScalettaTipoImpegno): string {
  if (tipo === "lavorazione") return "bg-emerald-100 text-emerald-900";
  if (tipo === "confezionamento") return "bg-sky-100 text-sky-900";
  if (tipo === "trasformazione") return "bg-violet-100 text-violet-900";
  if (tipo === "attivita") return "bg-amber-100 text-amber-950";
  return "bg-slate-100 text-slate-700";
}

export function ScalettaProduzioneBoard() {
  const [vista, setVista] = useState<ScalettaVista>("mese");
  const [anchor, setAnchor] = useState(todayIso);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<ScalettaTipoImpegno | "tutte">(
    "tutte"
  );
  const [impegni, setImpegni] = useState<ScalettaImpegno[]>([]);
  const [senzaData, setSenzaData] = useState<ScalettaSenzaData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apertoId, setApertoId] = useState<string | null>(null);

  const range = useMemo(() => rangeForVista(anchor, vista), [anchor, vista]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listScalettaCalendarioAction(range).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setImpegni([]);
        setSenzaData([]);
        setLoading(false);
        return;
      }
      setError(null);
      setImpegni(res.impegni);
      setSenzaData(res.senzaData);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const filtrati = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return impegni.filter((i) => {
      if (tipoFiltro !== "tutte" && i.tipo !== tipoFiltro) return false;
      if (!needle) return true;
      return (
        i.numeroInterno.toLowerCase().includes(needle) ||
        i.cliente.toLowerCase().includes(needle) ||
        i.prodotto.toLowerCase().includes(needle) ||
        i.etichetta.toLowerCase().includes(needle)
      );
    });
  }, [impegni, q, tipoFiltro]);

  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filtrati) {
      m.set(i.dataGiorno, (m.get(i.dataGiorno) ?? 0) + 1);
    }
    return m;
  }, [filtrati]);

  const giorniElenco = useMemo(() => {
    const days =
      vista === "giorno"
        ? [anchor]
        : vista === "settimana"
          ? weekDaysFrom(anchor)
          : [...countByDay.keys()].sort();
    const focus = selected && days.includes(selected) ? [selected] : days;
    return focus
      .map((day) => ({
        day,
        items: filtrati
          .filter((i) => i.dataGiorno === day)
          .sort((a, b) => a.etichetta.localeCompare(b.etichetta, "it")),
      }))
      .filter((g) => g.items.length > 0 || vista !== "mese" || selected === g.day);
  }, [filtrati, vista, anchor, selected, countByDay]);

  const oggi = todayIso();
  const monthRows = monthMatrix(
    Number(anchor.slice(0, 4)),
    Number(anchor.slice(5, 7)) - 1
  );
  const weekDays = weekDaysFrom(anchor);

  function vai(delta: number) {
    setSelected(null);
    if (vista === "giorno") setAnchor(addDays(anchor, delta));
    else if (vista === "settimana") setAnchor(addDays(anchor, delta * 7));
    else setAnchor(addMonthsIso(anchor, delta));
  }

  function cellaGiorno(iso: string | null, wide?: boolean) {
    if (!iso) {
      return <div className="min-h-[5.5rem] rounded-lg bg-slate-50/60" />;
    }
    const n = countByDay.get(iso) ?? 0;
    const isToday = iso === oggi;
    const isSel = iso === selected;
    const wd = new Date(`${iso}T12:00:00`).getDay();
    const isWe = wd === 0 || wd === 6;
    return (
      <button
        type="button"
        onClick={() => {
          setSelected(iso);
          setAnchor(iso);
        }}
        className={`flex min-h-[5.5rem] flex-col rounded-lg border px-2 py-1.5 text-left transition ${
          isSel
            ? "border-sky-500 bg-sky-50 shadow-sm"
            : isToday
              ? "border-emerald-400 bg-white"
              : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
        } ${isWe ? "opacity-80" : ""}`}
      >
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
            isToday
              ? "bg-emerald-600 font-semibold text-white"
              : "font-medium text-slate-800"
          }`}
        >
          {Number(iso.slice(8, 10))}
        </span>
        {n > 0 ? (
          <span
            className={`mt-auto inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${
              n > 3
                ? "bg-amber-100 text-amber-950"
                : "bg-emerald-100 text-emerald-900"
            }`}
          >
            {n} {n === 1 ? "lavorazione" : "lavorazioni"}
          </span>
        ) : wide ? (
          <span className="mt-auto text-xs text-slate-400">Nessuna</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Calendario delle lavorazioni in scaletta. Ogni giorno mostra quante
        attività eseguire; sotto l’elenco raggruppato per data.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-0.5">
          {SCALETTA_VISTE.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setVista(v);
                setSelected(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                vista === v
                  ? "bg-[var(--primary)] text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => vai(-1)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-slate-50"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              setAnchor(oggi);
              setSelected(oggi);
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={() => vai(1)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-slate-50"
          >
            ›
          </button>
        </div>
        <p className="text-base font-semibold capitalize">
          {labelPeriodo(anchor, vista)}
        </p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtra numero, cliente, prodotto…"
          className="ml-auto min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <select
          value={tipoFiltro}
          onChange={(e) =>
            setTipoFiltro(e.target.value as ScalettaTipoImpegno | "tutte")
          }
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          <option value="tutte">Tutte le attività</option>
          {Object.entries(SCALETTA_TIPO_LABEL).map(([k, lab]) => (
            <option key={k} value={k}>
              {lab}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
        {vista === "mese" ? (
          <>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase text-slate-500">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthRows.flat().map((iso, idx) => (
                <div key={iso ?? `e-${idx}`}>{cellaGiorno(iso)}</div>
              ))}
            </div>
          </>
        ) : null}

        {vista === "settimana" ? (
          <>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase text-slate-500">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((iso) => (
                <div key={iso}>{cellaGiorno(iso, true)}</div>
              ))}
            </div>
          </>
        ) : null}

        {vista === "giorno" ? (
          <div className="max-w-sm">{cellaGiorno(anchor, true)}</div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">
          Attività per giorno
          {loading ? " · caricamento…" : ` · ${filtrati.length}`}
        </h3>
        {giorniElenco.length === 0 && !loading ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted)]">
            Nessuna lavorazione in questo periodo.
          </p>
        ) : null}
        {giorniElenco.map((g) => (
          <section
            key={g.day}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-white"
          >
            <header className="flex items-center justify-between bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold capitalize">
                {new Date(`${g.day}T12:00:00`).toLocaleDateString("it-IT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                {g.items.length}{" "}
                {g.items.length === 1 ? "lavorazione" : "lavorazioni"}
              </span>
            </header>
            <ul className="divide-y divide-slate-100">
              {g.items.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${classeTipo(i.tipo)}`}
                  >
                    {SCALETTA_TIPO_LABEL[i.tipo]}
                  </span>
                  <span className="font-mono font-medium">{i.numeroInterno}</span>
                  {i.prodotto ? (
                    <span className="text-slate-700">{i.prodotto}</span>
                  ) : null}
                  {i.cliente ? (
                    <span className="text-[var(--muted)]">{i.cliente}</span>
                  ) : null}
                  <span className="text-xs text-slate-500">{i.etichetta}</span>
                  {i.esecuzioneStato !== "aperta" ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        i.esecuzioneStato === "completata"
                          ? "bg-emerald-50 text-emerald-800"
                          : i.esecuzioneStato === "pronto_ritiro"
                            ? "bg-indigo-50 text-indigo-900"
                            : "bg-amber-100 text-amber-950"
                      }`}
                    >
                      {SCALETTA_ESECUZIONE_LABEL[i.esecuzioneStato]}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setApertoId(i.id)}
                    className="ml-auto rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                  >
                    Apri
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {senzaData.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-sm font-medium text-amber-950">
            In scaletta, in attesa di giorno
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-950">
            {senzaData.map((s) => (
              <li key={`${s.entityType}-${s.entityId}`}>
                <span className="font-mono">{s.numeroInterno}</span>
                {s.cliente ? ` · ${s.cliente}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {apertoId ? (
        <ScalettaImpegnoModal
          impegnoId={apertoId}
          onClose={() => setApertoId(null)}
          onChanged={(d) => {
            setImpegni((prev) =>
              prev.map((row) =>
                row.id === d.impegno.id
                  ? {
                      ...row,
                      esecuzioneStato: d.impegno.esecuzioneStato,
                      problemaNote: d.impegno.problemaNote,
                    }
                  : row
              )
            );
          }}
        />
      ) : null}
    </div>
  );
}
