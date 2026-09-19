"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { FaGear } from "react-icons/fa6";
import {
  ritaglioDisegnoMappa,
  type MappaMagazzino,
} from "@/lib/magazzino/mappa";
import {
  capienzaDi,
  postoHaSettaggi,
  stileAreaPosto,
  type MappaAreaDisegnata,
} from "@/lib/magazzino/ubicazioni";
import {
  dettaglioAngoliImporto,
  estremiCalcoDest,
  puntiCalcoDest,
  segmentoGuidaDest,
  segmentiCalcoDest,
} from "@/lib/magazzino/riferimenti";

function fontTarga(width: number, height: number, testo: string): number {
  const lato = Math.min(width, height);
  const lettere = Math.max(1, testo.trim().length);
  return Math.max(10, Math.min((width * 0.78) / lettere, lato * 0.48));
}

function puntoSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function hitArea(
  aree: MappaAreaDisegnata[],
  x: number,
  y: number
): MappaAreaDisegnata | null {
  for (let i = aree.length - 1; i >= 0; i -= 1) {
    const a = aree[i]!;
    if (x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height) {
      return a;
    }
  }
  return null;
}

function areaCssBox(
  svg: SVGSVGElement,
  area: Pick<MappaAreaDisegnata, "x" | "y" | "width" | "height">
) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const toScreen = (x: number, y: number) => {
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pt.matrixTransform(ctm);
  };
  const a = toScreen(area.x, area.y);
  const b = toScreen(area.x + area.width, area.y + area.height);
  const host = svg.getBoundingClientRect();
  return {
    left: a.x - host.left,
    top: a.y - host.top,
    width: Math.max(0, b.x - a.x),
    height: Math.max(0, b.y - a.y),
  };
}

