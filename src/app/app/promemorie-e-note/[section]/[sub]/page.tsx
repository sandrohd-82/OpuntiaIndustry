import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { PromemorieENoteBoard } from "@/components/promemorie-e-note/PromemorieENoteBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolvePromemorieENotePage } from "@/lib/areas/promemorie-e-note";
import { getAuthContext } from "@/lib/auth/session";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

const KINDS = new Set(["promemoria", "attivita", "note"]);
const MODES = new Set(["nuova", "elenco", "calendario"]);

export default async function PromemorieENoteSubPage({ params }: Props) {
  await requireAreaAccess("promemorie-e-note");
  const auth = await getAuthContext();
  if (!auth) notFound();

  const { section, sub } = await params;
  if (!KINDS.has(section) || !MODES.has(sub)) notFound();

  const page = resolvePromemorieENotePage([section, sub]);
  if (!page) notFound();

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <PromemorieENoteBoard
          kind={section as "promemoria" | "attivita" | "note"}
          mode={sub as "nuova" | "elenco" | "calendario"}
          userId={auth.userId}
        />
      </div>
    </>
  );
}
