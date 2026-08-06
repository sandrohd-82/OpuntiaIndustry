import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { resolveAmministrazionePage } from "@/lib/areas/amministrazione";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function AmministrazioneSubPage({ params }: Props) {
  await requireAreaAccess("amministrazione");

  const { section, sub } = await params;
  const page = resolveAmministrazionePage([section, sub]);
  if (!page) notFound();

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
