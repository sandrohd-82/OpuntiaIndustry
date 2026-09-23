import { notFound } from "next/navigation";
import { SediBoard } from "@/components/impostazioni/SediBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";

export default async function ImpostazioniSediPage() {
  const { auth } = await requireAreaAccess("impostazioni");

  if (!isAdminLikeProfile(auth.profile)) {
    notFound();
  }

  return (
    <>
      <AppHeader
        title="Sedi"
        subtitle="Catalogo delle sedi aziendali (Maps, tipo, partenza spedizioni)"
      />
      <div className="p-6">
        <SediBoard />
      </div>
    </>
  );
}
