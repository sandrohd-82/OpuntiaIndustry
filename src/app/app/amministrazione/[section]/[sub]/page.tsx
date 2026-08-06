import { notFound } from "next/navigation";
import { FornitoriBoard } from "@/components/amministrazione/FornitoriBoard";
import { OrdiniRicevutiBoard } from "@/components/amministrazione/OrdiniRicevutiBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
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

  if (section === "ordini" && sub === "ricevuti") {
    return (
      <>
        <AppHeader title="Ordini ricevuti" subtitle={page.description} />
        <div className="p-6">
          <OrdiniRicevutiBoard />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "fornitori") {
    return (
      <>
        <AppHeader title="Fornitori" subtitle={page.description} />
        <div className="p-6">
          <FornitoriBoard />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
