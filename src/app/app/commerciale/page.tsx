import { redirect } from "next/navigation";
import { getFirstCommercialePath } from "@/lib/areas/commerciale";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function CommercialePage() {
  await requireAreaAccess("commerciale");
  redirect(getFirstCommercialePath());
}
