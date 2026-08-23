import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

/** Compatibilità: /processi → processi-e-attivita */
export default async function ProcessiIndexRedirect() {
  await requireAreaAccess("produzione");
  redirect("/app/produzione/processi-e-attivita/elenco-processi");
}
