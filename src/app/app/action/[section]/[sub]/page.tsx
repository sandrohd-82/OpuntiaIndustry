import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { resolveActionPage } from "@/lib/areas/action";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function ActionSubPage({ params }: Props) {
  await requireAreaAccess("action");
  const { section, sub } = await params;
  const page = resolveActionPage([section, sub]);
  if (!page) notFound();

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
