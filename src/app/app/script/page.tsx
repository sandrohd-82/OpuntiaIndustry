import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstScriptPath } from "@/lib/areas/script";

export default async function ScriptPage() {
  await requireAreaAccess("script");
  redirect(getFirstScriptPath());
}
