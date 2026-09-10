import Image from "next/image";
import {
  ACTION_ESSICCATORI,
  CARICO_TIPO_LABELS,
  formatCapacitaKg,
  type ActionEssiccatore,
} from "@/lib/action/essiccatori";

function EssiccatoreBox({ item }: { item: ActionEssiccatore }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="relative aspect-[16/10] bg-slate-100">
        <Image
          src={item.imageSrc}
          alt={item.nome}
          fill
          className="object-cover"
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          {item.codice}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{item.nome}</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Capacità max</dt>
            <dd className="font-medium tabular-nums">
              {formatCapacitaKg(item.capacitaMaxKg)}{" "}
              <span className="font-normal text-[var(--muted)]">
                ({CARICO_TIPO_LABELS[item.caricoTipo]})
              </span>
            </dd>
          </div>
          {item.note ? (
            <div>
              <dt className="text-[var(--muted)]">Carico</dt>
              <dd>{item.note}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-4 text-xs text-[var(--muted)]">Installato in azienda</p>
      </div>
    </article>
  );
}

export function ActionEssiccatoriBoard() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {ACTION_ESSICCATORI.map((item) => (
        <EssiccatoreBox key={item.id} item={item} />
      ))}
    </div>
  );
}
