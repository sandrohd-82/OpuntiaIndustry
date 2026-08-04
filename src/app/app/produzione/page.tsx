import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstProduzionePath } from "@/lib/areas/produzione";

export default async function ProduzionePage() {
  await requireAreaAccess("produzione");
  redirect(getFirstProduzionePath());
}
