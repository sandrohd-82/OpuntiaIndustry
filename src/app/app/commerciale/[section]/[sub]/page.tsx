import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { resolveCommercialePage } from "@/lib/areas/commerciale";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function CommercialeSubPage({ params }: Props) {
  await requireAreaAccess("commerciale");

  const { section, sub } = await params;
  const page = resolveCommercialePage([section, sub]);
  if (!page) notFound();

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
