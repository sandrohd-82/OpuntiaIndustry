import {
  nextSequentialCodiceTarga,
  type TargaPrefix,
} from "@/lib/amministrazione/codice-targa";

/** Prefisso targa Clienti (Schede → Clienti). */
export const CLIENTI_TARGA_PREFIX: TargaPrefix = "C";

export function nextCodiceTargaCliente(used: Iterable<string>): string {
  return nextSequentialCodiceTarga(CLIENTI_TARGA_PREFIX, used);
}
