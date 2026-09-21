"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { type RiepilogoElencoPosto } from "@/lib/magazzino/posto-occupazione";
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
import {
  isVistaDallAlto,
  rettangoloFotoNelBox,
  type PostoFotoPrincipale,
} from "@/lib/magazzino/posto-foto";

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
  host: HTMLElement,
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
  const origin = host.getBoundingClientRect();
  return {
    left: a.x - origin.left,
    top: a.y - origin.top,
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
  fotoPrincipali,
  riepilogoPosti,
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
  fotoPrincipali?: Record<string, PostoFotoPrincipale>;
  riepilogoPosti?: Record<string, RiepilogoElencoPosto>;
}) {
  const extra = (mappa.riferimenti ?? []).flatMap((g) => estremiCalcoDest(g));
  const box = ritaglioDisegnoMappa(mappa.linee, mappa.aree ?? [], extra);
  const g = Math.max(mappa.grigliaPx, 1);
  const glowId = `posto-glow-${mappa.id}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const primaria = (mappa.aree ?? []).find(
    (a) => a.ubicazioneId && a.ubicazioneId === primariaId
  );
  const [boxes, setBoxes] = useState<
    Record<string, { left: number; top: number; width: number; height: number }>
  >({});
  const [dettaglioFoto, setDettaglioFoto] = useState<Set<string>>(
    () => new Set()
  );
  const mostraFoto = !isVistaDallAlto(mappa.vistaEtichetta || "");

  const overlayIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const id of dettaglioFoto) ids.add(id);
    if (primaria?.ubicazioneId) {
      const haFoto = Boolean(
        mostraFoto && fotoPrincipali?.[primaria.ubicazioneId]
      );
      if (!haFoto || dettaglioFoto.has(primaria.ubicazioneId)) {
        ids.add(primaria.ubicazioneId);
      }
    }
    return [...ids].sort().join(",");
  }, [dettaglioFoto, primaria?.ubicazioneId, mostraFoto, fotoPrincipali]);

  const syncBoxes = useCallback(() => {
    const svg = svgRef.current;
    const host = hostRef.current;
    const ids = overlayIdsKey ? overlayIdsKey.split(",") : [];
    if (!svg || !host || !ids.length) {
      setBoxes({});
      return;
    }
    const next: typeof boxes = {};
    for (const a of mappa.aree ?? []) {
      if (!a.ubicazioneId || !ids.includes(a.ubicazioneId)) continue;
      const b = areaCssBox(svg, host, a);
      if (b && b.width > 4 && b.height > 4) next[a.ubicazioneId] = b;
    }
    setBoxes(next);
  }, [overlayIdsKey, mappa.aree]);

  useLayoutEffect(() => {
    syncBoxes();
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => syncBoxes());
    ro.observe(host);
    window.addEventListener("resize", syncBoxes);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncBoxes);
    };
  }, [syncBoxes]);

  function testoOcc(id: string): string {
    if (id === primariaId && occupazioneTesto?.trim()) {
      return occupazioneTesto.trim();
    }
    return (riepilogoPosti?.[id]?.testo || "").trim();
  }

  function onClick(e: MouseEvent<SVGSVGElement>) {
    const p = puntoSvg(e.currentTarget, e.clientX, e.clientY);
    if (!p) return;
    const hit = hitArea(mappa.aree ?? [], p.x, p.y);
    if (
      mostraFoto &&
      hit?.ubicazioneId &&
      fotoPrincipali?.[hit.ubicazioneId]
    ) {
      setDettaglioFoto((prev) => {
        const next = new Set(prev);
        if (next.has(hit.ubicazioneId)) next.delete(hit.ubicazioneId);
        else next.add(hit.ubicazioneId);
        return next;
      });
    }
    if (!onSeleziona) return;
    onSeleziona(hit?.ubicazioneId || null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--border)] bg-white">
      <p className="shrink-0 border-b border-[var(--border)] px-3 py-1.5 text-sm font-medium text-slate-800">
        {mappa.vistaEtichetta || "Vista"}
      </p>
      <div ref={hostRef} className="relative min-h-0 flex-1 p-2">
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
            {mostraFoto
              ? (mappa.aree ?? []).map((a) =>
                  fotoPrincipali?.[a.ubicazioneId] ? (
                    <clipPath
                      key={`foto-clip-${a.id}`}
                      id={`foto-clip-${mappa.id}-${a.id}`}
                    >
                      <rect
                        x={a.x}
                        y={a.y}
                        width={a.width}
                        height={a.height}
                      />
                    </clipPath>
                  ) : null
                )
              : null}
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
            const foto = mostraFoto
              ? fotoPrincipali?.[a.ubicazioneId]
              : undefined;
            const mostraDettaglio = Boolean(
              foto && dettaglioFoto.has(a.ubicazioneId)
            );
            const clipId = `foto-clip-${mappa.id}-${a.id}`;
            const fit = foto
              ? rettangoloFotoNelBox({
                  x: a.x,
                  y: a.y,
                  width: a.width,
                  height: a.height,
                  fitScale: foto.fitScale,
                  offsetX: foto.offsetX,
                  offsetY: foto.offsetY,
                })
              : null;
            const occRighe =
              cap.occupazione === "occupato"
                ? testoOcc(a.ubicazioneId)
                    .split(/\n/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : ["Libero"];
            const dettaglioRighe = [
              targa,
              a.nome.trim() && a.nome.trim() !== targa ? a.nome.trim() : "",
              ...occRighe,
            ].filter(Boolean);
            return (
              <g
                key={a.id}
                filter={accesa && !mostraDettaglio ? `url(#${glowId})` : undefined}
              >
                <rect
                  x={a.x}
                  y={a.y}
                  width={a.width}
                  height={a.height}
                  fill={foto || mostraDettaglio ? "#ffffff" : stile.fill}
                  stroke={mostraDettaglio ? "#334155" : stile.stroke}
                  strokeWidth={stile.strokeWidth}
                />
                {foto && fit && !mostraDettaglio ? (
                  <g clipPath={`url(#${clipId})`} pointerEvents="none">
                    <image
                      href={foto.url}
                      x={fit.x}
                      y={fit.y}
                      width={fit.width}
                      height={fit.height}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </g>
                ) : null}
                {mostraDettaglio ? (
                  <g pointerEvents="none">
                    <rect
                      x={a.x}
                      y={a.y}
                      width={a.width}
                      height={a.height}
                      fill="#ffffff"
                    />
                    {boxes[a.ubicazioneId]
                      ? null
                      : dettaglioRighe.map((riga, i) => (
                      <text
                        key={`${a.id}-d-${i}`}
                        x={a.x + a.width / 2}
                        y={
                          a.y +
                          a.height / 2 +
                          (i - (dettaglioRighe.length - 1) / 2) *
                            Math.max(10, a.height * 0.18)
                        }
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={i === 0 ? "#111827" : "#334155"}
                        fontSize={Math.max(
                          8,
                          Math.min(
                            i === 0 ? fontTarga(a.width, a.height, riga) : 11,
                            a.width * 0.22
                          )
                        )}
                        fontWeight={i === 0 ? 700 : 600}
                      >
                        {riga}
                      </text>
                    ))}
                  </g>
                ) : null}
                {!foto && !primaria ? (
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
                ) : null}
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
        {(mappa.aree ?? []).map((a) => {
          const box = a.ubicazioneId ? boxes[a.ubicazioneId] : undefined;
          if (!a.ubicazioneId || !box) return null;
          const suBianco = dettaglioFoto.has(a.ubicazioneId);
          const haFoto = Boolean(mostraFoto && fotoPrincipali?.[a.ubicazioneId]);
          if (haFoto && !suBianco) return null;
          const testo = testoOcc(a.ubicazioneId) || null;
          return (
            <PostoOverlay
              key={`ov-${mappa.id}-${a.id}`}
              area={a}
              box={box}
              occupato={capienzaDi(a).occupazione === "occupato"}
              suBianco={suBianco}
              haSettaggi={postoHaSettaggi(a)}
              testo={testo}
              loading={false}
              onSettaggio={
                onSettaggio
                  ? (rect) => {
                      onSettaggio(a.ubicazioneId);
                      onSettaggioAnchor?.(rect);
                    }
                  : undefined
              }
              onOccupa={
                onOccupa ? () => onOccupa(a.ubicazioneId) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function PostoOverlay({
  area,
  box,
  occupato,
  suBianco = false,
  haSettaggi,
  testo,
  loading,
  onSettaggio,
  onOccupa,
}: {
  area: MappaAreaDisegnata;
  box: { left: number; top: number; width: number; height: number };
  occupato: boolean;
  suBianco?: boolean;
  haSettaggi: boolean;
  testo: string | null;
  loading: boolean;
  onSettaggio?: (rect: DOMRect) => void;
  onOccupa?: () => void;
}) {
  const targa = area.codice.trim() || area.nome.trim() || "Posto";
  const testoScuro = suBianco || !occupato;
  const pad = Math.max(3, Math.min(8, Math.round(Math.min(box.width, box.height) * 0.08)));
  return (
    <div
      className="pointer-events-none absolute box-border overflow-hidden"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      }}
    >
      <p
        className={`absolute truncate font-bold leading-none ${
          testoScuro ? "text-slate-900" : "text-emerald-50"
        }`}
        title={targa}
        style={{
          top: pad,
          left: pad,
          right: pad + 22,
          fontSize: Math.max(9, Math.min(12, box.width * 0.16)),
        }}
      >
        {targa}
      </p>
      {onSettaggio ? (
        <button
          type="button"
          title="Info settaggio"
          aria-label={`Info settaggio ${targa}`}
          className={`pointer-events-auto absolute bg-transparent p-0 text-[13px] font-bold italic leading-none underline-offset-2 hover:underline ${
            testoScuro
              ? haSettaggi
                ? "text-slate-800"
                : "text-slate-600"
              : "text-emerald-50"
          }`}
          style={{ top: pad, right: pad }}
          onClick={(e) => {
            e.stopPropagation();
            onSettaggio?.(e.currentTarget.getBoundingClientRect());
          }}
        >
          i
        </button>
      ) : null}
      <div
        className={`absolute flex flex-col items-center justify-center text-center font-semibold leading-snug ${
          testoScuro ? "text-slate-700" : "text-emerald-50"
        }`}
        style={{
          top: pad + 18,
          right: pad,
          bottom: pad,
          left: pad,
          fontSize: Math.max(8, Math.min(11, box.width * 0.12)),
        }}
      >
        {occupato ? (
          <button
            type="button"
            className={`pointer-events-auto max-h-full overflow-auto ${
              onOccupa ? "hover:underline" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onOccupa?.();
            }}
          >
            {(testo || "")
              .split(/\n/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((riga) => (
                <p key={riga} className="leading-tight">
                  {riga}
                </p>
              ))}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <p>Libero</p>
            {onOccupa ? (
              <button
                type="button"
                className="pointer-events-auto rounded border border-green-800 bg-white px-2 py-0.5 text-[10px] font-semibold text-green-950 shadow-sm hover:bg-green-50"
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
  );
}
