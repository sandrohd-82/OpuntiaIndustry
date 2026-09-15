"use client";

import {
  AGRINSICILIA_COORDINATE,
  AGRINSICILIA_LETTERHEAD,
  OPUNTIA_ITALIA_LOGO,
  formatPreventivoDataIt,
} from "@/lib/amministrazione/preventivo-letterhead";
import {
  PREVENTIVO_IVA_DEFAULT,
  PREVENTIVO_VALIDITA_GIORNI,
  labelModalitaPagamentoPreventivo,
} from "@/lib/amministrazione/preventivi";
import { formatIbanDisplay } from "@/lib/iban";
import type { OrdineTipoPagamento } from "@/lib/amministrazione/ordini";
import {
  PreventivoDocField,
  PreventivoDocQa,
} from "@/components/amministrazione/PreventivoDocPencil";

type Props = {
  tipoPagamento: OrdineTipoPagamento;
  onEditPagamento: () => void;
  numero: string;
  dataPreventivo: string;
  ivaPercentuale?: number;
  onEditIva?: () => void;
  imponibile: number;
  totaleIva: number;
  totalePreventivo: number;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function TotaleRiga({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {euro(value)} €
      </span>
    </div>
  );
}

export function PreventivoA4PiePagina({
  tipoPagamento,
  onEditPagamento,
  numero,
  dataPreventivo,
  ivaPercentuale = PREVENTIVO_IVA_DEFAULT,
  onEditIva,
  imponibile,
  totaleIva,
  totalePreventivo,
}: Props) {
  return (
    <div className="flex flex-1 flex-col pt-3">
      <div className="flex-1" aria-hidden />
      <div className="grid grid-cols-2 border border-slate-800 text-[11px] leading-normal">
        <div className="border-r border-slate-800 p-3">
          <PreventivoDocField
            label="Modifica modalità di pagamento"
            onEdit={onEditPagamento}
          >
            <p className="text-[12px] font-bold">Modalità di Pagamento</p>
            <p className="mt-0.5">{labelModalitaPagamentoPreventivo(tipoPagamento)}</p>
            <div className="mt-2 space-y-0.5">
              <PreventivoDocQa
                domanda="Banca"
                risposta={AGRINSICILIA_COORDINATE.banca}
              />
              <PreventivoDocQa
                domanda="IBAN"
                risposta={formatIbanDisplay(AGRINSICILIA_COORDINATE.iban)}
              />
              <PreventivoDocQa
                domanda="BIC"
                risposta={AGRINSICILIA_COORDINATE.bic}
              />
              <PreventivoDocQa
                domanda="Importo"
                risposta={`${euro(totalePreventivo)} €`}
              />
              <PreventivoDocQa
                domanda="Causale"
                risposta={`Pagamento Preventivo n. ${numero} del ${formatPreventivoDataIt(dataPreventivo)}.`}
              />
            </div>
          </PreventivoDocField>
        </div>

        <div className="flex flex-col p-3">
          <p className="text-[12px] font-bold">Totali</p>
          <div className="mt-2 space-y-1">
            <TotaleRiga label="Imponibile" value={imponibile} />
            <PreventivoDocField
              label={`Modifica IVA (${ivaPercentuale}%)`}
              onEdit={onEditIva ?? (() => {})}
              pencilRight
            >
              <TotaleRiga label="Totale IVA" value={totaleIva} />
            </PreventivoDocField>
            <div className="border-t border-slate-800 pt-1">
              <TotaleRiga
                label="Totale Preventivo"
                value={totalePreventivo}
                strong
              />
            </div>
          </div>
          <div className="mt-auto flex justify-center pt-6">
            <div className="-rotate-6 border-[2.5px] border-double border-slate-800 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-800">
              Validità preventivo {PREVENTIVO_VALIDITA_GIORNI} gg.
            </div>
          </div>
        </div>
      </div>

      <div className="h-[5.5em] shrink-0" aria-hidden />
      <footer className="text-center">
        <div className="mb-2 flex items-center justify-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={AGRINSICILIA_LETTERHEAD.logoSrc}
            alt={AGRINSICILIA_LETTERHEAD.logoAlt}
            className="h-11 w-auto object-contain"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={OPUNTIA_ITALIA_LOGO.src}
            alt={OPUNTIA_ITALIA_LOGO.alt}
            className="h-11 w-auto object-contain"
          />
        </div>
        <p className="text-[10px] font-semibold leading-[1.4] text-slate-800">
          {AGRINSICILIA_LETTERHEAD.ragioneSociale}
        </p>
        <p className="text-[10px] leading-[1.4] text-slate-700">
          {AGRINSICILIA_LETTERHEAD.sito} - {AGRINSICILIA_LETTERHEAD.email}
        </p>
        <p className="text-[10px] leading-[1.4] text-slate-700">
          cell: {AGRINSICILIA_LETTERHEAD.cell}
        </p>
      </footer>
    </div>
  );
}
