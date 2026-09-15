import { redirect } from "next/navigation";
import { getFirstCommercialePath } from "@/lib/areas/commerciale";
import { requireAnyAreaAccess } from "@/lib/areas/guard";

export default async function CommercialePage() {
  await requireAnyAreaAccess(["commerciale", "amministrazione"]);
  redirect(getFirstCommercialePath());
}
