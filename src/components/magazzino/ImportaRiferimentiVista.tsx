"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  etichettaAsseOrigine,
  misuraAsseQuadrati,
  offsetSuLimite,
  rettangoloLimiteDisegno,
  type MappaAsseOrigine,
  type MappaRettangolo,
} from "@/lib/magazzino/riferimenti";

type PuntoBozza = { etichetta: string; offsetQuadrati: number };

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
    if (limiteKey !== "bbox") {
      const a = source.aree.find((x) => x.id === limiteKey);
      if (a) return { x: a.x, y: a.y, width: a.width, height: a.height };
    }
    return rettangoloLimiteDisegno(source.linee, source.aree, source.grigliaPx);
  }, [source, limiteKey]);

  const larghezzaQ = limite && source
    ? misuraAsseQuadrati(limite, asse, source.grigliaPx)
    : 0;

  const previewBox = useMemo(() => {
    if (!source) return { x: 0, y: 0, w: 400, h: 280, z: 1 };
    const pts: MappaPunto[] = [];
    for (const l of source.linee) {
      pts.push({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
    }
    for (const a of source.aree) {
      pts.push({ x: a.x, y: a.y }, { x: a.x + a.width, y: a.y + a.height });
    }
    if (limite) {
      pts.push(
        { x: limite.x, y: limite.y },
        { x: limite.x + limite.width, y: limite.y + limite.height }
      );
    }
    if (!pts.length) return { x: 0, y: 0, w: 400, h: 280, z: 1 };
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    const pad = source.grigliaPx * 2;
    const w = Math.max(40, maxX - minX + pad * 2);
    const h = Math.max(40, maxY - minY + pad * 2);
    const z = Math.min(1.4, 520 / w, 340 / h);
    return { x: minX - pad, y: minY - pad, w, h, z };
  }, [source, limite]);

  function worldFromClick(e: React.MouseEvent<SVGSVGElement>): MappaPunto | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return {
      x: previewBox.x + (e.clientX - r.left) / previewBox.z,
      y: previewBox.y + (e.clientY - r.top) / previewBox.z,
    };
  }

  function addPunto(p: MappaPunto) {
    if (!source || !limite) return;
    const offset = offsetSuLimite(p, limite, asse, source.grigliaPx);
    const etichetta =
      puntoLabel.trim() || `Rif. ${punti.length + 1}`;
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
              Clicca sulla pianta origine per i punti di riferimento. Cadono
              sull&apos;asse copiato (stesso scostamento in quadrati).
            </p>
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
              <svg
                ref={svgRef}
                width={previewBox.w * previewBox.z}
                height={previewBox.h * previewBox.z}
                className="max-w-full cursor-crosshair bg-white"
                onClick={(e) => {
                  const w = worldFromClick(e);
                  if (w) addPunto(w);
                }}
              >
                <g transform={`translate(${-previewBox.x * previewBox.z} ${-previewBox.y * previewBox.z}) scale(${previewBox.z})`}>
                  <rect
                    x={limite.x}
                    y={limite.y}
                    width={limite.width}
                    height={limite.height}
                    fill="rgba(13,148,136,0.08)"
                    stroke="#0f766e"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                  />
                  {source.aree.map((a) => (
                    <rect
                      key={a.id}
                      x={a.x}
                      y={a.y}
                      width={a.width}
                      height={a.height}
                      fill="rgba(13,148,136,0.10)"
                      stroke="#0d9488"
                      strokeWidth={1}
                    />
                  ))}
                  {source.linee.map((l) => (
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
                    const x =
                      asse === "x"
                        ? limite.x + p.offsetQuadrati * source.grigliaPx
                        : limite.x + limite.width / 2;
                    const y =
                      asse === "y"
                        ? limite.y + p.offsetQuadrati * source.grigliaPx
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
                          />
                        ) : (
                          <line
                            x1={limite.x}
                            y1={y}
                            x2={limite.x + limite.width}
                            y2={y}
                            stroke="#d97706"
                            strokeWidth={2}
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
                </g>
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
            {punti.length ? (
              <ul className="mt-2 text-xs text-slate-700">
                {punti.map((p, i) => (
                  <li key={`${p.etichetta}-${i}`}>
                    {p.etichetta}: {formattaQuadrati(p.offsetQuadrati)} quadrati
                    dall&apos;inizio dell&apos;asse
                  </li>
                ))}
              </ul>
            ) : null}
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
