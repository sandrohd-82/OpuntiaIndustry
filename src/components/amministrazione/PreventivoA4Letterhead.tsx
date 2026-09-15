import {
  AGRINSICILIA_LETTERHEAD,
  formatPreventivoDataIt,
} from "@/lib/amministrazione/preventivo-letterhead";

type Props = {
  numero: string;
  dataPreventivo: string;
  onDataChange?: (isoDate: string) => void;
};

export function PreventivoA4Letterhead({
  numero,
  dataPreventivo,
  onDataChange,
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
        <div className="w-[50%] shrink-0 pt-[2.8em] text-right text-[11px] leading-[1.45] text-slate-900">
          <p className="font-semibold">
            {AGRINSICILIA_LETTERHEAD.ragioneSociale}
          </p>
          <p>{AGRINSICILIA_LETTERHEAD.indirizzo}</p>
          <p>
            P.iva {AGRINSICILIA_LETTERHEAD.partitaIva} - C.F.{" "}
            {AGRINSICILIA_LETTERHEAD.codiceFiscale}
          </p>
          <p className="mt-1.5 text-[12px] font-bold tracking-wide">
            PREVENTIVO nr. {numero} del{" "}
            {onDataChange ? (
              <label className="relative inline-block align-baseline">
                <span className="sr-only">Data preventivo</span>
                <span aria-hidden>{formatPreventivoDataIt(dataPreventivo)}</span>
                <input
                  type="date"
                  required
                  value={dataPreventivo}
                  onChange={(e) => onDataChange(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            ) : (
              formatPreventivoDataIt(dataPreventivo)
            )}
          </p>
        </div>
      </div>
      <div className="mt-3 h-px w-full bg-slate-900" />
    </header>
  );
}
