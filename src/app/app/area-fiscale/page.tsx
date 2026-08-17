import { redirect } from "next/navigation";
import { getFirstAreaFiscalePath } from "@/lib/areas/area-fiscale";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function AreaFiscalePage() {
  await requireAreaAccess("area-fiscale");
  redirect(getFirstAreaFiscalePath());
}
