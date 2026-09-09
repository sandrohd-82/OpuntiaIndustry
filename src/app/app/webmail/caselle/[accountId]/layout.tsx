import { notFound } from "next/navigation";
import { WebmailCasellaShell } from "@/components/webmail/WebmailAccountFolderNav";
import { requireWebmailAccess } from "@/lib/areas/guard";
import { isWebmailUuid } from "@/lib/webmail/casella-path";
import { createClient } from "@/lib/supabase/server";

type Props = {
  children: React.ReactNode;
  params: Promise<{ accountId: string }>;
};

export default async function WebmailCasellaLayout({ children, params }: Props) {
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
    <>
      {children}
      <div className="p-6">
        <WebmailCasellaShell
          accountId={account.id}
          accountLabel={account.label}
          accountEmail={account.email_address}
        />
      </div>
    </>
  );
}
