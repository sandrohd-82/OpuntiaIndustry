"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  approvaMappaMagazzinoAction,
  getMappaMagazzinoAction,
  riapriProgettazioneMappaAction,
  salvaMappaMagazzinoAction,
} from "@/app/actions/magazzino-mappa";
import {
  distanzaPuntoSegmento,
  MAPPA_LINEA_COLORE_DEFAULT,
  MAPPA_LINEA_COLORI,
  MAPPA_STATO_LABEL,
  MAPPA_VISTA_SUGGERITE,
  normalizzaColoreLinea,
  snapToGrid,
  type MappaLinea,
  type MappaMagazzino,
} from "@/lib/magazzino/mappa";

type Tool = "linea" | "seleziona";

function newLocalId(): string {
  return crypto.randomUUID();
}

export function MagazzinoMappaBoard() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mappa, setMappa] = useState<MappaMagazzino | null>(null);
  const [canDesign, setCanDesign] = useState(false);
  const [linee, setLinee] = useState<MappaLinea[]>([]);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [griglia, setGriglia] = useState(20);
  const [vistaEtichetta, setVistaEtichetta] = useState("");
  const [spessore, setSpessore] = useState(6);
  const [colore, setColore] = useState(MAPPA_LINEA_COLORE_DEFAULT);
  const [tool, setTool] = useState<Tool>("linea");
  const [draftStart, setDraftStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panning, setPanning] = useState<{
    sx: number;
    sy: number;
    px: number;
    py: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const editing = Boolean(canDesign && mappa?.documentoStato === "bozza");
  const vistaOk = vistaEtichetta.trim().length > 0;
  const canDraw = editing && vistaOk;

  async function reload() {
    const res = await getMappaMagazzinoAction();
    if (!res.success) {
      setError(res.error);
      setMappa(null);
      return;
    }
    setMappa(res.mappa);
    setCanDesign(res.canDesign);
    setLinee(res.mappa.linee);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setPan({ x: res.mappa.viewX, y: res.mappa.viewY });
    setZoom(res.mappa.viewZoom);
    setGriglia(res.mappa.grigliaPx);
    setError(null);
  }

  useEffect(() => {
    void reload().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onNativeWheel = (ev: WheelEvent) => ev.preventDefault();
    svg.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onNativeWheel);
  }, [ready]);

  function worldFromEvent(e: React.PointerEvent | React.WheelEvent): {
    x: number;
    y: number;
  } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
  }

  const snappedCursor = useMemo(() => {
    if (!cursor) return null;
    return {
      x: snapToGrid(cursor.x, griglia),
      y: snapToGrid(cursor.y, griglia),
    };
  }, [cursor, griglia]);

  function hitLine(wx: number, wy: number): string | null {
    const tol = Math.max(8 / zoom, 4);
    let best: { id: string; d: number } | null = null;
    for (const l of linee) {
      const d = distanzaPuntoSegmento(wx, wy, l.x1, l.y1, l.x2, l.y2);
      const extra = l.spessore / 2;
      if (d <= tol + extra && (!best || d < best.d)) {
        best = { id: l.id, d };
      }
    }
    return best?.id ?? null;
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
      return;
    }
    if (e.button !== 0) return;
    const w = worldFromEvent(e);
    if (!w) return;
    const snap = {
      x: snapToGrid(w.x, griglia),
      y: snapToGrid(w.y, griglia),
    };
    if (!canDraw) {
      setSelectedId(hitLine(w.x, w.y));
      return;
    }
    if (tool === "seleziona") {
      const id = hitLine(w.x, w.y);
      setSelectedId(id);
      const sel = linee.find((l) => l.id === id);
      if (sel) {
        setSpessore(sel.spessore);
        setColore(sel.colore);
      }
      setDraftStart(null);
      return;
    }
    if (!draftStart) {
      setDraftStart(snap);
      setSelectedId(null);
      return;
    }
    if (draftStart.x === snap.x && draftStart.y === snap.y) return;
    const linea: MappaLinea = {
      id: newLocalId(),
      x1: draftStart.x,
      y1: draftStart.y,
      x2: snap.x,
      y2: snap.y,
      spessore,
      colore,
      sortOrder: linee.length,
    };
    setLinee((prev) => [...prev, linea]);
    setDraftStart(null);
    setSelectedId(linea.id);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (panning) {
      setPan({
        x: panning.px + (e.clientX - panning.sx),
        y: panning.py + (e.clientY - panning.sy),
      });
      return;
    }
    const w = worldFromEvent(e);
    setCursor(w);
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const w = worldFromEvent(e);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const next = Math.min(8, Math.max(0.25, zoom * factor));
    if (w) {
      setPan({
        x: e.clientX - (svgRef.current?.getBoundingClientRect().left ?? 0) - w.x * next,
        y: e.clientY - (svgRef.current?.getBoundingClientRect().top ?? 0) - w.y * next,
      });
    }
    setZoom(next);
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        return;
      }
      if (ev.key === "Escape") {
        setDraftStart(null);
        setSelectedId(null);
      }
      if ((ev.key === "Delete" || ev.key === "Backspace") && canDraw && selectedId) {
        setLinee((prev) => prev.filter((l) => l.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canDraw, selectedId]);

  function applySpessore(v: number) {
    setSpessore(v);
    if (selectedId && canDraw) {
      setLinee((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, spessore: v } : l))
      );
    }
  }

  function applyColore(v: string) {
    const next = normalizzaColoreLinea(v);
    setColore(next);
    if (selectedId && canDraw) {
      setLinee((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, colore: next } : l))
      );
    }
  }

  async function persist(): Promise<boolean> {
    if (!mappa) return false;
    setSaving(true);
    setError(null);
    setOk(null);
    const persisted = new Set(mappa.linee.map((l) => l.id));
    const res = await salvaMappaMagazzinoAction({
      mappaId: mappa.id,
      vistaEtichetta: vistaEtichetta.trim(),
      viewX: pan.x,
      viewY: pan.y,
      viewZoom: zoom,
      grigliaPx: griglia,
      linee: linee.map((l, i) => ({
        id: persisted.has(l.id) ? l.id : undefined,
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        spessore: l.spessore,
        colore: l.colore,
        sortOrder: i,
      })),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return false;
    }
    setMappa(res.mappa);
    setLinee(res.mappa.linee);
    setVistaEtichetta(res.mappa.vistaEtichetta);
    setOk("Pianta salvata.");
    return true;
  }

  async function salva() {
    await persist();
  }

  async function approva() {
    if (!mappa) return;
    const okSave = await persist();
    if (!okSave) return;
    const res = await approvaMappaMagazzinoAction(mappa.id);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMappa(res.mappa);
    setOk("Pianta approvata.");
  }

  async function riapri() {
    if (!mappa) return;
    const res = await riapriProgettazioneMappaAction(mappa.id);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMappa(res.mappa);
    setOk(`Progettazione riaperta (v${res.mappa.versione}).`);
  }

  const gridPatternId = "mappa-grid";
  const worldSize = 4000;

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento mappa…</p>;
  }
  if (!mappa) {
    return (
      <p className="text-sm text-[var(--muted)]">
        {error ?? "Nessuna pianta disponibile."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {mappa.nome} · v{mappa.versione} ·{" "}
            {MAPPA_STATO_LABEL[mappa.documentoStato]}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {vistaOk ? (
              <span className="font-medium text-slate-700">
                Vista: {vistaEtichetta.trim()}
              </span>
            ) : editing ? (
              "Prima imposta il testo Vista, poi traccia le linee."
            ) : (
              "Vista non impostata."
            )}
            {" · "}
            {editing
              ? "Clicca due punti per una linea retta. Seleziona una linea per cambiarne colore o spessore. Rotella = zoom. Maiusc + trascina = sposta il foglio. Canc = elimina."
              : canDesign
                ? "Pianta in sola lettura. Riapri la progettazione per disegnare."
                : "Pianta in sola lettura. Solo il Super Admin può disegnare gli scaffali."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDesign && mappa.documentoStato === "approvato" ? (
            <button
              type="button"
              onClick={() => void riapri()}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Riapri progettazione
            </button>
          ) : null}
          {editing ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void salva()}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva pianta e vista"}
              </button>
              <button
                type="button"
                disabled={saving || !vistaOk}
                onClick={() => void approva()}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Approva pianta
              </button>
            </>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3">
          <div>
            <label className="block text-xs font-medium">
              Vista
              <input
                type="text"
                value={vistaEtichetta}
                onChange={(e) => setVistaEtichetta(e.target.value)}
                placeholder="Es. Dall’alto, Lato fronte, Lato Dx"
                maxLength={80}
                className="mt-1 w-full max-w-md rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MAPPA_VISTA_SUGGERITE.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVistaEtichetta(v)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    vistaEtichetta.trim() === v
                      ? "border-teal-600 bg-teal-50 text-teal-900"
                      : "border-[var(--border)] bg-white hover:bg-slate-50"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Strumento
            <select
              value={tool}
              onChange={(e) => {
                setTool(e.target.value as Tool);
                setDraftStart(null);
              }}
              className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
            >
              <option value="linea">Traccia linea</option>
              <option value="seleziona">Seleziona</option>
            </select>
          </label>
          <label className="text-xs">
            Spessore linea
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              value={spessore}
              onChange={(e) => applySpessore(Number(e.target.value))}
              className="ml-2 align-middle"
            />
            <span className="ml-2 font-mono text-sm">{spessore} px</span>
          </label>
          <label className="text-xs">
            Colore linea
            <input
              type="color"
              value={colore}
              onChange={(e) => applyColore(e.target.value)}
              className="ml-2 h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5 align-middle"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {MAPPA_LINEA_COLORI.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colore ${c}`}
                onClick={() => applyColore(c)}
                className={`h-6 w-6 rounded-full border ${
                  colore === c ? "ring-2 ring-teal-600 ring-offset-1" : "border-slate-300"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <label className="text-xs">
            Griglia
            <input
              type="number"
              min={5}
              max={80}
              value={griglia}
              onChange={(e) => setGriglia(Math.max(5, Number(e.target.value) || 20))}
              className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1 text-sm"
            />
          </label>
          <span className="text-xs text-[var(--muted)]">
            Linee: {linee.length} · zoom {Math.round(zoom * 100)}%
          </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {ok}
        </p>
      ) : null}

      <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-slate-100">
        {vistaOk ? (
          <p className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-white/90 px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm">
            Vista: {vistaEtichetta.trim()}
          </p>
        ) : editing ? (
          <p className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Imposta prima il testo Vista (es. Dall’alto, Lato fronte, Lato Dx).
            Poi potrai tracciare le linee.
          </p>
        ) : null}
        <svg
          ref={svgRef}
          className={`h-[min(72vh,720px)] w-full touch-none bg-slate-50 ${
            canDraw ? "cursor-crosshair" : "cursor-default"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setPanning(null)}
          onPointerLeave={() => {
            setPanning(null);
            setCursor(null);
          }}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <pattern
              id={gridPatternId}
              width={griglia}
              height={griglia}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${griglia} 0 L 0 0 0 ${griglia}`}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={0.6}
              />
            </pattern>
          </defs>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <rect
              x={-200}
              y={-200}
              width={worldSize}
              height={worldSize}
              fill={`url(#${gridPatternId})`}
            />
            {linee.map((l) => (
              <g key={l.id}>
                {l.id === selectedId ? (
                  <line
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke="#f59e0b"
                    strokeWidth={l.spessore + Math.max(4, 8 / zoom)}
                    strokeLinecap="square"
                  />
                ) : null}
                <line
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={l.colore || MAPPA_LINEA_COLORE_DEFAULT}
                  strokeWidth={l.spessore}
                  strokeLinecap="square"
                />
              </g>
            ))}
            {canDraw && draftStart && snappedCursor ? (
              <line
                x1={draftStart.x}
                y1={draftStart.y}
                x2={snappedCursor.x}
                y2={snappedCursor.y}
                stroke={colore}
                strokeWidth={spessore}
                strokeDasharray="8 6"
                strokeLinecap="square"
              />
            ) : null}
            {canDraw && snappedCursor ? (
              <circle
                cx={snappedCursor.x}
                cy={snappedCursor.y}
                r={Math.max(3, 6 / zoom)}
                fill={colore}
              />
            ) : null}
          </g>
        </svg>
      </div>
    </div>
  );
}
