import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { FogliIngressoElenco } from "@/components/produzione/FogliIngressoElenco";
import { FoglioIngressoScheda } from "@/components/produzione/FoglioIngressoScheda";
import {
  leggiFoglioIngressoAction,
  listFogliIngressoAction,
} from "@/app/actions/foglio-ingresso";
import { ControlloProcessoDettaglio } from "@/components/produzione/ControlloProcessiVista";
import { LineeGuidaFornitore } from "@/components/produzione/LineeGuidaFornitore";
import { listLineeGuidaRicevuteAction } from "@/app/actions/haccp-linee-guida";
import { processoControlloBySlug } from "@/lib/produzione/controllo-processi";
import { contestoMaterialeIngresso } from "@/lib/produzione/fornitore-accesso-server";
import {
  AREA_FORNITORI_SECTIONS,
  resolveAreaFornitoriPage,
} from "@/lib/areas/area-fornitori";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ foglio?: string }>;
};

export default async function AreaFornitoriSectionPage({ params, searchParams }: Props) {
  await requireAreaAccess("area-fornitori");
  const { section } = await params;
  const item = AREA_FORNITORI_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveAreaFornitoriPage([section]);
  if (!page) notFound();

  if (section === "linee-guida") {
    const ricevute = await listLineeGuidaRicevuteAction();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          {ricevute.success ? (
            <LineeGuidaFornitore guide={ricevute.guide} />
          ) : (
            <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {ricevute.error}
            </p>
          )}
        </div>
      </>
    );
  }

  if (section === "materiale-in-ingresso") {
    const processo = processoControlloBySlug("materiale-in-ingresso");
    if (!processo) notFound();
    const accesso = await contestoMaterialeIngresso(null);
    if (accesso.esito === "negato") {
      return (
        <>
          <AppHeader title={page.label} subtitle={page.description} />
          <div className="p-6">
            <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {accesso.motivo === "non_collegato"
                ? "Il tuo utente non è collegato a un fornitore. I dati riservati restano chiusi finché Agrinsicilia non associa l'anagrafica."
                : "Accesso non consentito ai dati di questo fornitore."}
            </p>
          </div>
        </>
      );
    }
    const query = await searchParams;
    if (query.foglio) {
      const dettaglio = await leggiFoglioIngressoAction("fornitore", query.foglio);
      return (
        <>
          <AppHeader title={page.label} subtitle={page.description} />
          <div className="p-6">
            {dettaglio.success ? (
              <FoglioIngressoScheda vista="fornitore" foglio={dettaglio.foglio} />
            ) : (
              <p className="text-sm text-red-700">{dettaglio.error}</p>
            )}
          </div>
        </>
      );
    }
    const elenco = await listFogliIngressoAction("fornitore");
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="space-y-8 p-6">
          {elenco.success ? (
            <FogliIngressoElenco vista="fornitore" fogli={elenco.fogli} fornitori={[]} />
          ) : (
            <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {elenco.error}
            </p>
          )}
          <ControlloProcessoDettaglio processo={processo} soloFornitore />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <AreaPlaceholder title={page.label} description={page.description} />
      </div>
    </>
  );
}
