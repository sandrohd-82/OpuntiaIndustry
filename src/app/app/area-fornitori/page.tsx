import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstAreaFornitoriPath } from "@/lib/areas/area-fornitori";

export default async function AreaFornitoriIndexPage() {
  await requireAreaAccess("area-fornitori");
  redirect(getFirstAreaFornitoriPath());
}
