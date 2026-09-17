"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getMappaByIdAction,
  importaRiferimentiDaVistaAction,
  listMappeStessoLuogoAction,
} from "@/app/actions/magazzino-mappa";
import {
  formattaQuadrati,
  formattaLunghezzaReale,
  MAPPA_LINEA_COLORE_DEFAULT,
  type MappaMagazzino,
  type MappaPunto,
} from "@/lib/magazzino/mappa";
import {
  dettaglioAngoliImporto,
  dettaglioLatiImporto,
  etichettaAsseOrigine,
  etichettaPuntoDaCoordinate,
  misuraAsseQuadrati,
  offsetSuLimite,
  puntiDaGeometriaOrigine,
  rettangoloLimiteDisegno,
  unisciPuntiImporto,
  type MappaAsseOrigine,
  type MappaRettangolo,
} from "@/lib/magazzino/riferimenti";

type PuntoBozza = { etichetta: string; offsetQuadrati: number };
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
  onApplied: (mappa: MappaMagazzino) => void;
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
  const [limiteKey, setLimiteKey] = useState("bbox");
  const [asse, setAsse] = useState<MappaAsseOrigine>("x");
  const [altezzaQ, setAltezzaQ] = useState(20);
  const [punti, setPunti] = useState<PuntoBozza[]>([]);
  const [puntoLabel, setPuntoLabel] = useState("");
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
    setPunti([]);
    setLimiteKey("bbox");
    setAsse("x");
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
      setPunti([]);
      setLimiteKey("bbox");
    });
  }, [sourceId]);

  const limite = useMemo((): MappaRettangolo | null => {
    if (!source) return null;
    const aree = source.aree ?? [];
    const linee = source.linee ?? [];
    if (limiteKey !== "bbox") {
      const a = aree.find((x) => x.id === limiteKey);
      if (a) return { x: a.x, y: a.y, width: a.width, height: a.height };
    }
    return rettangoloLimiteDisegno(linee, aree, source.grigliaPx);
  }, [source, limiteKey]);

  const larghezzaQ = limite && source
    ? misuraAsseQuadrati(limite, asse, source.grigliaPx)
    : 0;

  const previewBox = useMemo((): VistaBox => {
    if (!source) return { x: 0, y: 0, w: 400, h: 280 };
    const pts: MappaPunto[] = [];
    for (const l of source.linee ?? []) {
      pts.push({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
    }
    for (const a of source.aree ?? []) {
      pts.push({ x: a.x, y: a.y }, { x: a.x + a.width, y: a.y + a.height });
    }
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
  }, [source, limite]);

  const camera = vista && boxValido(vista) ? vista : previewBox;
  const zoomAttuale = previewBox.w / camera.w;

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

  const anteprimaImporto = useMemo(() => {
    if (!source || !limite) {
      return { punti: [] as PuntoBozza[], angoli: [], lati: [] };
    }
    const hQ = Math.max(1, Math.round(altezzaQ));
    const g = destGriglia > 0 ? destGriglia : 20;
    const gruppo = {
      asseOrigine: asse,
      origineW: limite.width,
      origineH: limite.height,
      limiteWidthQ: larghezzaQ,
      limiteHeightQ: hQ,
      destX: 0,
      destY: 0,
      destWidth: Math.max(1, larghezzaQ * g),
      destHeight: hQ * g,
    };
    return {
      punti: unisciPuntiImporto(
        puntiDaGeometriaOrigine(
          source.linee ?? [],
          source.aree ?? [],
          limite,
          asse,
          source.grigliaPx
        ),
        punti
      ),
      angoli: dettaglioAngoliImporto(gruppo),
      lati: dettaglioLatiImporto(gruppo),
    };
  }, [source, limite, asse, punti, altezzaQ, destGriglia, larghezzaQ]);

  function addPunto(p: MappaPunto) {
    if (!source || !limite) return;
    const offset = offsetSuLimite(p, limite, asse, source.grigliaPx);
    const nome = puntoLabel.trim() || `Rif. ${punti.length + 1}`;
    const etichetta = etichettaPuntoDaCoordinate(
      nome,
      p,
      limite,
      source.grigliaPx
    );
    setPunti((prev) => [...prev, { etichetta, offsetQuadrati: offset }]);
    setPuntoLabel("");
  }

  async function applica() {
    if (!source || !limite || larghezzaQ < 1) {
      setError("Scegli una pianta origine e un quadrato limite.");
      return;
    }
    const hQ = Math.max(1, Math.round(altezzaQ));
    const g = destGriglia > 0 ? destGriglia : 20;
    setBusy(true);
    setError(null);
    const res = await importaRiferimentiDaVistaAction({
      mappaId: destMappaId,
      mappaOrigineId: source.id,
      asseOrigine: asse,
      origineX: limite.x,
      origineY: limite.y,
      origineW: limite.width,
      origineH: limite.height,
      limiteWidthQ: larghezzaQ,
      limiteHeightQ: hQ,
      destX: 0,
      destY: 0,
      destWidth: larghezzaQ * g,
      destHeight: hQ * g,
      punti,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onApplied(res.mappa);
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
              Copia la misura condivisa del quadrato limite e i punti (inizio/fine
              scaffale). Il secondo lato lo imposti tu: in vista frontale è
              l&apos;altezza, non più la profondità.
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <label className="block text-xs font-medium">
              Quadrato limite
              <select
                value={limiteKey}
                onChange={(e) => setLimiteKey(e.target.value)}
                disabled={!source}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
              >
                <option value="bbox">Rettangolo che racchiude il disegno</option>
                {(source?.aree ?? []).map((a) => (
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
                onChange={(e) => setAltezzaQ(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}

        {source && limite ? (
          <>
            <p className="mt-3 text-sm text-teal-950">
              Misura copiata:{" "}
              <strong>
                {formattaQuadrati(larghezzaQ)} quadrati ·{" "}
                {formattaLunghezzaReale(
                  larghezzaQ,
                  destScalaValore,
                  destScalaUnita
                )}
              </strong>
              {" · "}secondo lato: {formattaQuadrati(Math.max(1, altezzaQ))}{" "}
              quadrati ·{" "}
              {formattaLunghezzaReale(
                Math.max(1, altezzaQ),
                destScalaValore,
                destScalaUnita
              )}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Si importano angoli, lati e estremi del disegno origine (non solo
              la linea guida). Zoomma per i punti extra. Clic = punto con
              coordinate da-a.
            </p>
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
                  if (w) addPunto(w);
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
                {(source.aree ?? []).map((a) => (
                  <rect
                    key={a.id}
                    x={a.x}
                    y={a.y}
                    width={a.width}
                    height={a.height}
                    fill="rgba(13,148,136,0.10)"
                    stroke="#0d9488"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {(source.linee ?? []).map((l) => (
                  <line
                    key={l.id}
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke={l.colore || MAPPA_LINEA_COLORE_DEFAULT}
                    strokeWidth={l.spessore}
                  />
                ))}
                {punti.map((p, i) => {
                  const g = source.grigliaPx > 0 ? source.grigliaPx : 20;
                  const x =
                    asse === "x"
                      ? limite.x + p.offsetQuadrati * g
                      : limite.x + limite.width / 2;
                  const y =
                    asse === "y"
                      ? limite.y + p.offsetQuadrati * g
                      : limite.y + limite.height / 2;
                  return (
                    <g key={`${p.etichetta}-${i}`}>
                      {asse === "x" ? (
                        <line
                          x1={x}
                          y1={limite.y}
                          x2={x}
                          y2={limite.y + limite.height}
                          stroke="#d97706"
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : (
                        <line
                          x1={limite.x}
                          y1={y}
                          x2={limite.x + limite.width}
                          y2={y}
                          stroke="#d97706"
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      <circle cx={x} cy={y} r={5} fill="#d97706" />
                      <text
                        x={x + 6}
                        y={y - 6}
                        fill="#92400e"
                        fontSize={12}
                        fontWeight={600}
                      >
                        {p.etichetta} · {formattaQuadrati(p.offsetQuadrati)} q
                      </text>
                    </g>
                  );
                })}
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
              {punti.length ? (
                <button
                  type="button"
                  onClick={() => setPunti((prev) => prev.slice(0, -1))}
                  className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Togli ultimo punto
                </button>
              ) : null}
            </div>
            <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs text-teal-950">
              <p className="font-semibold">Dati che verranno importati</p>
              <ul className="mt-1 space-y-0.5">
                {anteprimaImporto.angoli.map((a) => (
                  <li key={`ang-${a.n}`}>{a.testo}</li>
                ))}
                {anteprimaImporto.lati.map((l) => (
                  <li key={`lato-${l.da}-${l.a}`}>{l.testo}</li>
                ))}
              </ul>
              {anteprimaImporto.punti.length ? (
                <ul className="mt-2 space-y-0.5 border-t border-teal-200 pt-2">
                  {anteprimaImporto.punti.map((p, i) => (
                    <li key={`${p.etichetta}-${i}`}>
                      {p.etichetta}: {formattaQuadrati(p.offsetQuadrati)} q
                      sull&apos;asse
                    </li>
                  ))}
                </ul>
              ) : null}
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
            disabled={busy || !source || !limite}
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
