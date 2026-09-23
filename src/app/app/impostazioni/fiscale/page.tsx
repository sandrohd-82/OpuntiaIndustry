import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfiloFiscaleForm } from "@/components/settings/ProfiloFiscaleForm";
import { TotpSetupForm } from "@/components/settings/TotpSetupForm";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";

export default async function ImpostazioniFiscalePage() {
  const { auth } = await requireAreaAccess("impostazioni");

  if (!isAdminLikeProfile(auth.profile)) {
    notFound();
  }

  return (
    <>
      <AppHeader
        title="Fiscale"
        subtitle="2FA e profilo fiscale aziendale"
      />
      <div className="space-y-10 p-6">
        <TotpSetupForm />
        <ProfiloFiscaleForm />
      </div>
    </>
  );
}
