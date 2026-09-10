import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfiloFiscaleForm } from "@/components/settings/ProfiloFiscaleForm";
import { TotpSetupForm } from "@/components/settings/TotpSetupForm";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";

export default async function ImpostazioniPage() {
  const { auth, meta } = await requireAreaAccess("impostazioni");

  if (!isAdminLikeProfile(auth.profile)) {
    notFound();
  }

  return (
    <>
      <AppHeader title={meta.label} subtitle={meta.description} />
      <div className="space-y-10 p-6">
        <TotpSetupForm />
        <ProfiloFiscaleForm />
      </div>
    </>
  );
}
