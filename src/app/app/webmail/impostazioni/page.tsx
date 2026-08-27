import { AppHeader } from "@/components/layout/AppHeader";
import { WebmailAdminCaselleBoard } from "@/components/webmail/WebmailAdminCaselleBoard";
import { requireSuperadmin } from "@/lib/areas/guard";

export default async function WebmailImpostazioniPage() {
  await requireSuperadmin();

  return (
    <>
      <AppHeader
        title="Impostazioni caselle WebMail"
        subtitle="Solo SuperAdmin — collega caselle Aruba/Gmail ai profili"
      />
      <div className="p-6">
        <WebmailAdminCaselleBoard />
      </div>
    </>
  );
}
