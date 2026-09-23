import { notFound, redirect } from "next/navigation";
import { firstImpostazioniPath } from "@/lib/areas/impostazioni";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";

export default async function ImpostazioniIndexPage() {
  const { auth } = await requireAreaAccess("impostazioni");
  if (!isAdminLikeProfile(auth.profile)) {
    notFound();
  }
  redirect(firstImpostazioniPath());
}
