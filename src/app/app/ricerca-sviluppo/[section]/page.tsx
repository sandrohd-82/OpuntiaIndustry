import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { RsRicercheBoard } from "@/components/ricerca-sviluppo/RsRicercheBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  RICERCA_SVILUPPO_SECTIONS,
  resolveRicercaSviluppoPage,
} from "@/lib/areas/ricerca-sviluppo";
import { isNavBranch } from "@/lib/areas/nav-tree";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function RicercaSviluppoSectionPage({ params }: Props) {
  await requireAreaAccess("ricerca-sviluppo");
  const { section } = await params;
  const item = RICERCA_SVILUPPO_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveRicercaSviluppoPage([section]);
  if (!page) notFound();

  if (section === "archivio-ricerche-scientifiche") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <RsRicercheBoard tipo={null} mode="archivio" />
        </div>
      </>
    );
  }

  notFound();
}
