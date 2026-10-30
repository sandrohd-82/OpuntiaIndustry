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
import { etichettaPreventivo } from "@/lib/amministrazione/preventivo-etichette";

type Props = {
  numero: string;
  dataPreventivo: string;
  onEditData?: () => void;
  commerciale: PreventivoCommercialeRiferimento | null;
  onEditCommerciale?: () => void;
  /** Etichetta documento (default PREVENTIVO). */
  documentoLabel?: string;
  stampa?: boolean;
  /** Stampa commercialista: stessa intestazione, senza logo. */
  nascondiLogo?: boolean;
  etichette?: Record<string, string>;
};

export function PreventivoA4Letterhead({
  numero,
  dataPreventivo,
  onEditData,
  commerciale,
  onEditCommerciale,
  documentoLabel = "PREVENTIVO",
  stampa = false,
  nascondiLogo = false,
  etichette,
}: Props) {
  const ph = !commerciale && !stampa;
  const nomeComm = commerciale?.nome || (stampa ? "—" : "Nome Cognome");
  return (
    <header>
      <div className="flex items-start justify-between">
        {nascondiLogo ? (
          <div className="w-[45%] shrink-0" aria-hidden />
        ) : (
          <div className="w-[45%] shrink-0 pr-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={AGRINSICILIA_LETTERHEAD.logoSrc}
              alt={AGRINSICILIA_LETTERHEAD.logoAlt}
              className="h-auto w-full max-w-full object-contain object-left"
            />
          </div>
        )}
        <div className="w-[50%] shrink-0 text-right text-[11px] leading-[1.45] text-slate-900">
          <p className="font-semibold">
            {AGRINSICILIA_LETTERHEAD.ragioneSociale}
          </p>
          <p>{AGRINSICILIA_LETTERHEAD.indirizzo}</p>
          <p>
            {etichettaPreventivo(etichette, "piva", "P.iva")}{" "}
            {AGRINSICILIA_LETTERHEAD.partitaIva} -{" "}
            {etichettaPreventivo(etichette, "cf", "C.F.")}{" "}
            {AGRINSICILIA_LETTERHEAD.codiceFiscale}
          </p>
          <PreventivoDocField
            label="Modifica data preventivo"
            onEdit={onEditData ?? (() => {})}
            className="mt-1.5"
            pencilRight
            stampa={stampa}
          >
            <p className="text-[12px] font-bold tracking-wide">
              <span
                className={
                  documentoLabel === "FATTURA PROFORMA" ? "text-red-700" : undefined
                }
              >
                {etichettaPreventivo(etichette, "documento", documentoLabel)}
              </span>{" "}
              {etichettaPreventivo(etichette, "nr", "nr.")} {numero}{" "}
              {etichettaPreventivo(etichette, "del", "del")}{" "}
              {formatPreventivoDataIt(dataPreventivo)}
            </p>
          </PreventivoDocField>
          <PreventivoDocField
            label="Modifica commerciale di riferimento"
            onEdit={onEditCommerciale ?? (() => {})}
            className="mt-2"
            pencilRight
            stampa={stampa}
          >
            <p className="font-semibold">
              {etichettaPreventivo(
                etichette,
                "commerciale",
                "Commerciale di riferimento"
              )}
            </p>
            <p className={ph ? "text-slate-400" : undefined}>{nomeComm}</p>
            <PreventivoDocQa
              className={ph ? "text-slate-400" : undefined}
              domanda={etichettaPreventivo(etichette, "telefono", "Telefono")}
              risposta={commerciale?.telefono || "—"}
            />
            <PreventivoDocQa
              className={ph ? "text-slate-400" : undefined}
              domanda={etichettaPreventivo(etichette, "email", "Email")}
              risposta={commerciale?.email || "—"}
            />
          </PreventivoDocField>
        </div>
      </div>
      <div className="mt-3 h-px w-full bg-slate-900" />
    </header>
  );
}
