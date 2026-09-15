"use client";

import {
  AGRINSICILIA_LETTERHEAD,
  formatPreventivoDataIt,
} from "@/lib/amministrazione/preventivo-letterhead";
import { PreventivoDocField } from "@/components/amministrazione/PreventivoDocPencil";

type Props = {
  numero: string;
  dataPreventivo: string;
  onEditData?: () => void;
};

export function PreventivoA4Letterhead({
  numero,
  dataPreventivo,
  onEditData,
}: Props) {
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
        <div className="w-[50%] shrink-0 pt-[5.6em] text-right text-[11px] leading-[1.45] text-slate-900">
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
          >
            <p className="text-[12px] font-bold tracking-wide">
              PREVENTIVO nr. {numero} del {formatPreventivoDataIt(dataPreventivo)}
            </p>
          </PreventivoDocField>
        </div>
      </div>
      <div className="mt-3 h-px w-full bg-slate-900" />
    </header>
  );
}
