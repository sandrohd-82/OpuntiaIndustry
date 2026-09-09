import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireWebmailAccess } from "@/lib/areas/guard";
import { isWebmailUuid } from "@/lib/webmail/casella-path";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ accountId: string }>;
};

export default async function WebmailInArrivoPage({ params }: Props) {
  await requireWebmailAccess();
  const { accountId } = await params;
  if (!isWebmailUuid(accountId)) notFound();

  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from("webmail_accounts")
    .select("id, label, email_address")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !account) notFound();

  return (
    <AppHeader
      title={`${account.label} · In Arrivo`}
      subtitle={`${account.email_address} · mail senza categoria`}
    />
  );
}
