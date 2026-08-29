import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstWikiopuntiaPath } from "@/lib/areas/wikiopuntia";

export default async function WikiopuntiaIndexPage() {
  await requireAreaAccess("wikiopuntia");
  redirect(getFirstWikiopuntiaPath());
}
