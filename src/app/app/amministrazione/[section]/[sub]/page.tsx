import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { GraficiIncassiBoard } from "@/components/amministrazione/grafici/GraficiIncassiBoard";
import { GraficiMateriaPrimaBoard } from "@/components/amministrazione/grafici/GraficiMateriaPrimaBoard";
import { GraficiOrdiniBoard } from "@/components/amministrazione/grafici/GraficiOrdiniBoard";
import { GraficiProduttivitaBoard } from "@/components/amministrazione/grafici/GraficiProduttivitaBoard";
import { CatalogoOffertaBoard } from "@/components/amministrazione/CatalogoOffertaBoard";
import { MateriePrimeBoard } from "@/components/amministrazione/MateriePrimeBoard";
import { ProdottiPropriBoard } from "@/components/amministrazione/ProdottiPropriBoard";
import { FattureBoard } from "@/components/amministrazione/FattureBoard";
import { OrdiniRicevutiBoard } from "@/components/amministrazione/OrdiniRicevutiBoard";
import { OrdiniStoricoBoard } from "@/components/amministrazione/OrdiniStoricoBoard";
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

  if (section === "ordini" && sub === "storico") {
    return (
      <>
        <AppHeader title="Storico ordini" subtitle={page.description} />
        <div className="p-6">
          <OrdiniStoricoBoard />
        </div>
      </>
    );
  }

  // Redirect: sottovoci fornitori rimosse → unica pagina con filtri
  if (section === "fornitori") {
    redirect("/app/amministrazione/fornitori");
  }

  // Redirect compatibilità vecchi percorsi
  if (section === "schede" && sub === "fornitori") {
    redirect("/app/amministrazione/fornitori");
  }
  if (section === "schede" && sub === "clienti") {
    redirect("/app/amministrazione/clienti");
  }

  if (section === "schede" && sub === "materia-prima") {
    return (
      <>
        <AppHeader title="Materia prima" subtitle={page.description} />
        <div className="p-6">
          <Suspense
            fallback={
              <p className="text-sm text-[var(--muted)]">
                Caricamento materie prime…
              </p>
            }
          >
            <MateriePrimeBoard />
          </Suspense>
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "servizi") {
    return (
      <>
        <AppHeader title="Servizi" subtitle={page.description} />
        <div className="p-6">
          <CatalogoOffertaBoard kind="servizio" />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "prodotti") {
    return (
      <>
        <AppHeader title="Prodotti" subtitle={page.description} />
        <div className="p-6">
          <CatalogoOffertaBoard kind="prodotto" />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "prodotti-propri") {
    return (
      <>
        <AppHeader title="Prodotti Agrinsicilia" subtitle={page.description} />
        <div className="p-6">
          <Suspense
            fallback={
              <p className="text-sm text-[var(--muted)]">
                Caricamento prodotti Agrinsicilia…
              </p>
            }
          >
            <ProdottiPropriBoard />
          </Suspense>
        </div>
      </>
    );
  }

  if (section === "grafici" && sub === "produttivita") {
    return (
      <>
        <AppHeader title="Produttività" subtitle={page.description} />
        <div className="p-6">
          <GraficiProduttivitaBoard />
        </div>
      </>
    );
  }

  if (section === "grafici" && sub === "ordini") {
    return (
      <>
        <AppHeader title="Grafici ordini" subtitle={page.description} />
        <div className="p-6">
          <GraficiOrdiniBoard />
        </div>
      </>
    );
  }

  if (section === "grafici" && sub === "materia-prima") {
    return (
      <>
        <AppHeader title="Grafici materia prima" subtitle={page.description} />
        <div className="p-6">
          <GraficiMateriaPrimaBoard />
        </div>
      </>
    );
  }

  if (section === "grafici" && sub === "incassi") {
    return (
      <>
        <AppHeader title="Incassi" subtitle={page.description} />
        <div className="p-6">
          <GraficiIncassiBoard />
        </div>
      </>
    );
  }

  if (section === "fatture" && sub === "inviate") {
    return (
      <>
        <AppHeader title="Fatture inviate" subtitle={page.description} />
        <div className="p-6">
          <FattureBoard type="issued" />
        </div>
      </>
    );
  }

  if (section === "fatture" && sub === "ricevute") {
    return (
      <>
        <AppHeader title="Fatture ricevute" subtitle={page.description} />
        <div className="p-6">
          <FattureBoard type="received" />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
