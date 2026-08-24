import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstPromemorieENotePath } from "@/lib/areas/promemorie-e-note";

export default async function PromemorieENoteIndexPage() {
  await requireAreaAccess("promemorie-e-note");
  redirect(getFirstPromemorieENotePath());
}
