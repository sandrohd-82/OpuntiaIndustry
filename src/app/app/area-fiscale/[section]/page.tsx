import { notFound, redirect } from "next/navigation";
import { DashboardFiscaleBoard } from "@/components/amministrazione/DashboardFiscaleBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  AREA_FISCALE_SECTIONS,
  resolveAreaFiscalePage,
} from "@/lib/areas/area-fiscale";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function AreaFiscaleSectionPage({ params }: Props) {
  await requireAreaAccess("area-fiscale");

  const { section } = await params;
  const item = AREA_FISCALE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveAreaFiscalePage([section]);
  if (!page) notFound();

  if (section === "dati-e-calcoli") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <DashboardFiscaleBoard />
        </div>
      </>
    );
  }

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
