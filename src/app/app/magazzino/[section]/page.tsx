import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { MagazzinoProdottiBoard } from "@/components/magazzino/MagazzinoProdottiBoard";
import { NoteAcquistoBoard } from "@/components/magazzino/NoteAcquistoBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveMagazzinoPage } from "@/lib/areas/magazzino";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function MagazzinoSectionPage({ params }: Props) {
  await requireAreaAccess("magazzino");
  const { section } = await params;
  const page = resolveMagazzinoPage([section]);
  if (!page) notFound();

  if (section === "prodotti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoProdottiBoard />
        </div>
      </>
    );
  }

  if (section === "note-di-acquisto") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <NoteAcquistoBoard />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
