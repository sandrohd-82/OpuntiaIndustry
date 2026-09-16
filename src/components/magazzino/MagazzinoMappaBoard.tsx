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
  formattaLunghezzaReale,
  formattaMisuraSegmento,
  formattaQuadrati,
  headingCardinale,
  MAPPA_LINEA_COLORE_DEFAULT,
  MAPPA_LINEA_COLORI,
  MAPPA_STATO_LABEL,
  MAPPA_VISTA_SUGGERITE,
  normalizzaColoreLinea,
  puntoDopoQuadrati,
  ruotaHeading,
  snapToGrid,
  verticiRettangolo,
  type MappaLinea,
  type MappaMagazzino,
  type MappaPunto,
  type MappaScalaUnita,
} from "@/lib/magazzino/mappa";

type Tool = "linea" | "seleziona" | "rettangolo" | "poligono";

type FormaStato = {
  tipo: "rettangolo" | "poligono";
  vertici: MappaPunto[];
  lati: number[];
  senso: 1 | -1;
};

function newLocalId(): string {
  return crypto.randomUUID();
}

function headingForma(
  forma: FormaStato,
  cursor: MappaPunto | null
): number {
  const from = forma.vertici[forma.vertici.length - 1];
  if (!from) return 0;
  if (forma.tipo === "rettangolo" && forma.vertici.length >= 2) {
    const h0 = headingCardinale(forma.vertici[0]!, forma.vertici[1]!);
    let h = h0;
    for (let i = 0; i < forma.lati.length; i += 1) {
      h = ruotaHeading(h, forma.senso);
    }
    return h;
  }
  return headingCardinale(from, cursor ?? { x: from.x + 1, y: from.y });
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
  const [scalaValore, setScalaValore] = useState(10);
  const [scalaUnita, setScalaUnita] = useState<MappaScalaUnita>("cm");
  const [spessore, setSpessore] = useState(6);
  const [colore, setColore] = useState(MAPPA_LINEA_COLORE_DEFAULT);
  const [tool, setTool] = useState<Tool>("linea");
  const [draftStart, setDraftStart] = useState<MappaPunto | null>(null);
  const [forma, setForma] = useState<FormaStato | null>(null);
  const [quadratiLato, setQuadratiLato] = useState(4);
  const [cursor, setCursor] = useState<MappaPunto | null>(null);
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
  const scalaOk = scalaValore > 0;

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
    setScalaValore(res.mappa.scalaValore);
    setScalaUnita(res.mappa.scalaUnita);
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

  function worldFromEvent(e: React.PointerEvent | React.WheelEvent): MappaPunto | null {
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

  function addLinea(a: MappaPunto, b: MappaPunto): string {
    const linea: MappaLinea = {
      id: newLocalId(),
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      spessore,
      colore,
      sortOrder: linee.length,
    };
    setLinee((prev) => [...prev, linea]);
    setSelectedId(linea.id);
    return linea.id;
  }

  const latoBloccato = useMemo(() => {
    if (!forma || forma.tipo !== "rettangolo") return null;
    if (forma.lati.length === 2) return forma.lati[0] ?? null;
    if (forma.lati.length === 3) return forma.lati[1] ?? null;
    return null;
  }, [forma]);

  const quadratiCorrenti =
    latoBloccato != null ? latoBloccato : Math.max(1, Math.round(quadratiLato) || 1);

  const previewForma = useMemo(() => {
    if (!forma || !canDraw) return null;
    const from = forma.vertici[forma.vertici.length - 1];
    if (!from) return null;
    const heading = headingForma(forma, snappedCursor);
    const n = quadratiCorrenti;
    const to = puntoDopoQuadrati(from, heading, n, griglia);
    let ghost: MappaPunto[] = [];
    if (forma.tipo === "rettangolo") {
      const h0 =
        forma.vertici.length >= 2
          ? headingCardinale(forma.vertici[0]!, forma.vertici[1]!)
          : heading;
      const a = forma.lati[0] ?? n;
      const b = forma.lati[1] ?? (forma.lati.length === 0 ? n : n);
      ghost = verticiRettangolo(forma.vertici[0]!, h0, a, b, forma.senso, griglia);
    }
    return { from, to, heading, ghost };
  }, [forma, canDraw, snappedCursor, quadratiCorrenti, griglia]);

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
    if (tool === "rettangolo" || tool === "poligono") {
      if (!forma) {
        setForma({
          tipo: tool,
          vertici: [snap],
          lati: [],
          senso: 1,
        });
        setSelectedId(null);
        setDraftStart(null);
      }
      return;
    }
    if (!draftStart) {
      setDraftStart(snap);
      setSelectedId(null);
      return;
    }
    if (draftStart.x === snap.x && draftStart.y === snap.y) return;
    addLinea(draftStart, snap);
    setDraftStart(null);
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

  function resetDisegno() {
    setDraftStart(null);
    setForma(null);
    setSelectedId(null);
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        if (ev.key === "Enter" && forma && canDraw) {
          ev.preventDefault();
          avantiLato();
        }
        return;
      }
      if (ev.key === "Escape") {
        resetDisegno();
      }
      if ((ev.key === "Delete" || ev.key === "Backspace") && canDraw && selectedId && !forma) {
        setLinee((prev) => prev.filter((l) => l.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function avantiLato() {
    if (!forma || !canDraw) return;
    const from = forma.vertici[forma.vertici.length - 1];
    if (!from) return;
    const n = quadratiCorrenti;
    if (n < 1) return;
    const heading = headingForma(forma, snappedCursor);
    const to = puntoDopoQuadrati(from, heading, n, griglia);
    if (to.x === from.x && to.y === from.y) return;
    addLinea(from, to);
    const nextVertici = [...forma.vertici, to];
    const nextLati = [...forma.lati, n];
    if (forma.tipo === "rettangolo" && nextLati.length >= 4) {
      const origine = nextVertici[0]!;
      if (to.x !== origine.x || to.y !== origine.y) {
        addLinea(to, origine);
      }
      setForma(null);
      setOk("Rettangolo chiuso.");
      return;
    }
    setForma({ ...forma, vertici: nextVertici, lati: nextLati });
  }

  function chiudiPoligono() {
    if (!forma || forma.tipo !== "poligono" || forma.vertici.length < 3) return;
    const last = forma.vertici[forma.vertici.length - 1]!;
    const first = forma.vertici[0]!;
    if (last.x !== first.x || last.y !== first.y) {
      addLinea(last, first);
    }
    setForma(null);
    setOk("Poligono chiuso.");
  }

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
      scalaValore,
      scalaUnita,
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
    setScalaValore(res.mappa.scalaValore);
    setScalaUnita(res.mappa.scalaUnita);
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

  const misuraTesto = useMemo(() => {
    if (previewForma) {
      return formattaMisuraSegmento(
        previewForma.from.x,
        previewForma.from.y,
        previewForma.to.x,
        previewForma.to.y,
        griglia,
        scalaValore,
        scalaUnita
      );
    }
    if (draftStart && snappedCursor) {
      return formattaMisuraSegmento(
        draftStart.x,
        draftStart.y,
        snappedCursor.x,
        snappedCursor.y,
        griglia,
        scalaValore,
        scalaUnita
      );
    }
    if (selectedId) {
      const l = linee.find((x) => x.id === selectedId);
      if (l) {
        return formattaMisuraSegmento(
          l.x1,
          l.y1,
          l.x2,
          l.y2,
          griglia,
          scalaValore,
          scalaUnita
        );
      }
    }
    return "";
  }, [
    previewForma,
    draftStart,
    snappedCursor,
    selectedId,
    linee,
    griglia,
    scalaValore,
    scalaUnita,
  ]);

  const latoIndice = forma ? forma.lati.length + 1 : 0;
  const latoTotale = forma?.tipo === "rettangolo" ? 4 : null;

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
            1 quadrato = {scalaValore} {scalaUnita}
            {" · "}
            {editing
              ? "Traccia a mano, oppure rettangolo/poligono lato per lato con Avanti. Rotella = zoom. Maiusc + trascina = sposta il foglio."
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
                disabled={saving || !vistaOk || !scalaOk}
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
            <label className="text-xs font-medium">
              1 quadrato =
              <input
                type="number"
                min={0.01}
                step="any"
                value={scalaValore}
                onChange={(e) =>
                  setScalaValore(Math.max(0.01, Number(e.target.value) || 10))
                }
                className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Unità
              <select
                value={scalaUnita}
                onChange={(e) => setScalaUnita(e.target.value as MappaScalaUnita)}
                className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </label>
            <label className="text-xs">
              Strumento
              <select
                value={tool}
                onChange={(e) => {
                  setTool(e.target.value as Tool);
                  setDraftStart(null);
                  setForma(null);
                }}
                className="ml-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="linea">Traccia linea</option>
                <option value="rettangolo">Rettangolo / quadrato</option>
                <option value="poligono">Poligono</option>
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

          {canDraw && (tool === "rettangolo" || tool === "poligono") ? (
            <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2">
              {!forma ? (
                <p className="text-sm text-teal-950">
                  Clicca il primo angolo. Poi muovi il mouse per la direzione del lato
                  evidenziato, indica i quadrati e premi Avanti.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-teal-950">
                    {forma.tipo === "rettangolo"
                      ? `Lato ${latoIndice} di ${latoTotale}`
                      : `Lato ${latoIndice}`}
                    {" · "}
                    {formattaQuadrati(quadratiCorrenti)} quadrati ·{" "}
                    {formattaLunghezzaReale(quadratiCorrenti, scalaValore, scalaUnita)}
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      Quadrati di questo lato
                      <input
                        type="number"
                        min={1}
                        max={500}
                        disabled={latoBloccato != null}
                        value={quadratiCorrenti}
                        onChange={(e) =>
                          setQuadratiLato(Math.max(1, Math.round(Number(e.target.value) || 1)))
                        }
                        className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1 text-sm disabled:bg-slate-100"
                      />
                    </label>
                    {forma.tipo === "rettangolo" && forma.lati.length === 0 ? (
                      <button
                        type="button"
                        className="rounded-lg border border-teal-700 px-2 py-1 text-xs font-medium text-teal-900 hover:bg-white"
                        onClick={() =>
                          setForma({ ...forma, senso: forma.senso === 1 ? -1 : 1 })
                        }
                      >
                        Inverti senso
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => avantiLato()}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Avanti
                    </button>
                    {forma.tipo === "poligono" && forma.vertici.length >= 3 ? (
                      <button
                        type="button"
                        onClick={() => chiudiPoligono()}
                        className="rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-white"
                      >
                        Chiudi forma
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setForma(null)}
                      className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
                    >
                      Annulla forma
                    </button>
                  </div>
                  {latoBloccato != null ? (
                    <p className="text-xs text-teal-900">
                      Questo lato ripete il lato opposto per chiudere il rettangolo.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
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
        {misuraTesto ? (
          <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-white/95 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm">
            {misuraTesto}
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
            {previewForma && previewForma.ghost.length === 4 ? (
              <polygon
                points={previewForma.ghost
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="rgba(15,118,110,0.08)"
                stroke="#0f766e"
                strokeWidth={Math.max(1, 1.5 / zoom)}
                strokeDasharray={`${8 / zoom} ${6 / zoom}`}
              />
            ) : null}
            {previewForma ? (
              <line
                x1={previewForma.from.x}
                y1={previewForma.from.y}
                x2={previewForma.to.x}
                y2={previewForma.to.y}
                stroke="#f59e0b"
                strokeWidth={spessore + Math.max(3, 6 / zoom)}
                strokeLinecap="square"
              />
            ) : null}
            {canDraw && !forma && draftStart && snappedCursor ? (
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
            {forma
              ? forma.vertici.map((p, i) => (
                  <circle
                    key={`${p.x}-${p.y}-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(3, 5 / zoom)}
                    fill="#0f766e"
                  />
                ))
              : null}
          </g>
        </svg>
      </div>
    </div>
  );
}
