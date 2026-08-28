import { AppHeader } from "@/components/layout/AppHeader";
import { WebmailAdminCaselleBoard } from "@/components/webmail/WebmailAdminCaselleBoard";
import { WebmailBlacklistBoard } from "@/components/webmail/WebmailBlacklistBoard";
import { requireSuperadmin } from "@/lib/areas/guard";

export default async function WebmailImpostazioniPage() {
  await requireSuperadmin();

  return (
    <>
      <AppHeader
        title="Impostazioni caselle WebMail"
        subtitle="Solo SuperAdmin — caselle, profili e blacklist mittenti"
      />
      <div className="space-y-6 p-6">
        <WebmailAdminCaselleBoard />
        <WebmailBlacklistBoard />
      </div>
    </>
  );
}
