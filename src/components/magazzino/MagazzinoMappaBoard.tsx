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
  MAPPA_STATO_LABEL,
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
  const [spessore, setSpessore] = useState(6);
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
    if (!editing) {
      setSelectedId(hitLine(w.x, w.y));
      return;
    }
    if (tool === "seleziona") {
      const id = hitLine(w.x, w.y);
      setSelectedId(id);
      const sel = linee.find((l) => l.id === id);
      if (sel) setSpessore(sel.spessore);
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
      if (ev.key === "Escape") {
        setDraftStart(null);
        setSelectedId(null);
      }
      if ((ev.key === "Delete" || ev.key === "Backspace") && editing && selectedId) {
        setLinee((prev) => prev.filter((l) => l.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selectedId]);

  function applySpessore(v: number) {
    setSpessore(v);
    if (selectedId && editing) {
      setLinee((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, spessore: v } : l))
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
            {editing
              ? "Clicca due punti per una linea retta. Rotella = zoom. Maiusc + trascina = sposta la vista. Canc = elimina la linea selezionata."
              : canDesign
                ? "Pianta in sola lettura. Riapri la progettazione per disegnare."
                : "Vista della pianta. Solo il Super Admin può disegnare gli scaffali."}
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
                disabled={saving}
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
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
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

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-slate-100">
        <svg
          ref={svgRef}
          className="h-[min(72vh,720px)] w-full touch-none cursor-crosshair bg-slate-50"
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
              <line
                key={l.id}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={l.id === selectedId ? "#0f766e" : "#0f172a"}
                strokeWidth={l.spessore}
                strokeLinecap="square"
              />
            ))}
            {editing && draftStart && snappedCursor ? (
              <line
                x1={draftStart.x}
                y1={draftStart.y}
                x2={snappedCursor.x}
                y2={snappedCursor.y}
                stroke="#0f766e"
                strokeWidth={spessore}
                strokeDasharray="8 6"
                strokeLinecap="square"
              />
            ) : null}
            {editing && snappedCursor ? (
              <circle
                cx={snappedCursor.x}
                cy={snappedCursor.y}
                r={Math.max(3, 6 / zoom)}
                fill="#0f766e"
              />
            ) : null}
          </g>
        </svg>
      </div>
    </div>
  );
}
