import { notFound, redirect } from "next/navigation";
import { ClientiBoard } from "@/components/amministrazione/ClientiBoard";
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
  const item = AMMINISTRAZIONE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  // Grafici: hub anno corrente (non redirect alla prima sottovoce)
  if (section === "grafici") {
    const page = resolveAmministrazionePage([section]);
    if (!page) notFound();
    return (
      <>
        <AppHeader title="Grafici" subtitle={page.description} />
        <div className="p-6">
          <GraficiHomeBoard />
        </div>
      </>
    );
  }

  if (section === "clienti") {
    const page = resolveAmministrazionePage([section]);
    if (!page) notFound();
    return (
      <>
        <AppHeader title="Clienti" subtitle={page.description} />
        <div className="p-6">
          <ClientiBoard />
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
