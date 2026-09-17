"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

function stimaLarghezza(testo: string): number {
  return Math.min(240, Math.max(76, testo.length * 6.4 + 18));
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setBox({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const testoL = label(qLeft);
  const testoR = label(qRight);
  const testoT = label(qTop);
  const testoB = label(qBottom);

  const misure = useMemo(() => {
    if (cx == null || cy == null || box.w < 40 || box.h < 40) return null;
    const pad = 4;
    const hH = 22;
    const vH = 30;
    const wL = stimaLarghezza(testoL);
    const wR = stimaLarghezza(testoR);
    const wT = stimaLarghezza(testoT);
    const wB = stimaLarghezza(testoB);
    const px = RIGHELLO_W + cx;
    const py = RIGHELLO_H + cy;

    let leftX = px - 12 - wL;
    let rightX = px + 12;
    let leftY = Math.max(pad, (RIGHELLO_H - hH) / 2);
    let rightY = leftY;
    if (leftX < pad) {
      leftX = pad;
      leftY = RIGHELLO_H + 4;
    }
    if (rightX + wR > box.w - pad) {
      rightX = box.w - pad - wR;
      rightY = RIGHELLO_H + 4;
    }
    if (leftY === rightY && leftX + wL > rightX - 4) {
      leftY = RIGHELLO_H + 4;
      rightY = RIGHELLO_H + 4;
    }

    let topX = Math.max(pad, (RIGHELLO_W - wT) / 2);
    let botX = Math.max(pad, (RIGHELLO_W - wB) / 2);
    let topY = py - 16 - vH;
    let botY = py + 16;
    if (topY < pad) {
      topX = RIGHELLO_W + 6;
      topY = Math.max(pad, Math.min(py - 16 - vH, box.h - pad - vH));
    }
    if (botY + vH > box.h - pad) {
      botX = RIGHELLO_W + 6;
      botY = Math.max(pad, box.h - pad - vH);
    }
    if (topX === botX && topY + vH > botY - 4) {
      topX = RIGHELLO_W + 6;
      botX = RIGHELLO_W + 6;
    }

    return {
      left: { x: leftX, y: leftY, w: wL, text: testoL },
      right: { x: rightX, y: rightY, w: wR, text: testoR },
      top: { x: topX, y: topY, w: wT, text: testoT },
      bottom: { x: botX, y: botY, w: wB, text: testoB },
      px,
      py,
    };
  }, [box.h, box.w, cx, cy, testoB, testoL, testoR, testoT]);

  return (
    <div
      ref={wrapRef}
      className="relative grid h-full min-h-0 w-full min-w-0"
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
      </div>

      <div className="relative min-h-0 min-w-0 overflow-hidden bg-slate-200">
        {children}
      </div>

      {misure ? (
        <div className="pointer-events-none absolute inset-0 z-40">
          <div
            className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-rose-600 shadow-[0_0_0_2px_#881337]"
            style={{ left: misure.px, top: RIGHELLO_H / 2 }}
          />
          <div
            className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-rose-600 shadow-[0_0_0_2px_#881337]"
            style={{ left: RIGHELLO_W / 2, top: misure.py }}
          />
          {(
            [
              misure.left,
              misure.right,
              misure.top,
              misure.bottom,
            ] as const
          ).map((item, i) => (
            <p
              key={i}
              className="absolute rounded bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-tight text-white shadow-md"
              style={{
                left: item.x,
                top: item.y,
                width: item.w,
              }}
            >
              {item.text}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
