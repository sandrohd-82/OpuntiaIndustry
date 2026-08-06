import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
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