export function PiantaVistaRitaglio({
  mappa,
  accese,
  primariaId,
  onSeleziona,
  occupazioneTesto,
  occupazioneLoading,
  onSettaggio,
  onOccupa,
  onSettaggioAnchor,
}: {
  mappa: MappaMagazzino;
  accese?: Set<string>;
  primariaId?: string | null;
  onSeleziona?: (ubicazioneId: string | null) => void;
  occupazioneTesto?: string | null;
  occupazioneLoading?: boolean;
  onSettaggio?: (ubicazioneId: string) => void;
  onOccupa?: (ubicazioneId: string) => void;
  onSettaggioAnchor?: (rect: DOMRect | null) => void;
}) {
  const extra = (mappa.riferimenti ?? []).flatMap((g) => estremiCalcoDest(g));
  const box = ritaglioDisegnoMappa(mappa.linee, mappa.aree ?? [], extra);
  const g = Math.max(mappa.grigliaPx, 1);
  const glowId = `posto-glow-${mappa.id}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const primaria = (mappa.aree ?? []).find(
    (a) => a.ubicazioneId && a.ubicazioneId === primariaId
  );
  const [overlay, setOverlay] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const syncOverlay = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !primaria) {
      setOverlay(null);
      return;
    }
    setOverlay(areaCssBox(svg, primaria));
  }, [primaria]);

  useLayoutEffect(() => {
    syncOverlay();
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => syncOverlay());
    ro.observe(svg);
    window.addEventListener("resize", syncOverlay);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncOverlay);
    };
  }, [syncOverlay]);

  function onClick(e: MouseEvent<SVGSVGElement>) {
    if (!onSeleziona) return;
    const p = puntoSvg(e.currentTarget, e.clientX, e.clientY);
    if (!p) return;
    const hit = hitArea(mappa.aree ?? [], p.x, p.y);
    onSeleziona(hit?.ubicazioneId || null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--border)] bg-white">
      <p className="shrink-0 border-b border-[var(--border)] px-3 py-1.5 text-sm font-medium text-slate-800">
        {mappa.vistaEtichetta || "Vista"}
      </p>
      <div className="relative min-h-0 flex-1 p-2">
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          className={`h-full w-full ${onSeleziona ? "cursor-pointer" : ""}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={onClick}
        >
          <defs>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="#ffffff"
          />
          {(mappa.riferimenti ?? []).map((rif) => (
            <g key={rif.id} pointerEvents="none">
              {rif.haLimite !== false ? (
                <rect
                  x={rif.destX}
                  y={rif.destY}
                  width={rif.destWidth}
                  height={rif.destHeight}
                  fill="none"
                  stroke="#d97706"
                  strokeDasharray="6 4"
                  strokeWidth={1.4}
                />
              ) : null}
              {segmentiCalcoDest(rif).map((s) => (
                <line
                  key={s.id}
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  stroke="#d97706"
                  strokeDasharray="6 4"
                  strokeWidth={1.4}
                />
              ))}
              {puntiCalcoDest(rif).map((p) => (
                <circle key={p.id} cx={p.x} cy={p.y} r={3.2} fill="#b45309" />
              ))}
              {rif.haLimite !== false
                ? dettaglioAngoliImporto(rif).map((a) => (
                    <g key={`${rif.id}-ang-${a.n}`}>
                      <circle cx={a.destX} cy={a.destY} r={3.2} fill="#b45309" />
                      <text
                        x={a.destX + (a.n === 2 || a.n === 4 ? -4 : 4)}
                        y={a.destY + (a.n === 3 || a.n === 4 ? 11 : -4)}
                        textAnchor={a.n === 2 || a.n === 4 ? "end" : "start"}
                        fill="#78350f"
                        fontSize={9}
                        fontWeight={600}
                      >
                        {a.testo}
                      </text>
                    </g>
                  ))
                : null}
              {rif.punti.map((p) => {
                const s = segmentoGuidaDest(rif, p.offsetQuadrati, g);
                return (
                  <line
                    key={p.id}
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2}
                    y2={s.y2}
                    stroke="#b45309"
                    strokeWidth={1.2}
                  />
                );
              })}
            </g>
          ))}
          {(mappa.aree ?? []).map((a) => {
            const targa = a.codice.trim() || a.nome.trim();
            const cap = capienzaDi(a);
            const accesa = Boolean(accese?.has(a.ubicazioneId));
            const primaria = primariaId === a.ubicazioneId;
            const stile = stileAreaPosto({
              occupazione: cap.occupazione,
              accesa,
              primaria,
            });
            return (
              <g
                key={a.id}
                filter={accesa ? `url(#${glowId})` : undefined}
              >
                <rect
                  x={a.x}
                  y={a.y}
                  width={a.width}
                  height={a.height}
                  fill={stile.fill}
                  stroke={stile.stroke}
                  strokeWidth={stile.strokeWidth}
                />
                {primaria ? null : (
                  <text
                    x={a.x + a.width / 2}
                    y={a.y + a.height / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={stile.text}
                    fontSize={fontTarga(a.width, a.height, targa)}
                    fontWeight={700}
                    pointerEvents="none"
                  >
                    {targa}
                  </text>
                )}
              </g>
            );
          })}
          {mappa.linee.map((l) => (
            <line
              key={l.id}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.colore}
              strokeWidth={l.spessore}
              strokeLinecap="round"
              pointerEvents="none"
            />
          ))}
        </svg>
        {primaria && overlay && overlay.width > 4 && overlay.height > 4 ? (
          <PostoOverlay
            area={primaria}
            box={overlay}
            occupato={capienzaDi(primaria).occupazione === "occupato"}
            haSettaggi={postoHaSettaggi(primaria)}
            testo={occupazioneTesto ?? null}
            loading={Boolean(occupazioneLoading)}
            gearRef={gearRef}
            onSettaggio={
              onSettaggio
                ? () => {
                    onSettaggio(primaria.ubicazioneId);
                    const el = gearRef.current;
                    onSettaggioAnchor?.(el ? el.getBoundingClientRect() : null);
                  }
                : undefined
            }
            onOccupa={
              onOccupa ? () => onOccupa(primaria.ubicazioneId) : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function PostoOverlay({
  area,
  box,
  occupato,
  haSettaggi,
  testo,
  loading,
  gearRef,
  onSettaggio,
  onOccupa,
}: {
  area: MappaAreaDisegnata;
  box: { left: number; top: number; width: number; height: number };
  occupato: boolean;
  haSettaggi: boolean;
  testo: string | null;
  loading: boolean;
  gearRef: RefObject<HTMLButtonElement | null>;
  onSettaggio?: () => void;
  onOccupa?: () => void;
}) {
  const targa = area.codice.trim() || area.nome.trim() || "Posto";
  const chiaro = occupato;
  return (
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      }}
    >
      <div
        className={`flex h-full min-h-0 flex-col p-[4%] ${
          chiaro ? "text-emerald-50" : "text-teal-950"
        }`}
      >
        <div className="flex items-start justify-between gap-1">
          <p
            className="min-w-0 truncate text-[10px] font-bold leading-tight sm:text-[11px]"
            title={targa}
          >
            {targa}
          </p>
          {onSettaggio ? (
            <button
              ref={gearRef}
              type="button"
              title="Settaggio"
              aria-label={`Settaggio ${targa}`}
              className={`pointer-events-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border shadow-sm sm:h-6 sm:w-6 ${
                haSettaggi
                  ? "border-green-950 bg-green-800 text-white hover:bg-green-900"
                  : "border-slate-500 bg-white text-slate-800 hover:bg-slate-100"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSettaggio();
              }}
            >
              <FaGear className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="mt-0.5 min-h-0 flex-1 overflow-auto text-[9px] font-semibold leading-snug sm:text-[10px]">
          {occupato ? (
            <button
              type="button"
              className={`pointer-events-auto text-left ${
                onOccupa ? "hover:underline" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onOccupa?.();
              }}
            >
              {loading ? "Occupato…" : testo?.trim() || "Occupato"}
            </button>
          ) : (
            <div className="flex flex-col items-start gap-1">
              <p>Libero</p>
              {onOccupa ? (
                <button
                  type="button"
                  className="pointer-events-auto rounded border border-green-800 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-green-950 shadow-sm hover:bg-green-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOccupa();
                  }}
                >
                  Occupa
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
