import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function EssiccatoriIndexRedirect() {
  await requireAreaAccess("produzione");
  redirect("/app/produzione/gestione-aree/essiccatori");
}
