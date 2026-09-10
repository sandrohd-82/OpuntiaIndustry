import { redirect } from "next/navigation";
import { getFirstActionPath } from "@/lib/areas/action";
import { requireAreaAccess } from "@/lib/areas/guard";

export default async function ActionIndexPage() {
  await requireAreaAccess("action");
  redirect(getFirstActionPath());
}
