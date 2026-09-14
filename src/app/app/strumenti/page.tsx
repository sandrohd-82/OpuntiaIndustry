import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstStrumentiPath } from "@/lib/areas/strumenti";

export default async function StrumentiIndexPage() {
  await requireAreaAccess("strumenti");
  redirect(getFirstStrumentiPath());
}
