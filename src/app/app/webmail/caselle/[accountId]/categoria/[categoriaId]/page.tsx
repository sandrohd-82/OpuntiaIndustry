import { AppHeader } from "@/components/layout/AppHeader";
import { requireWebmailAccess } from "@/lib/areas/guard";
import { isWebmailUuid } from "@/lib/webmail/casella-path";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ accountId: string; categoriaId: string }>;
};

export default async function WebmailCategoriaPage({ params }: Props) {
  await requireWebmailAccess();
  const { accountId, categoriaId } = await params;

  const supabase = await createClient();
  const [{ data: account }, { data: cat }] = await Promise.all([
    isWebmailUuid(accountId)
      ? supabase
          .from("webmail_accounts")
          .select("id, label, email_address")
          .eq("id", accountId)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isWebmailUuid(categoriaId)
      ? supabase
          .from("webmail_categorie")
          .select("id, nome")
          .eq("id", categoriaId)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const title = `${account?.label ?? "Casella"} · ${cat?.nome ?? "Categoria"}`;
  const subtitle = `${account?.email_address ?? ""} · categoria`.trim();

  return <AppHeader title={title} subtitle={subtitle} />;
}
