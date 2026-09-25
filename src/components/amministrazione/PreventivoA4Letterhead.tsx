"use client";

import {
  AGRINSICILIA_LETTERHEAD,
  formatPreventivoDataIt,
} from "@/lib/amministrazione/preventivo-letterhead";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import {
  PreventivoDocField,
  PreventivoDocQa,
} from "@/components/amministrazione/PreventivoDocPencil";

type Props = {
  numero: string;
  dataPreventivo: string;
  onEditData?: () => void;
  commerciale: PreventivoCommercialeRiferimento | null;
  onEditCommerciale?: () => void;
  /** Etichetta documento (default PREVENTIVO). */
  documentoLabel?: string;
};

export function PreventivoA4Letterhead({
  numero,
  dataPreventivo,
  onEditData,
  commerciale,
  onEditCommerciale,
  documentoLabel = "PREVENTIVO",
}: Props) {
  const ph = !commerciale;
  return (
    <header>
      <div className="flex items-start justify-between">
        <div className="w-[45%] shrink-0 pr-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={AGRINSICILIA_LETTERHEAD.logoSrc}
            alt={AGRINSICILIA_LETTERHEAD.logoAlt}
            className="h-auto w-full max-w-full object-contain object-left"
          />
        </div>
        <div className="w-[50%] shrink-0 text-right text-[11px] leading-[1.45] text-slate-900">
          <p className="font-semibold">
            {AGRINSICILIA_LETTERHEAD.ragioneSociale}
          </p>
          <p>{AGRINSICILIA_LETTERHEAD.indirizzo}</p>
          <p>
            P.iva {AGRINSICILIA_LETTERHEAD.partitaIva} - C.F.{" "}
            {AGRINSICILIA_LETTERHEAD.codiceFiscale}
          </p>
          <PreventivoDocField
            label="Modifica data preventivo"
            onEdit={onEditData ?? (() => {})}
            className="mt-1.5"
            pencilRight
          >
            <p className="text-[12px] font-bold tracking-wide">
              {documentoLabel} nr. {numero} del {formatPreventivoDataIt(dataPreventivo)}
            </p>
          </PreventivoDocField>
          <PreventivoDocField
            label="Modifica commerciale di riferimento"
            onEdit={onEditCommerciale ?? (() => {})}
            className="mt-2"
            pencilRight
          >
            <p className="font-semibold">Commerciale di riferimento</p>
            <p className={ph ? "text-slate-400" : undefined}>
              {commerciale?.nome || "Nome Cognome"}
            </p>
            <PreventivoDocQa
              className={ph ? "text-slate-400" : undefined}
              domanda="Telefono"
              risposta={commerciale?.telefono || "—"}
            />
            <PreventivoDocQa
              className={ph ? "text-slate-400" : undefined}
              domanda="Email"
              risposta={commerciale?.email || "—"}
            />
          </PreventivoDocField>
        </div>
      </div>
      <div className="mt-3 h-px w-full bg-slate-900" />
    </header>
  );
}
