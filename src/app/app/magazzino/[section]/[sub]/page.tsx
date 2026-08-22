import { notFound, redirect } from "next/navigation";
import { BarcodeRegistratiBoard } from "@/components/magazzino/BarcodeRegistratiBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  getMagazzinoFirstLeafPath,
  resolveMagazzinoPage,
} from "@/lib/areas/magazzino";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function MagazzinoSubPage({ params }: Props) {
  await requireAreaAccess("magazzino");

  const { section, sub } = await params;

  // Compatibilità: vecchio /barcode/generico → ramo Generatore
  if (section === "barcode" && sub === "generico") {
    redirect("/app/magazzino/barcode/generatore/generico");
  }

  const page = resolveMagazzinoPage([section, sub]);
  if (!page) notFound();

  if (section === "barcode" && sub === "lotto-materia-prima") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <BarcodeRegistratiBoard catalogKind="materia_prima" />
        </div>
      </>
    );
  }

  if (section === "barcode" && sub === "lotto-prodotto-finito") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <BarcodeRegistratiBoard catalogKind="prodotto_fornitore" />
        </div>
      </>
    );
  }

  if (section === "barcode" && sub === "generatore") {
    const first = getMagazzinoFirstLeafPath([section, sub]);
    if (!first) notFound();
    redirect(first);
  }

  notFound();
}
