import { redirect } from "next/navigation";
import { getFirstWebmailPath } from "@/lib/areas/webmail";
import { requireWebmailAccess } from "@/lib/areas/guard";

export default async function WebmailIndexPage() {
  await requireWebmailAccess();
  redirect(getFirstWebmailPath());
}
