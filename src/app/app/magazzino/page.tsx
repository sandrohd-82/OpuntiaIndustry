import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstMagazzinoPath } from "@/lib/areas/magazzino";

export default async function MagazzinoPage() {
  await requireAreaAccess("magazzino");
  redirect(getFirstMagazzinoPath());
}
