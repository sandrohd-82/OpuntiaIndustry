import { notFound } from "next/navigation";
import { WebmailBoard } from "@/components/commerciale/WebmailBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireWebmailAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ accountId: string; categoriaId: string }>;
};

export default async function WebmailCategoriaPage({ params }: Props) {
  await requireWebmailAccess();
  const { accountId, categoriaId } = await params;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(accountId) || !uuidRe.test(categoriaId)) notFound();

  const supabase = await createClient();
  const [{ data: account, error: accErr }, { data: cat, error: catErr }] =
    await Promise.all([
      supabase
        .from("webmail_accounts")
        .select("id, label, email_address")
        .eq("id", accountId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("webmail_categorie")
        .select("id, nome, colore")
        .eq("id", categoriaId)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);

  if (accErr || !account || catErr || !cat) notFound();

  return (
    <>
      <AppHeader
        title={`${account.label} · ${cat.nome}`}
        subtitle={`${account.email_address} · categoria`}
      />
      <div className="p-6">
        <WebmailBoard
          initialAccountId={account.id}
          view="categoria"
          categoriaId={cat.id}
          hideTopFilters
        />
      </div>
    </>
  );
}
