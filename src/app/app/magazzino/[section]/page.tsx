import { notFound, redirect } from "next/navigation";
import { MagazzinoProdottiBoard } from "@/components/magazzino/MagazzinoProdottiBoard";
import { MagazzinoScanBoard } from "@/components/magazzino/MagazzinoScanBoard";
import { NoteAcquistoBoard } from "@/components/magazzino/NoteAcquistoBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  MAGAZZINO_SECTIONS,
  resolveMagazzinoPage,
} from "@/lib/areas/magazzino";
import { firstLeafPath, isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function MagazzinoSectionPage({ params }: Props) {
  await requireAreaAccess("magazzino");
  const { section } = await params;
  const item = MAGAZZINO_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (section === "materia-prima") {
    const page = resolveMagazzinoPage([section]);
    if (!page) notFound();
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
    const page = resolveMagazzinoPage([section]);
    if (!page) notFound();
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
    const page = resolveMagazzinoPage([section]);
    if (!page) notFound();
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
    const page = resolveMagazzinoPage([section]);
    if (!page) notFound();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoScanBoard mode="scarico" />
        </div>
      </>
    );
  }

  if (section === "note-di-acquisto") {
    const page = resolveMagazzinoPage([section]);
    if (!page) notFound();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <NoteAcquistoBoard />
        </div>
      </>
    );
  }

  if (isNavBranch(item)) {
    redirect(firstLeafPath(item));
  }

  const page = resolveMagazzinoPage([section]);
  if (!page) notFound();

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
