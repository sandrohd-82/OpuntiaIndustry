"use client";

import {
  AGRINSICILIA_COORDINATE,
  AGRINSICILIA_LETTERHEAD,
  OPUNTIA_ITALIA_LOGO,
  formatPreventivoDataIt,
} from "@/lib/amministrazione/preventivo-letterhead";
import { formatIbanDisplay } from "@/lib/iban";
import {
  labelModalitaPagamentoFattura,
  labelTipoScadenza,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import {
  PreventivoDocField,
  PreventivoDocQa,
} from "@/components/amministrazione/PreventivoDocPencil";

type Props = {
  piano: OrdinePagamentoPiano;
  onEditPagamento: () => void;
  onEditTotali?: () => void;
  numero: string;
  dataDocumento: string;
  ivaPercentuale: number;
  imponibile: number;
  totaleIva: number;
  totale: number;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function FatturaA4PiePagina({
  piano,
  onEditPagamento,
  onEditTotali,
  numero,
  dataDocumento,
  ivaPercentuale,
  imponibile,
  totaleIva,
  totale,
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
            <p className="text-[12px] font-bold">Pagamento e dilazione</p>
            <p className="mt-0.5">{labelModalitaPagamentoFattura(piano)}</p>
            {piano.modalita === "dilazione" ? (
              <ul className="mt-1 space-y-0.5">
                {piano.rate.map((r, i) => (
                  <li key={i}>
                    Rata {i + 1}:{" "}
                    {i === 0
                      ? labelTipoScadenza(r.tipoScadenza ?? piano.tipoUnica)
                      : r.dataPagamento
                        ? formatPreventivoDataIt(r.dataPagamento)
                        : "data da definire"}{" "}
                    · {euro(r.importo)} €
                  </li>
                ))}
              </ul>
            ) : null}
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
                risposta={`${euro(totale)} €`}
              />
              <PreventivoDocQa
                domanda="Causale"
                risposta={`Pagamento Fattura n. ${numero} del ${formatPreventivoDataIt(dataDocumento)}.`}
              />
            </div>
          </PreventivoDocField>
        </div>
        <div className="flex flex-col p-3">
          <PreventivoDocField
            label="Modifica aliquota IVA"
            onEdit={onEditTotali ?? (() => {})}
            pencilRight
          >
          <p className="text-[12px] font-bold">Totali</p>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between gap-3">
              <span>Imponibile</span>
              <span className="tabular-nums">{euro(imponibile)} €</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Totale IVA {ivaPercentuale}%</span>
              <span className="tabular-nums">{euro(totaleIva)} €</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-800 pt-1 font-semibold">
              <span>Totale Fattura</span>
              <span className="tabular-nums">{euro(totale)} €</span>
            </div>
          </div>
          </PreventivoDocField>
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
