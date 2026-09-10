"use client";

import { FaBolt, FaClock, FaDiagramProject } from "react-icons/fa6";
import { PdfFirstPageImage } from "@/components/action/PdfFirstPageImage";
import {
  ACTION_ESSICCATORI,
  CARICO_TIPO_LABELS,
  formatCapacitaKg,
  type ActionEssiccatore,
} from "@/lib/action/essiccatori";

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900";

function EssiccatoreCommandIcons({ nome }: { nome: string }) {
  return (
    <div className="flex justify-end gap-1 px-3 py-2">
      <button
        type="button"
        className={iconBtn}
        title="Azione — comando immediato"
        aria-label={`Azione immediata su ${nome}`}
      >
        <FaBolt size={16} />
      </button>
      <button
        type="button"
        className={iconBtn}
        title="Programma — esegui fra X oppure alle ore X"
        aria-label={`Programma su ${nome}`}
      >
        <FaClock size={16} />
      </button>
      <button
        type="button"
        className={iconBtn}
        title="Processo — serie di azioni in sequenza, in parallelo o su evento"
        aria-label={`Processo su ${nome}`}
      >
        <FaDiagramProject size={16} />
      </button>
    </div>
  );
}

function EssiccatoreBox({ item }: { item: ActionEssiccatore }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="relative aspect-[16/10] bg-slate-50">
        <PdfFirstPageImage
          src={item.imageSrc}
          alt={item.nome}
          className="h-full w-full object-contain"
        />
      </div>
      <EssiccatoreCommandIcons nome={item.nome} />
      <div className="flex flex-1 flex-col px-5 pb-5">
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
