import { notFound, redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  PROMEMORIE_E_NOTE_SECTIONS,
  resolvePromemorieENotePage,
} from "@/lib/areas/promemorie-e-note";
import { isNavBranch } from "@/lib/areas/nav-tree";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function PromemorieENoteSectionPage({ params }: Props) {
  await requireAreaAccess("promemorie-e-note");
  const { section } = await params;
  const item = PROMEMORIE_E_NOTE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolvePromemorieENotePage([section]);
  if (!page) notFound();
  notFound();
}
