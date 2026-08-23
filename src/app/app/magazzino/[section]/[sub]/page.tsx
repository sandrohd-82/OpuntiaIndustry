import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { CatalogoOffertaBoard } from "@/components/amministrazione/CatalogoOffertaBoard";
import { MateriePrimeBoard } from "@/components/amministrazione/MateriePrimeBoard";
import { ProdottiPropriBoard } from "@/components/amministrazione/ProdottiPropriBoard";
import { MagazzinoProdottiBoard } from "@/components/magazzino/MagazzinoProdottiBoard";
import { MagazzinoScanBoard } from "@/components/magazzino/MagazzinoScanBoard";
import { NoteAcquistoBoard } from "@/components/magazzino/NoteAcquistoBoard";
import { BarcodeGeneratoreBoard } from "@/components/magazzino/BarcodeGeneratoreBoard";
import { BarcodeRegistratiBoard } from "@/components/magazzino/BarcodeRegistratiBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { resolveMagazzinoPage } from "@/lib/areas/magazzino";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function MagazzinoSubPage({ params }: Props) {
  await requireAreaAccess("magazzino");

  const { section, sub } = await params;

  // Barcode legacy (fuori dal nuovo menu ma ancora raggiungibile)
  if (section === "barcode") {
    if (sub === "generico") {
      redirect("/app/magazzino/barcode/generatore");
    }
    const title =
      sub === "lotto-materia-prima"
        ? "Lotto materia prima"
        : sub === "lotto-prodotto-finito"
          ? "Lotto prodotto finito"
          : "Generatore barcode";
    if (sub === "lotto-materia-prima") {
      return (
        <>
          <AppHeader title={title} subtitle="Barcode registrati Mp" />
          <div className="p-6">
            <BarcodeRegistratiBoard catalogKind="materia_prima" />
          </div>
        </>
      );
    }
    if (sub === "lotto-prodotto-finito") {
      return (
        <>
          <AppHeader title={title} subtitle="Barcode registrati Pr" />
          <div className="p-6">
            <BarcodeRegistratiBoard catalogKind="prodotto_fornitore" />
          </div>
        </>
      );
    }
    if (sub === "generatore") {
      return (
        <>
          <AppHeader title={title} subtitle="Generatore barcode" />
          <div className="p-6">
            <BarcodeGeneratoreBoard />
          </div>
        </>
      );
    }
  }

  const page = resolveMagazzinoPage([section, sub]);
  if (!page) notFound();

  if (section === "materia-prima" && sub === "elenco") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <Suspense
            fallback={
              <p className="text-sm text-[var(--muted)]">Caricamento…</p>
            }
          >
            <MateriePrimeBoard />
          </Suspense>
        </div>
      </>
    );
  }

  if (section === "materia-prima" && sub === "stato") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoProdottiBoard catalogKind="materia_prima" />
        </div>
      </>
    );
  }

  if (section === "prodotti-di-consumo" && sub === "inserisci") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoScanBoard mode="carico" />
        </div>
      </>
    );
  }

  if (section === "prodotti-di-consumo" && sub === "preleva") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoScanBoard mode="scarico" />
        </div>
      </>
    );
  }

  if (section === "prodotti-di-consumo" && sub === "elenco") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <CatalogoOffertaBoard kind="prodotto" />
        </div>
      </>
    );
  }

  if (section === "prodotti-agrinsicilia" && sub === "elenco-e-quantita") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <Suspense
            fallback={
              <p className="text-sm text-[var(--muted)]">Caricamento…</p>
            }
          >
            <ProdottiPropriBoard />
          </Suspense>
        </div>
      </>
    );
  }

  if (section === "note-di-acquisto" && sub === "aperte") {
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
