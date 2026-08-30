import { notFound, redirect } from "next/navigation";
import { PortaleRichiesteBoard } from "@/components/amministrazione/PortaleLeadBoard";
import { WikiKbBoard } from "@/components/wikiopuntia/WikiKbBoard";
import { WikiRichiesteBoard } from "@/components/wikiopuntia/WikiRichiesteBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isNavBranch } from "@/lib/areas/nav-tree";
import {
  resolveWikiopuntiaPage,
  WIKIOPUNTIA_SECTIONS,
} from "@/lib/areas/wikiopuntia";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function WikiopuntiaSectionPage({ params }: Props) {
  await requireAreaAccess("wikiopuntia");
  const { section } = await params;
  const item = WIKIOPUNTIA_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveWikiopuntiaPage([section]);
  if (!page) notFound();

  if (section === "knowledge-base") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <WikiKbBoard />
        </div>
      </>
    );
  }

  if (section === "richieste-contatto") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PortaleRichiesteBoard origine="wikiopuntia" />
        </div>
      </>
    );
  }

  if (section === "richieste-documenti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <WikiRichiesteBoard />
        </div>
      </>
    );
  }

  notFound();
}
