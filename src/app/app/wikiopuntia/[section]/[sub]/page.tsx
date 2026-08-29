import { notFound } from "next/navigation";
import { WikiBibliotecaBoard } from "@/components/wikiopuntia/WikiBibliotecaBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveWikiopuntiaPage } from "@/lib/areas/wikiopuntia";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function WikiopuntiaSubPage({ params }: Props) {
  await requireAreaAccess("wikiopuntia");
  const { section, sub } = await params;
  const page = resolveWikiopuntiaPage([section, sub]);
  if (!page) notFound();

  if (section === "biblioteca") {
    const mode =
      sub === "nuova" ? "nuova" : sub === "archivio" ? "archivio" : "elenco";
    if (sub !== "nuova" && sub !== "archivio" && sub !== "elenco") notFound();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <WikiBibliotecaBoard mode={mode} />
        </div>
      </>
    );
  }

  notFound();
}
