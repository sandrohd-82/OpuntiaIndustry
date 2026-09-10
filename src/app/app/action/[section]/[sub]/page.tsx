import { notFound } from "next/navigation";
import { ActionEssiccatoriBoard } from "@/components/action/ActionEssiccatoriBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
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

  if (section === "aree" && sub === "essiccatori") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ActionEssiccatoriBoard />
        </div>
      </>
    );
  }

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
