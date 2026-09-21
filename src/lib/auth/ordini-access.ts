import { redirect } from "next/navigation";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";

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

/** Produzione → Ordini → Da processare (solo Admin). */
export async function requireOrdiniDaProcessarePageAccess() {
  const { auth } = await requireAreaAccess("produzione");
  if (!isAdminLikeProfile(auth.profile)) {
    redirect("/app/produzione/ordini/scaletta");
  }
  return { auth };
}

/** Catalogo prodotti, listino, clienti per il wizard. */
export async function requireOrdineSupportReadAccess() {
  return requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
    "produzione",
  ]);
}
