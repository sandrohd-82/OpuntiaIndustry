import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { BarcodeGeneratoreBoard } from "@/components/magazzino/BarcodeGeneratoreBoard";
import { MagazzinoProdottiBoard } from "@/components/magazzino/MagazzinoProdottiBoard";
import { MagazzinoScanBoard } from "@/components/magazzino/MagazzinoScanBoard";
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

  if (section === "materia-prima") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoProdottiBoard catalogKind="materia_prima" />
        </div>
      </>
    );
  }

  if (section === "prodotti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoProdottiBoard catalogKind="prodotto_fornitore" />
        </div>
      </>
    );
  }

  if (section === "carico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoScanBoard mode="carico" />
        </div>
      </>
    );
  }

  if (section === "scarico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoScanBoard mode="scarico" />
        </div>
      </>
    );
  }

  if (section === "barcode") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <BarcodeGeneratoreBoard />
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

  notFound();
}
