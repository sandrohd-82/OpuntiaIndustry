import {
  CAMPIONATURA_ORDINE_NOTA,
  type CampionaturaOrdineVoce,
} from "@/lib/amministrazione/ordine-campionatura";

export function OrdineCampionaturaElenco({
  righe,
}: {
  righe: CampionaturaOrdineVoce[];
}) {
  if (righe.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Nel collo di spedizione</p>
      <p className="mt-1 text-xs">{CAMPIONATURA_ORDINE_NOTA}</p>
      <ul className="mt-2 space-y-1">
        {righe.map((riga, index) => (
          <li key={`${riga.prodottoId}-${index}`}>
            {riga.prodottoCodice} — {riga.prodottoNome}
            {": "}
            {riga.numeroConfezioni}{" "}
            {riga.numeroConfezioni === 1 ? "confezione" : "confezioni"}
          </li>
        ))}
      </ul>
    </div>
  );
}
