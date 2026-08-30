import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

/** Alias richiesto dal flusso admin: /admin/wikiopuntia/new */
export default async function AdminWikiopuntiaNewPage() {
  await requireAreaAccess("wikiopuntia");
  redirect("/app/wikiopuntia/biblioteca/nuova");
}
