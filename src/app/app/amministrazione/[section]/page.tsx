import { notFound, redirect } from "next/navigation";
import { GraficiHomeBoard } from "@/components/amministrazione/grafici/GraficiHomeBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  AMMINISTRAZIONE_SECTIONS,
  resolveAmministrazionePage,
} from "@/lib/areas/amministrazione";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function AmministrazioneSectionPage({ params }: Props) {
  await requireAreaAccess("amministrazione");

  const { section } = await params;

  // Compatibilità percorsi legacy
  if (section === "fatture") {
    redirect("/app/area-fiscale/fatture");
  }
  if (section === "grafici") {
    redirect("/app/amministrazione/statistiche");
  }
  if (section === "dipendenti") {
    redirect("/app/amministrazione/organigramma");
  }
  if (section === "clienti") {
    redirect("/app/amministrazione/clienti/elenco");
  }
  if (section === "fornitori") {
    redirect("/app/amministrazione/fornitori/elenco");
  }

  const item = AMMINISTRAZIONE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (section === "statistiche") {
    const page = resolveAmministrazionePage([section]);
    if (!page) notFound();
    return (
      <>
        <AppHeader title="Statistiche" subtitle={page.description} />
        <div className="p-6">
          <GraficiHomeBoard />
        </div>
      </>
    );
  }

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveAmministrazionePage([section]);
  if (!page) notFound();

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
