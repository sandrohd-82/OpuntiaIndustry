import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { TotpSetupForm } from "@/components/settings/TotpSetupForm";
import { getTotpStatus } from "@/app/actions/totp";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";

export default async function ImpostazioniPage() {
  const { auth, meta } = await requireAreaAccess("impostazioni");

  if (!isAdminLikeProfile(auth.profile)) {
    notFound();
  }

  const status = await getTotpStatus();

  return (
    <>
      <AppHeader title={meta.label} subtitle={meta.description} />
      <div className="p-6">
        <TotpSetupForm initiallyEnabled={Boolean(status.enabled)} />
      </div>
    </>
  );
}
