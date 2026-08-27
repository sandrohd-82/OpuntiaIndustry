import { WebmailBoard } from "@/components/commerciale/WebmailBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireWebmailAccess } from "@/lib/areas/guard";

export default async function WebmailCasellePage() {
  await requireWebmailAccess();

  return (
    <>
      <AppHeader
        title="Caselle mail"
        subtitle="Tutte le caselle mail collegate — messaggi, categorie e bozze AI"
      />
      <div className="p-6">
        <WebmailBoard />
      </div>
    </>
  );
}
