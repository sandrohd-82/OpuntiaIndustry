import { notFound, redirect } from "next/navigation";
import { requireWebmailAccess } from "@/lib/areas/guard";
import { canUseWebmailAccount } from "@/lib/webmail/account-access";
import { isWebmailUuid } from "@/lib/webmail/casella-path";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ accountId: string }>;
};

/** Redirect legacy `/caselle/[id]` → In Arrivo. */
export default async function WebmailCasellaRedirectPage({ params }: Props) {
  const { auth } = await requireWebmailAccess();
  const { accountId } = await params;

  if (!isWebmailUuid(accountId)) notFound();
  if (!(await canUseWebmailAccount(auth, accountId))) notFound();

  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from("webmail_accounts")
    .select("id")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !account) notFound();

  redirect(`/app/webmail/caselle/${accountId}/in-arrivo`);
}
