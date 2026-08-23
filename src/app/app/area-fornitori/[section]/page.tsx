import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  AREA_FORNITORI_SECTIONS,
  resolveAreaFornitoriPage,
} from "@/lib/areas/area-fornitori";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function AreaFornitoriSectionPage({ params }: Props) {
  await requireAreaAccess("area-fornitori");
  const { section } = await params;
  const item = AREA_FORNITORI_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveAreaFornitoriPage([section]);
  if (!page) notFound();

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <AreaPlaceholder title={page.label} description={page.description} />
      </div>
    </>
  );
}
