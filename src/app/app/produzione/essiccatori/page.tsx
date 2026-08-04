import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function EssiccatoriIndexPage() {
  await requireAreaAccess("produzione");
  redirect("/app/produzione/essiccatori/gestione");
}
