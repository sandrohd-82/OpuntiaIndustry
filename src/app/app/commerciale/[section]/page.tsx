import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import {
  COMMERCIALE_SECTIONS,
  resolveCommercialePage,
} from "@/lib/areas/commerciale";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function CommercialeSectionPage({ params }: Props) {
  await requireAreaAccess("commerciale");

  const { section } = await params;
  const item = COMMERCIALE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveCommercialePage([section]);
  if (!page) notFound();

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
