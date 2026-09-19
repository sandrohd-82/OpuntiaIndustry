"use client";

import type { MouseEvent } from "react";
import {
  ritaglioDisegnoMappa,
  type MappaMagazzino,
} from "@/lib/magazzino/mappa";
import {
  capienzaDi,
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

export function PiantaVistaRitaglio({
  mappa,
  accese,
  primariaId,
  onSeleziona,
}: {
  mappa: MappaMagazzino;
  accese?: Set<string>;
  primariaId?: string | null;
  onSeleziona?: (ubicazioneId: string | null) => void;
}) {
  const extra = (mappa.riferimenti ?? []).flatMap((g) => estremiCalcoDest(g));
  const box = ritaglioDisegnoMappa(mappa.linee, mappa.aree ?? [], extra);
  const g = Math.max(mappa.grigliaPx, 1);
  const glowId = `posto-glow-${mappa.id}`;

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
      <div className="min-h-0 flex-1 p-2">
        <svg
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
      </div>
    </div>
  );
}
