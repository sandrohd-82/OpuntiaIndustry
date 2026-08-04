import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { PRODUZIONE_SECTIONS } from "@/lib/areas/produzione";

export default async function ProduzionePage() {
  await requireAreaAccess("produzione");
  redirect(PRODUZIONE_SECTIONS[0].path);
}
