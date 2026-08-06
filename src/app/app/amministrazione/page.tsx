import { redirect } from "next/navigation";
import { getFirstAmministrazionePath } from "@/lib/areas/amministrazione";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function AmministrazionePage() {
  await requireAreaAccess("amministrazione");
  redirect(getFirstAmministrazionePath());
}
