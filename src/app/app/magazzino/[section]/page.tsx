import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  MAGAZZINO_SECTIONS,
  resolveMagazzinoPage,
} from "@/lib/areas/magazzino";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function MagazzinoSectionPage({ params }: Props) {
  await requireAreaAccess("magazzino");
  const { section } = await params;

  // Legacy flat → nuovi path
  if (section === "prodotti") {
    redirect("/app/magazzino/prodotti-di-consumo/elenco");
  }
  if (section === "carico") {
    redirect("/app/magazzino/prodotti-di-consumo/inserisci");
  }
  if (section === "scarico") {
    redirect("/app/magazzino/prodotti-di-consumo/preleva");
  }
  if (section === "note-di-acquisto") {
    redirect("/app/magazzino/note-di-acquisto/aperte");
  }
  if (section === "barcode") {
    redirect("/app/magazzino/barcode/generatore");
  }
  if (section === "materia-prima") {
    redirect("/app/magazzino/materia-prima/stato");
  }

  const item = MAGAZZINO_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveMagazzinoPage([section]);
  if (!page) notFound();

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <AreaPlaceholder title={page.label} description={page.description} />
      </div>
    </>
  );
}
