"use client";

import { FaCheck, FaPen } from "react-icons/fa6";
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

type Props = {
  note: string;
  noteEditing: boolean;
  onNoteChange: (value: string) => void;
  onToggleNoteEdit: () => void;
  tipoPagamento: OrdineTipoPagamento;
  numero: string;
  dataPreventivo: string;
  ivaPercentuale?: number;
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

export function PreventivoA4PiePagina({
  note,
  noteEditing,
  onNoteChange,
  onToggleNoteEdit,
  tipoPagamento,
  numero,
  dataPreventivo,
  ivaPercentuale = PREVENTIVO_IVA_DEFAULT,
  imponibile,
  totaleIva,
  totalePreventivo,
}: Props) {
  return (
    <div className="mt-8">
      <div className="relative">
        <button
          type="button"
          onClick={onToggleNoteEdit}
          className="absolute -top-1 right-0 rounded p-1 text-slate-500 hover:bg-slate-100 print:hidden"
          aria-label={noteEditing ? "Chiudi modifica note" : "Modifica note"}
        >
          {noteEditing ? <FaCheck size={12} /> : <FaPen size={12} />}
        </button>
        {noteEditing ? (
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-300 px-2 py-1.5 pr-8 text-[11px] leading-[1.45]"
          />
        ) : (
          <p className="whitespace-pre-line pr-7 text-[11px] leading-[1.45] text-slate-800">
            {note}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-0.5 text-[11px] leading-[1.45]">
        <p>
          Modalità pagamento:{" "}
          {labelModalitaPagamentoPreventivo(tipoPagamento)}
        </p>
        <p>Banca {AGRINSICILIA_COORDINATE.banca}</p>
        <p>IBAN: {formatIbanDisplay(AGRINSICILIA_COORDINATE.iban)}</p>
        <p>BIC: {AGRINSICILIA_COORDINATE.bic}</p>
        <p>Importo: {euro(totalePreventivo)} €</p>
        <p>
          Causale: Pagamento Preventivo n. {numero} del{" "}
          {formatPreventivoDataIt(dataPreventivo)}
        </p>
        <p>Validità preventivo {PREVENTIVO_VALIDITA_GIORNI} gg.</p>
      </div>

      <div className="mt-5 flex items-start justify-between gap-4 text-[11px]">
        <div className="w-1/2">
          <p className="font-medium">IVA {ivaPercentuale}%</p>
        </div>
        <div className="w-1/2 space-y-1">
          <div className="flex justify-between gap-3">
            <span>Imponibile</span>
            <span className="tabular-nums">{euro(imponibile)} €</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Totale IVA</span>
            <span className="tabular-nums">{euro(totaleIva)} €</span>
          </div>
          <div className="flex justify-between gap-3 border-t border-slate-300 pt-1 font-semibold">
            <span>Totale Preventivo</span>
            <span className="tabular-nums">{euro(totalePreventivo)} €</span>
          </div>
        </div>
      </div>

      <footer className="mt-10 text-center">
        <div className="mb-2 flex items-center justify-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={AGRINSICILIA_LETTERHEAD.logoSrc}
            alt={AGRINSICILIA_LETTERHEAD.logoAlt}
            className="h-7 w-auto object-contain"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={OPUNTIA_ITALIA_LOGO.src}
            alt={OPUNTIA_ITALIA_LOGO.alt}
            className="h-7 w-auto object-contain"
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
