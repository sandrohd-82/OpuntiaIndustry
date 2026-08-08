import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ClientiBoard } from "@/components/amministrazione/ClientiBoard";
import { FornitoriBoard } from "@/components/amministrazione/FornitoriBoard";
import { MateriePrimeBoard } from "@/components/amministrazione/MateriePrimeBoard";
import { ProdottiPropriBoard } from "@/components/amministrazione/ProdottiPropriBoard";
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

  if (section === "schede" && sub === "clienti") {
    return (
      <>
        <AppHeader title="Clienti" subtitle={page.description} />
        <div className="p-6">
          <ClientiBoard />
        </div>
      </>
    );
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

  if (section === "schede" && sub === "prodotti-propri") {
    return (
      <>
        <AppHeader title="Prodotti propri" subtitle={page.description} />
        <div className="p-6">
          <Suspense
            fallback={
              <p className="text-sm text-[var(--muted)]">
                Caricamento prodotti propri…
              </p>
            }
          >
            <ProdottiPropriBoard />
          </Suspense>
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
