"use client";

import { useMemo, type ReactNode } from "react";
import {
  formattaMisuraQuadrati,
  passoRighelloQuadrati,
  type FoglioMappa,
  type MappaPunto,
  type MappaScalaUnita,
} from "@/lib/magazzino/mappa";

export const RIGHELLO_H = 44;
export const RIGHELLO_W = 88;

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
  children,
}: {
  foglio: FoglioMappa;
  pan: { x: number; y: number };
  zoom: number;
  griglia: number;
  scalaValore: number;
  scalaUnita: MappaScalaUnita;
  cursore: MappaPunto | null;
  children: ReactNode;
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
    <div
      className="grid h-full min-h-0 w-full min-w-0"
      style={{
        gridTemplateColumns: `${RIGHELLO_W}px minmax(0, 1fr)`,
        gridTemplateRows: `${RIGHELLO_H}px minmax(0, 1fr)`,
      }}
    >
      <div className="flex items-center justify-center border-b border-r border-slate-600 bg-slate-950 px-1 text-center text-[9px] font-semibold leading-tight text-amber-300">
        1 q = {scalaValore} {scalaUnita}
      </div>

      <div className="relative overflow-hidden border-b border-slate-600 bg-slate-900">
        {ticksX.map((wx) => {
          const x = sx(wx);
          const q = (wx - foglio.x) / griglia;
          const major = Math.abs(q % (passoQ * 5)) < 1e-6;
          return (
            <div
              key={`hx-${wx}`}
              className="absolute bottom-0"
              style={{ left: x, transform: "translateX(-50%)" }}
            >
              <p
                className={`mb-0.5 text-center text-[10px] leading-none ${
                  major ? "font-bold text-white" : "font-medium text-slate-200"
                }`}
              >
                {Math.round(q)}
              </p>
              <div
                className={`mx-auto w-px ${major ? "h-3 bg-white" : "h-2 bg-slate-300"}`}
              />
            </div>
          );
        })}
        {cursore && cx != null ? (
          <>
            <div
              className="absolute top-1/2 z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-rose-600 shadow-[0_0_0_2px_#881337]"
              style={{ left: cx }}
            />
            {sulFoglio ? (
              <>
                <p
                  className="absolute top-1 z-20 -translate-x-full rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md"
                  style={{ left: cx - 12 }}
                >
                  {label(qLeft)}
                </p>
                <p
                  className="absolute top-1 z-20 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md"
                  style={{ left: cx + 12 }}
                >
                  {label(qRight)}
                </p>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="relative overflow-hidden border-r border-slate-600 bg-slate-900">
        {ticksY.map((wy) => {
          const y = sy(wy);
          const q = (wy - foglio.y) / griglia;
          const major = Math.abs(q % (passoQ * 5)) < 1e-6;
          return (
            <div
              key={`hy-${wy}`}
              className="absolute right-0 flex items-center"
              style={{ top: y, transform: "translateY(-50%)" }}
            >
              <p
                className={`mr-1 w-[68px] text-right text-[10px] leading-none ${
                  major ? "font-bold text-white" : "font-medium text-slate-200"
                }`}
              >
                {Math.round(q)}
              </p>
              <div
                className={`h-px ${major ? "w-3 bg-white" : "w-2 bg-slate-300"}`}
              />
            </div>
          );
        })}
        {cursore && cy != null ? (
          <>
            <div
              className="absolute left-1/2 z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-rose-600 shadow-[0_0_0_2px_#881337]"
              style={{ top: cy }}
            />
            {sulFoglio ? (
              <>
                <p
                  className="absolute left-1 z-20 w-[80px] -translate-y-full rounded bg-rose-600 px-1 py-0.5 text-center text-[9px] font-bold leading-tight text-white shadow-md"
                  style={{ top: cy - 16 }}
                >
                  {label(qTop)}
                </p>
                <p
                  className="absolute left-1 z-20 w-[80px] rounded bg-rose-600 px-1 py-0.5 text-center text-[9px] font-bold leading-tight text-white shadow-md"
                  style={{ top: cy + 16 }}
                >
                  {label(qBottom)}
                </p>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="relative min-h-0 min-w-0 overflow-hidden bg-slate-200">
        {children}
      </div>
    </div>
  );
}
