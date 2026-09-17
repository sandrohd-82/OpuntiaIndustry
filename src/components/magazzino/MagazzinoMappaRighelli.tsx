"use client";

import { useMemo } from "react";
import {
  formattaMisuraQuadrati,
  passoRighelloQuadrati,
  type FoglioMappa,
  type MappaPunto,
  type MappaScalaUnita,
} from "@/lib/magazzino/mappa";

export const RIGHELLO_H = 32;
export const RIGHELLO_W = 72;

function tickValues(from: number, to: number, step: number): number[] {
  if (!(step > 0) || to <= from) return [];
  const start = Math.ceil(from / step) * step;
  const out: number[] = [];
  for (let v = start; v <= to + 1e-6; v += step) {
    out.push(v);
    if (out.length > 400) break;
  }
  return out;
}

export function MagazzinoMappaRighelli({
  foglio,
  pan,
  zoom,
  griglia,
  scalaValore,
  scalaUnita,
  cursore,
}: {
  foglio: FoglioMappa;
  pan: { x: number; y: number };
  zoom: number;
  griglia: number;
  scalaValore: number;
  scalaUnita: MappaScalaUnita;
  cursore: MappaPunto | null;
}) {
  const passoQ = passoRighelloQuadrati(griglia, zoom);
  const passoPx = passoQ * griglia;

  const ticksX = useMemo(
    () => tickValues(foglio.x, foglio.x + foglio.width, passoPx),
    [foglio.x, foglio.width, passoPx]
  );
  const ticksY = useMemo(
    () => tickValues(foglio.y, foglio.y + foglio.height, passoPx),
    [foglio.y, foglio.height, passoPx]
  );

  const sx = (x: number) => x * zoom + pan.x;
  const sy = (y: number) => y * zoom + pan.y;

  const sulFoglio = Boolean(
    cursore &&
      cursore.x >= foglio.x &&
      cursore.x <= foglio.x + foglio.width &&
      cursore.y >= foglio.y &&
      cursore.y <= foglio.y + foglio.height
  );

  const cx = cursore ? sx(cursore.x) : null;
  const cy = cursore ? sy(cursore.y) : null;

  const qLeft = cursore ? Math.max(0, (cursore.x - foglio.x) / griglia) : 0;
  const qRight = cursore
    ? Math.max(0, (foglio.x + foglio.width - cursore.x) / griglia)
    : 0;
  const qTop = cursore ? Math.max(0, (cursore.y - foglio.y) / griglia) : 0;
  const qBottom = cursore
    ? Math.max(0, (foglio.y + foglio.height - cursore.y) / griglia)
    : 0;

  const label = (q: number) => formattaMisuraQuadrati(q, scalaValore, scalaUnita);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="absolute left-0 top-0 z-30 bg-slate-800"
        style={{ width: RIGHELLO_W, height: RIGHELLO_H }}
      />

      <div
        className="absolute right-0 top-0 overflow-hidden border-b border-slate-400 bg-amber-50"
        style={{ left: RIGHELLO_W, height: RIGHELLO_H }}
      >
        {ticksX.map((wx) => {
          const x = sx(wx) - RIGHELLO_W;
          const q = (wx - foglio.x) / griglia;
          return (
            <div key={`hx-${wx}`} className="absolute top-0 h-full" style={{ left: x }}>
              <div className="h-2 w-px bg-slate-700" />
              <p className="-translate-x-1/2 whitespace-nowrap text-[9px] font-medium text-slate-800">
                {Math.round(q)}
              </p>
            </div>
          );
        })}
      </div>

      <div
        className="absolute bottom-0 left-0 overflow-hidden border-r border-slate-400 bg-amber-50"
        style={{ top: RIGHELLO_H, width: RIGHELLO_W }}
      >
        {ticksY.map((wy) => {
          const y = sy(wy) - RIGHELLO_H;
          const q = (wy - foglio.y) / griglia;
          return (
            <div
              key={`hy-${wy}`}
              className="absolute left-0 w-full"
              style={{ top: y }}
            >
              <div className="ml-auto h-px w-2 bg-slate-700" />
              <p className="absolute left-0.5 top-0 -translate-y-1/2 text-[9px] font-medium leading-none text-slate-800">
                {Math.round(q)}
              </p>
            </div>
          );
        })}
      </div>

      {cursore && cx != null && cy != null ? (
        <>
          <div
            className="absolute z-40 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-600 shadow-md"
            style={{ left: cx, top: RIGHELLO_H / 2 }}
          />
          <div
            className="absolute z-40 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-600 shadow-md"
            style={{ left: RIGHELLO_W / 2, top: cy }}
          />
          {sulFoglio ? (
            <>
              <p
                className="absolute z-40 -translate-y-1/2 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md"
                style={{
                  top: RIGHELLO_H / 2,
                  right: `calc(100% - ${cx}px + 14px)`,
                  maxWidth: 220,
                }}
              >
                {label(qLeft)}
              </p>
              <p
                className="absolute z-40 -translate-y-1/2 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md"
                style={{
                  top: RIGHELLO_H / 2,
                  left: cx + 14,
                  maxWidth: 220,
                }}
              >
                {label(qRight)}
              </p>
              <p
                className="absolute z-40 left-1 w-[68px] -translate-y-full rounded bg-rose-600 px-1 py-0.5 text-center text-[9px] font-bold leading-tight text-white shadow-md"
                style={{ top: cy - 14 }}
              >
                {label(qTop)}
              </p>
              <p
                className="absolute z-40 left-1 w-[68px] rounded bg-rose-600 px-1 py-0.5 text-center text-[9px] font-bold leading-tight text-white shadow-md"
                style={{ top: cy + 14 }}
              >
                {label(qBottom)}
              </p>
              <div
                className="absolute border-l-2 border-dashed border-rose-500/90"
                style={{
                  left: cx,
                  top: RIGHELLO_H,
                  height: Math.max(0, cy - RIGHELLO_H),
                }}
              />
              <div
                className="absolute border-t-2 border-dashed border-rose-500/90"
                style={{
                  top: cy,
                  left: RIGHELLO_W,
                  width: Math.max(0, cx - RIGHELLO_W),
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
