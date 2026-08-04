import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getProduzioneSection } from "@/lib/areas/produzione";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function ProduzioneSectionPage({ params }: Props) {
  await requireAreaAccess("produzione");

  const { section: sectionSlug } = await params;
  const section = getProduzioneSection(sectionSlug);
  if (!section) notFound();

  return (
    <AreaPlaceholder title={section.label} description={section.description} />
  );
}
