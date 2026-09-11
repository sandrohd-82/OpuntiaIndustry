/** Fonte materiale in inserimento produzione (ISO 9001 §8.5). */
export type FonteApprovvigionamento = "magazzino" | "lavorazione";

export function quantitaRichiestaInBaseKg(
  quantita: number,
  unitaMisura: string
): number | null {
  if (unitaMisura === "g" || unitaMisura === "ml") return quantita / 1000;
  if (unitaMisura === "kg" || unitaMisura === "lt") return quantita;
  return null;
}

export function giacenzaCopreRichiesta(
  giacenzaKg: number,
  richiestaBaseKg: number | null
): boolean {
  if (richiestaBaseKg == null) return giacenzaKg > 0;
  return giacenzaKg + 1e-9 >= richiestaBaseKg;
}

export function formatKgLt(value: number): string {
  return `${value.toLocaleString("it-IT", { maximumFractionDigits: 3 })} kg/lt`;
}

export function messaggioGiacenzaInsufficiente(
  giacenzaKg: number,
  richiestaBaseKg: number
): string {
  return `Giacenza insufficiente: disponibili ${formatKgLt(giacenzaKg)}, richiesti ${formatKgLt(richiestaBaseKg)}. L’approvvigionamento da magazzino è possibile solo se la quantità è già presente.`;
}
