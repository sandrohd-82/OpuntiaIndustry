"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getMappaByIdAction,
  importaRiferimentiDaVistaAction,
  listMappeStessoLuogoAction,
} from "@/app/actions/magazzino-mappa";
import {
  distanzaPuntoSegmento,
  formattaQuadrati,
  formattaLunghezzaReale,
  MAPPA_IMPORT_ROTAZIONE_LABEL,
  MAPPA_IMPORT_ROTAZIONI,
  MAPPA_LINEA_COLORE_DEFAULT,
  type MappaImportRotazione,
  type MappaMagazzino,
  type MappaPunto,
} from "@/lib/magazzino/mappa";
import {
  etichettaAsseOrigine,
  misuraAsseQuadrati,
  misureRettangoloDestImporto,
  rettangoloLimiteDisegno,
  type ImportaEsito,
  type MappaAsseOrigine,
  type MappaImportModalita,
  type MappaRettangolo,
} from "@/lib/magazzino/riferimenti";

type PuntoBozza = { etichetta: string; offsetQuadrati: number };
type PuntoSel = { id: string; etichetta: string; x: number; y: number };
type VistaBox = { x: number; y: number; w: number; h: number };

const IMPORT_ZOOM_MIN = 1;
const IMPORT_ZOOM_MAX = 16;
const IMPORT_ZOOM_STEP = 1.25;

function boxValido(b: VistaBox): boolean {
  return (
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.w) &&
    Number.isFinite(b.h) &&
    b.w > 0 &&
    b.h > 0
  );
}

function newId(): string {
  return crypto.randomUUID();
}

