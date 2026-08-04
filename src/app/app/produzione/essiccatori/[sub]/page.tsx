import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzionePage } from "@/lib/areas/produzione";

type Props = {
  params: Promise<{ sub: string }>;
};

export default async function EssiccatoriSubPage({ params }: Props) {
  await requireAreaAccess("produzione");

  const { sub } = await params;
  const page = resolveProduzionePage(["essiccatori", sub]);
  if (!page) notFound();

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
