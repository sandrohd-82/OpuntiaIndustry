import { notFound } from "next/navigation";
import { WebmailBoard } from "@/components/commerciale/WebmailBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireWebmailAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ accountId: string }>;
};

export default async function WebmailCasellaPage({ params }: Props) {
  await requireWebmailAccess();
  const { accountId } = await params;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(accountId)) notFound();

  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from("webmail_accounts")
    .select("id, label, email_address")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !account) notFound();

  return (
    <>
      <AppHeader
        title={account.label}
        subtitle={`${account.email_address} · messaggi e bozze AI`}
      />
      <div className="p-6">
        <WebmailBoard initialAccountId={account.id} />
      </div>
    </>
  );
}
