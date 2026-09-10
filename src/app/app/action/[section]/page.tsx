import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import {
  ACTION_SECTIONS,
  resolveActionPage,
} from "@/lib/areas/action";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isNavBranch } from "@/lib/areas/nav-tree";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function ActionSectionPage({ params }: Props) {
  await requireAreaAccess("action");
  const { section } = await params;
  const item = ACTION_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveActionPage([section]);
  if (!page) notFound();

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
