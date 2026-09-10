import { requireAnyAreaAccess } from "@/lib/areas/guard";

/** Elenco, dettaglio, anteprima numero, allegati. */
export async function requireOrdineReadAccess() {
  return requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
    "produzione",
  ]);
}

/** Creazione wizard vendita/campionatura (resta in attesa). */
export async function requireOrdineCreateAccess() {
  return requireAnyAreaAccess(["amministrazione", "commerciale"]);
}

/** Inserimento in scaletta produzione. */
export async function requireOrdineProcessAccess() {
  return requireAnyAreaAccess(["amministrazione", "produzione"]);
}

/** Catalogo prodotti, listino, clienti per il wizard. */
export async function requireOrdineSupportReadAccess() {
  return requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
    "produzione",
  ]);
}
