import { notFound } from "next/navigation";
import { OrdiniRicevutiBoard } from "@/components/amministrazione/OrdiniRicevutiBoard";
import { AppHeader } from "@/components/layout/AppHeader";
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

  if (section === "ordini" && sub === "crea-nuovo") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniRicevutiBoard />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6" />
    </>
  );
}