export function ImportaRiferimentiVista({
  open,
  destMappaId,
  luogoNome,
  destGriglia,
  destScalaValore,
  destScalaUnita,
  onClose,
  onApplied,
}: {
  open: boolean;
  destMappaId: string;
  luogoNome: string;
  destGriglia: number;
  destScalaValore: number;
  destScalaUnita: "cm" | "m";
  onClose: () => void;
  onApplied: (mappa: MappaMagazzino, esito: ImportaEsito) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragMoved = useRef(false);
  const panStart = useRef<{
    sx: number;
    sy: number;
    vx: number;
    vy: number;
  } | null>(null);
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [source, setSource] = useState<MappaMagazzino | null>(null);
  const [modalita, setModalita] = useState<MappaImportModalita | null>(null);
  const [usaLimite, setUsaLimite] = useState(false);
  const [limiteKey, setLimiteKey] = useState("bbox");
  const [asse, setAsse] = useState<MappaAsseOrigine>("x");
  const [rotazione, setRotazione] = useState<MappaImportRotazione>(0);
  const [altezzaQ, setAltezzaQ] = useState(20);
  const [puntiAsse, setPuntiAsse] = useState<PuntoBozza[]>([]);
  const [puntoLabel, setPuntoLabel] = useState("");
  const [lineeSel, setLineeSel] = useState<string[]>([]);
  const [areeSel, setAreeSel] = useState<string[]>([]);
  const [puntiSel, setPuntiSel] = useState<PuntoSel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vista, setVista] = useState<VistaBox | null>(null);
  const [trascinando, setTrascinando] = useState(false);
  const vistaRef = useRef<VistaBox | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSourceId("");
    setSource(null);
    setModalita(null);
    setUsaLimite(false);
    setPuntiAsse([]);
    setPuntiSel([]);
    setLineeSel([]);
    setAreeSel([]);
    setLimiteKey("bbox");
    setAsse("x");
    setRotazione(0);
    void listMappeStessoLuogoAction(luogoNome, destMappaId).then((res) => {
      if (!res.success) {
        setError(res.error);
        return;
      }
      setItems(res.items);
    });
  }, [open, luogoNome, destMappaId]);

  useEffect(() => {
    if (!sourceId) {
      setSource(null);
      return;
    }
    void getMappaByIdAction(sourceId).then((res) => {
      if (!res.success) {
        setError(res.error);
        setSource(null);
        return;
      }
      setSource(res.mappa);
      setPuntiAsse([]);
      setPuntiSel([]);
      setLineeSel([]);
      setAreeSel([]);
      setLimiteKey("bbox");
    });
  }, [sourceId]);

  const limite = useMemo((): MappaRettangolo | null => {
    if (!source || !usaLimite) return null;
    const aree = source.aree ?? [];
    const linee = source.linee ?? [];
    if (limiteKey !== "bbox") {
      const a = aree.find((x) => x.id === limiteKey);
      if (a) return { x: a.x, y: a.y, width: a.width, height: a.height };
    }
    return rettangoloLimiteDisegno(linee, aree, source.grigliaPx);
  }, [source, limiteKey, usaLimite]);

  const larghezzaQ =
    limite && source ? misuraAsseQuadrati(limite, asse, source.grigliaPx) : 0;

  const previewBox = useMemo((): VistaBox => {
    if (!source) return { x: 0, y: 0, w: 400, h: 280 };
    const pts: MappaPunto[] = [];
    for (const l of source.linee ?? []) {
      pts.push({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
    }
    for (const a of source.aree ?? []) {
      pts.push({ x: a.x, y: a.y }, { x: a.x + a.width, y: a.y + a.height });
    }
    for (const p of puntiSel) pts.push({ x: p.x, y: p.y });
    if (limite) {
      pts.push(
        { x: limite.x, y: limite.y },
        { x: limite.x + limite.width, y: limite.y + limite.height }
      );
    }
    const validi = pts.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
    );
    if (!validi.length) return { x: 0, y: 0, w: 400, h: 280 };
    const minX = Math.min(...validi.map((p) => p.x));
    const minY = Math.min(...validi.map((p) => p.y));
    const maxX = Math.max(...validi.map((p) => p.x));
    const maxY = Math.max(...validi.map((p) => p.y));
    const pad = Math.max(8, (source.grigliaPx || 20) * 2);
    return {
      x: minX - pad,
      y: minY - pad,
      w: Math.max(40, maxX - minX + pad * 2),
      h: Math.max(40, maxY - minY + pad * 2),
    };
  }, [source, limite, puntiSel]);

  const camera = vista && boxValido(vista) ? vista : previewBox;
  const zoomAttuale = previewBox.w / camera.w;
  const nSel = lineeSel.length + areeSel.length + puntiSel.length;
  const canApply = Boolean(
    source &&
      modalita &&
      (modalita === "oggetto"
        ? nSel > 0
        : nSel > 0 || (usaLimite && limite))
  );

  function applicaVista(next: VistaBox) {
    if (!boxValido(next)) return;
    vistaRef.current = next;
    setVista(next);
  }

  function fitPreview() {
    applicaVista(previewBox);
  }

  function worldFromEvent(e: { clientX: number; clientY: number }): MappaPunto | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const cam = vistaRef.current ?? camera;
    try {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(ctm.inverse());
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          return { x: p.x, y: p.y };
        }
      }
    } catch {
      /* fallback sotto */
    }
    const r = svg.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return {
      x: cam.x + ((e.clientX - r.left) / r.width) * cam.w,
      y: cam.y + ((e.clientY - r.top) / r.height) * cam.h,
    };
  }

  function applicaZoom(factor: number, schermo?: { x: number; y: number }) {
    const svg = svgRef.current;
    const cam = vistaRef.current ?? camera;
    const r = svg?.getBoundingClientRect();
    const rx = r && schermo && r.width > 0 ? (schermo.x - r.left) / r.width : 0.5;
    const ry = r && schermo && r.height > 0 ? (schermo.y - r.top) / r.height : 0.5;
    const wx = cam.x + rx * cam.w;
    const wy = cam.y + ry * cam.h;
    const nextZ = Math.min(
      IMPORT_ZOOM_MAX,
      Math.max(IMPORT_ZOOM_MIN, (previewBox.w / cam.w) * factor)
    );
    const nextW = previewBox.w / nextZ;
    const nextH = previewBox.h / nextZ;
    applicaVista({
      x: wx - rx * nextW,
      y: wy - ry * nextH,
      w: nextW,
      h: nextH,
    });
  }

  useLayoutEffect(() => {
    if (!open || !source) return;
    applicaVista(previewBox);
  }, [open, source?.id, previewBox.x, previewBox.y, previewBox.w, previewBox.h]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !source) return;
    const onNativeWheel = (ev: WheelEvent) => ev.preventDefault();
    svg.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onNativeWheel);
  }, [source]);

  function tolleranzaHit(): number {
    const svg = svgRef.current;
    const w = svg?.getBoundingClientRect().width || 1;
    return Math.max(4, (camera.w / w) * 10);
  }

  function toggleLinea(id: string) {
    setLineeSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleArea(id: string) {
    setAreeSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selezionaSuPunto(p: MappaPunto) {
    if (!source) return;
    const toll = tolleranzaHit();
    let bestLinea: { id: string; dist: number } | null = null;
    for (const l of source.linee ?? []) {
      const d = distanzaPuntoSegmento(p.x, p.y, l.x1, l.y1, l.x2, l.y2);
      if (d <= toll && (!bestLinea || d < bestLinea.dist)) {
        bestLinea = { id: l.id, dist: d };
      }
    }
    if (bestLinea) {
      toggleLinea(bestLinea.id);
      return;
    }
    const area = (source.aree ?? []).find(
      (a) =>
        p.x >= a.x &&
        p.x <= a.x + a.width &&
        p.y >= a.y &&
        p.y <= a.y + a.height
    );
    if (area) {
      toggleArea(area.id);
      return;
    }
    let near: MappaPunto = p;
    let nearDist = toll;
    for (const l of source.linee ?? []) {
      for (const q of [
        { x: l.x1, y: l.y1 },
        { x: l.x2, y: l.y2 },
      ]) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < nearDist) {
          nearDist = d;
          near = q;
        }
      }
    }
    for (const a of source.aree ?? []) {
      const corners = [
        { x: a.x, y: a.y },
        { x: a.x + a.width, y: a.y },
        { x: a.x, y: a.y + a.height },
        { x: a.x + a.width, y: a.y + a.height },
      ];
      for (const q of corners) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < nearDist) {
          nearDist = d;
          near = q;
        }
      }
    }
    const nome = puntoLabel.trim() || `Partenza ${puntiSel.length + 1}`;
    setPuntiSel((prev) => [
      ...prev,
      { id: newId(), etichetta: nome, x: near.x, y: near.y },
    ]);
    setPuntoLabel("");
  }

  async function applica() {
    if (!source || !modalita) {
      setError("Scegli la pianta origine e se importare come riferimento o oggetto reale.");
      return;
    }
    if (modalita === "oggetto" && nSel < 1) {
      setError("Per un oggetto reale seleziona almeno un punto, una linea o un quadrato.");
      return;
    }
    if (nSel < 1 && !(usaLimite && limite)) {
      setError("Seleziona almeno un punto, una linea o un quadrato sulla pianta.");
      return;
    }
    setBusy(true);
    setError(null);
    const destMisure =
      usaLimite && limite
        ? misureRettangoloDestImporto(
            asse,
            larghezzaQ,
            Math.max(1, Math.round(altezzaQ)),
            destGriglia
          )
        : null;
    const res = await importaRiferimentiDaVistaAction({
      mappaId: destMappaId,
      mappaOrigineId: source.id,
      modalita,
      usaLimite,
      asseOrigine: asse,
      origineX: limite?.x,
      origineY: limite?.y,
      origineW: limite?.width,
      origineH: limite?.height,
      limiteWidthQ:
        usaLimite && limite ? larghezzaQ : undefined,
      limiteHeightQ:
        usaLimite && limite ? Math.max(1, Math.round(altezzaQ)) : undefined,
      destX: 0,
      destY: 0,
      destWidth: destMisure?.destWidth,
      destHeight: destMisure?.destHeight,
      rotazione,
      elementi: [
        ...lineeSel.map((id) => ({ tipo: "linea" as const, origineId: id })),
        ...areeSel.map((id) => ({ tipo: "rettangolo" as const, origineId: id })),
        ...puntiSel.map((p) => ({
          tipo: "punto" as const,
          etichetta: p.etichetta,
          x: p.x,
          y: p.y,
        })),
      ],
      punti: usaLimite ? puntiAsse : [],
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onApplied(res.mappa, res.esito);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-teal-300 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-teal-950">
              Importa da vista
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Clicca punti, linee o quadrati sulla pianta origine. Restano
              allineati al quadrato-margine del foglio. Scegli l&apos;angolazione
              (es. 90° antiorario: il lato destro della vista dall&apos;alto
              diventa il fronte della vista destra). Poi riferimento o oggetto
              reale.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-amber-800">
            Nessun&apos;altra pianta collegata a «{luogoNome}». Salva e collega
            prima la vista di origine (es. Dall&apos;alto).
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium">
              Pianta origine
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Scegli…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.label}
                  </option>
                ))}
              </select>
            </label>

            {source ? (
              <div>
                <p className="text-xs font-semibold text-teal-950">
                  Come vuoi importare?
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setModalita("riferimento")}
                    className={`rounded-xl border px-3 py-2.5 text-left ${
                      modalita === "riferimento"
                        ? "border-amber-500 bg-amber-50 ring-2 ring-amber-300"
                        : "border-slate-300 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-amber-950">
                      Riferimento / calco
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Linee e punti solo come guida: parti da lì o ricalchi il
                      disegno. Non diventano oggetti della pianta.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalita("oggetto")}
                    className={`rounded-xl border px-3 py-2.5 text-left ${
                      modalita === "oggetto"
                        ? "border-teal-600 bg-teal-50 ring-2 ring-teal-300"
                        : "border-slate-300 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-teal-950">
                      Oggetto reale
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Importa davvero la linea, il quadrato o il punto: diventa
                      oggetto modificabile della bozza.
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {source ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setLineeSel((source.linee ?? []).map((l) => l.id))
                }
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
              >
                Tutte le linee
              </button>
              <button
                type="button"
                onClick={() => setAreeSel((source.aree ?? []).map((a) => a.id))}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
              >
                Tutti i quadrati
              </button>
              <button
                type="button"
                onClick={() => {
                  setLineeSel([]);
                  setAreeSel([]);
                  setPuntiSel([]);
                }}
                className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                Svuota selezione
              </button>
              <span className="text-xs text-slate-600">
                {nSel} selezionat{nSel === 1 ? "o" : "i"} · clic su linea o
                quadrato per alternare, clic vuoto per un punto di partenza
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applicaZoom(1 / IMPORT_ZOOM_STEP)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium hover:bg-slate-50"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => applicaZoom(IMPORT_ZOOM_STEP)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium hover:bg-slate-50"
              >
                +
              </button>
              <span className="text-xs text-slate-600">
                zoom {Math.round(zoomAttuale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => fitPreview()}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
              >
                Adatta
              </button>
            </div>
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
              <svg
                ref={svgRef}
                viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}
                preserveAspectRatio="xMidYMid meet"
                className={`h-96 w-full touch-none bg-white ${
                  trascinando ? "cursor-grabbing" : "cursor-crosshair"
                }`}
                onWheel={(e) => {
                  e.preventDefault();
                  applicaZoom(
                    e.deltaY < 0 ? IMPORT_ZOOM_STEP : 1 / IMPORT_ZOOM_STEP,
                    { x: e.clientX, y: e.clientY }
                  );
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  dragMoved.current = false;
                  const cam = vistaRef.current ?? camera;
                  panStart.current = {
                    sx: e.clientX,
                    sy: e.clientY,
                    vx: cam.x,
                    vy: cam.y,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const start = panStart.current;
                  const svg = svgRef.current;
                  if (!start || !svg) return;
                  const dx = e.clientX - start.sx;
                  const dy = e.clientY - start.sy;
                  if (Math.hypot(dx, dy) <= 4) return;
                  dragMoved.current = true;
                  setTrascinando(true);
                  const r = svg.getBoundingClientRect();
                  const cam = vistaRef.current ?? camera;
                  if (r.width < 1 || r.height < 1) return;
                  applicaVista({
                    x: start.vx - (dx / r.width) * cam.w,
                    y: start.vy - (dy / r.height) * cam.h,
                    w: cam.w,
                    h: cam.h,
                  });
                }}
                onPointerUp={(e) => {
                  if (e.button !== 0) return;
                  const eraTrascino = dragMoved.current;
                  panStart.current = null;
                  setTrascinando(false);
                  if (eraTrascino) return;
                  const w = worldFromEvent(e);
                  if (w) selezionaSuPunto(w);
                }}
                onPointerCancel={() => {
                  panStart.current = null;
                  setTrascinando(false);
                }}
              >
                <rect
                  x={camera.x}
                  y={camera.y}
                  width={camera.w}
                  height={camera.h}
                  fill="#ffffff"
                />
                {limite ? (
                  <rect
                    x={limite.x}
                    y={limite.y}
                    width={limite.width}
                    height={limite.height}
                    fill="rgba(13,148,136,0.08)"
                    stroke="#0f766e"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {(source.aree ?? []).map((a) => {
                  const sel = areeSel.includes(a.id);
                  return (
                    <rect
                      key={a.id}
                      x={a.x}
                      y={a.y}
                      width={a.width}
                      height={a.height}
                      fill={sel ? "rgba(217,119,6,0.22)" : "rgba(13,148,136,0.10)"}
                      stroke={sel ? "#d97706" : "#0d9488"}
                      strokeWidth={sel ? 2.4 : 1}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
                {(source.linee ?? []).map((l) => {
                  const sel = lineeSel.includes(l.id);
                  return (
                    <line
                      key={l.id}
                      x1={l.x1}
                      y1={l.y1}
                      x2={l.x2}
                      y2={l.y2}
                      stroke={sel ? "#d97706" : l.colore || MAPPA_LINEA_COLORE_DEFAULT}
                      strokeWidth={sel ? Math.max(l.spessore, 3) : l.spessore}
                    />
                  );
                })}
                {puntiSel.map((p) => (
                  <g key={p.id}>
                    <circle cx={p.x} cy={p.y} r={5} fill="#d97706" />
                    <text
                      x={p.x + 6}
                      y={p.y - 6}
                      fill="#92400e"
                      fontSize={12}
                      fontWeight={600}
                    >
                      {p.etichetta}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs">
                Nome prossimo punto
                <input
                  value={puntoLabel}
                  onChange={(e) => setPuntoLabel(e.target.value)}
                  placeholder="Es. Inizio scaffale A"
                  className="ml-1 w-56 rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              {puntiSel.length ? (
                <button
                  type="button"
                  onClick={() => setPuntiSel((prev) => prev.slice(0, -1))}
                  className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Togli ultimo punto
                </button>
              ) : null}
            </div>

            <label className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={usaLimite}
                onChange={(e) => setUsaLimite(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Usa anche un quadrato limite</span>
                <span className="block text-xs text-slate-600">
                  Facoltativo. Serve solo se vuoi copiare la misura di un
                  rettangolo (asse + secondo lato). Non è obbligatorio per
                  importare punti o linee.
                </span>
              </span>
            </label>

            {usaLimite ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium">
                  Quadrato limite
                  <select
                    value={limiteKey}
                    onChange={(e) => setLimiteKey(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="bbox">
                      Rettangolo che racchiude il disegno
                    </option>
                    {(source.aree ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        Area {a.codice} — {a.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium">
                  Asse da copiare
                  <select
                    value={asse}
                    onChange={(e) => setAsse(e.target.value as MappaAsseOrigine)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="x">{etichettaAsseOrigine("x")}</option>
                    <option value="y">{etichettaAsseOrigine("y")}</option>
                  </select>
                </label>
                <label className="block text-xs font-medium">
                  Secondo lato (altezza in questa vista)
                  <input
                    type="number"
                    min={1}
                    value={altezzaQ}
                    onChange={(e) =>
                      setAltezzaQ(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                {limite ? (
                  <p className="self-end text-xs text-teal-900">
                    Misura asse: {formattaQuadrati(larghezzaQ)} q ·{" "}
                    {formattaLunghezzaReale(
                      larghezzaQ,
                      destScalaValore,
                      destScalaUnita
                    )}
                  </p>
                ) : (
                  <p className="self-end text-xs text-amber-800">
                    Nessun rettangolo da usare come limite su questa pianta.
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
              <p className="text-xs font-semibold text-violet-950">
                Angolazione sul foglio destinazione
              </p>
              <p className="mt-0.5 text-[11px] text-violet-900">
                Gli oggetti restano nella stessa posizione rispetto ai margini
                laterali del quadrato-foglio. 90° antiorario: ciò che sta sul
                lato destro della vista dall&apos;alto si vede di fronte nella
                vista destra.
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {MAPPA_IMPORT_ROTAZIONI.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRotazione(r)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium ${
                      rotazione === r
                        ? "border-violet-700 bg-violet-700 text-white"
                        : "border-violet-300 bg-white text-violet-950 hover:bg-violet-100"
                    }`}
                  >
                    {MAPPA_IMPORT_ROTAZIONE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs text-teal-950">
              <p className="font-semibold">Verrà importato</p>
              <p className="mt-1">
                {modalita === "oggetto"
                  ? "Oggetti reali: "
                  : modalita === "riferimento"
                    ? "Calco di riferimento: "
                    : "Scegli prima riferimento o oggetto reale. "}
                {lineeSel.length} line{lineeSel.length === 1 ? "a" : "e"},{" "}
                {areeSel.length} quadrat{areeSel.length === 1 ? "o" : "i"},{" "}
                {puntiSel.length} punt{puntiSel.length === 1 ? "o" : "i"}
                {usaLimite ? " · più il quadrato limite" : ""}
                {` · ${MAPPA_IMPORT_ROTAZIONE_LABEL[rotazione]}`}.
              </p>
            </div>
          </>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy || !canApply}
            onClick={() => void applica()}
            className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Importo…" : "Applica sulla bozza"}
          </button>
        </div>
      </div>
    </div>
  );
}
