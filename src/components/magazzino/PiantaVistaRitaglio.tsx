import {
  ritaglioDisegnoMappa,
  type MappaMagazzino,
} from "@/lib/magazzino/mappa";
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

export function PiantaVistaRitaglio({ mappa }: { mappa: MappaMagazzino }) {
  const extra = (mappa.riferimenti ?? []).flatMap((g) => estremiCalcoDest(g));
  const box = ritaglioDisegnoMappa(mappa.linee, mappa.aree ?? [], extra);
  const g = Math.max(mappa.grigliaPx, 1);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--border)] bg-white">
      <p className="shrink-0 border-b border-[var(--border)] px-3 py-1.5 text-sm font-medium text-slate-800">
        {mappa.vistaEtichetta || "Vista"}
      </p>
      <div className="min-h-0 flex-1 p-2">
        <svg
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="#ffffff"
          />
          {(mappa.riferimenti ?? []).map((rif) => (
            <g key={rif.id}>
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
            return (
              <g key={a.id}>
                <rect
                  x={a.x}
                  y={a.y}
                  width={a.width}
                  height={a.height}
                  fill="rgba(13,148,136,0.12)"
                  stroke="#0d9488"
                  strokeWidth={1.6}
                />
                <text
                  x={a.x + a.width / 2}
                  y={a.y + a.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#134e4a"
                  fontSize={fontTarga(a.width, a.height, targa)}
                  fontWeight={700}
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
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
