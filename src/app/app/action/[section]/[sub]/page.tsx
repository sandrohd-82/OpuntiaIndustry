import { notFound } from "next/navigation";
import { ActionEssiccatoriBoard } from "@/components/action/ActionEssiccatoriBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { resolveActionPage } from "@/lib/areas/action";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isSuperadminProfile } from "@/lib/auth/roles";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function ActionSubPage({ params }: Props) {
  const { auth } = await requireAreaAccess("action");
  const { section, sub } = await params;
  const page = resolveActionPage([section, sub]);
  if (!page) notFound();

  if (section === "aree" && sub === "essiccatori") {
    const canPosition =
      isSuperadminProfile(auth.profile) && !auth.impersonating;
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ActionEssiccatoriBoard canPosition={canPosition} />
        </div>
      </>
    );
  }

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
