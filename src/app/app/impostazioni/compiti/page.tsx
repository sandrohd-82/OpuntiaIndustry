import { notFound } from "next/navigation";
import { CompitiAdempimentiBoard } from "@/components/impostazioni/CompitiAdempimentiBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";

export default async function ImpostazioniCompitiPage() {
  const { auth } = await requireAreaAccess("impostazioni");

  if (!isAdminLikeProfile(auth.profile)) {
    notFound();
  }

  return (
    <>
      <AppHeader
        title="Compiti e adempimenti"
        subtitle="Chi svolge ciascun compito. Il primo è il calcolo delle spedizioni sui preventivi."
      />
      <div className="p-6">
        <CompitiAdempimentiBoard />
      </div>
    </>
  );
}
