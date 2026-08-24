import { notFound, redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  RICERCA_SVILUPPO_SECTIONS,
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

  notFound();
}
