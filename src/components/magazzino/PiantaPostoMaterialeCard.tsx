"use client";

import {
  formatKgIt,
  pesoOccupazioneKg,
  targaProdottoOccupazione,
  type PostoOccupazione,
  type ProdottoLottoElenco,
  type RiepilogoElencoPosto,
} from "@/lib/magazzino/posto-occupazione";

function campo(label: string, value: string) {
  return (
    <div key={label} className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="truncate text-sm font-medium text-slate-900" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function PiantaPostoMaterialeCard({
  occ,
  prodotto,
  riepilogo,
}: {
  occ?: PostoOccupazione | null;
  prodotto?: ProdottoLottoElenco | null;
  riepilogo?: RiepilogoElencoPosto | null;
}) {
  if (!occ) {
    if (!riepilogo?.testo?.trim() && !riepilogo?.targa) return null;
    return (
      <div className="space-y-2">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          {campo("Targa", riepilogo.targa || "—")}
          {campo("Quantità totale", formatKgIt(riepilogo.quantitaTotaleKg))}
        </dl>
        <div className="space-y-0.5 text-sm text-slate-800">
          {riepilogo.testo.split(/\n/).map((riga) => (
            <p key={riga}>{riga}</p>
          ))}
        </div>
      </div>
    );
  }

  const targa = targaProdottoOccupazione(occ, prodotto?.codice);
  const qta = formatKgIt(pesoOccupazioneKg(occ));
  const tipoEl =
    occ.tipoElemento === "isolamento"
      ? "Sacchetto / isolamento"
      : "Cartone / confezione";
  const tipoProd = prodotto?.nome?.trim()
    ? prodotto.nome
    : prodotto?.codice
      ? prodotto.codice
      : "—";

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {campo("Tipo prodotto", tipoProd)}
        {campo("Targa", targa || "—")}
        {campo("Quantità totale", qta)}
        {campo("Peso", qta)}
        {campo("Lotto interno", occ.lottoInternoCodice || "—")}
        {campo("Lotto esterno", occ.lottoEsternoCodice || "—")}
        {campo("Movimentazione", occ.movimentazioneNome || "—")}
        {campo(
          "Tipo elemento",
          `${tipoEl}${occ.imballaggioNome ? ` · ${occ.imballaggioNome}` : ""}`
        )}
        {campo(
          "Quantità elementi",
          occ.quantitaElementi != null ? String(occ.quantitaElementi) : "—"
        )}
        {campo("Codice pallet", occ.codicePallet || "—")}
      </dl>
      {occ.elementi.length ? (
        <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-lg border border-green-200 bg-white/70 px-2 py-1.5 text-xs text-slate-800">
          {occ.elementi.map((e) => (
            <li key={e.id}>
              {e.numero}
              {e.pesoKg != null
                ? ` · ${e.pesoKg.toLocaleString("it-IT")} kg`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
