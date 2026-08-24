import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFirstRicercaSviluppoPath } from "@/lib/areas/ricerca-sviluppo";

export default async function RicercaSviluppoIndexPage() {
  await requireAreaAccess("ricerca-sviluppo");
  redirect(getFirstRicercaSviluppoPath());
}
