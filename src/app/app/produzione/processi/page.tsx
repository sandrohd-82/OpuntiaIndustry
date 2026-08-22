import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function ProcessiIndexPage() {
  await requireAreaAccess("produzione");
  redirect("/app/produzione/processi/elenco");
}
