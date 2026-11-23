import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
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
    const { listLineeGuidaRicevuteAction } = await import(
      "@/app/actions/haccp-linee-guida"
    );
    const { LineeGuidaFornitore } = await import(
      "@/components/produzione/LineeGuidaFornitore"
    );
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

  if (section === "documenti") {
    const { listaDocumentiAbilitazionePortaleAction } = await import(
      "@/app/actions/requisiti-fornitore"
    );
    const { DocumentiAbilitazioneFornitore } = await import(
      "@/components/produzione/DocumentiAbilitazioneFornitore"
    );
    const documenti = await listaDocumentiAbilitazionePortaleAction();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          {documenti.success ? (
            <DocumentiAbilitazioneFornitore documenti={documenti.documenti} />
          ) : (
            <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {documenti.error}
            </p>
          )}
        </div>
      </>
    );
  }

  if (section === "ordini-ricevuti") {
    const { listaOrdiniRicevutiAction } = await import(
      "@/app/actions/approvvigionamento-portale"
    );
    const { OrdiniRicevutiFornitore } = await import(
      "@/components/produzione/OrdiniRicevutiFornitore"
    );
    const ricevuti = await listaOrdiniRicevutiAction();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-4 md:p-6">
          {ricevuti.success ? (
            <OrdiniRicevutiFornitore
              fornitore={ricevuti.fornitore}
              ordini={ricevuti.ordini}
              piani={ricevuti.piani}
            />
          ) : (
            <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {ricevuti.error}
            </p>
          )}
        </div>
      </>
    );
  }

  if (section === "materiale-in-ingresso") {
    const { processoControlloBySlug } = await import(
      "@/lib/produzione/controllo-processi"
    );
    const { contestoMaterialeIngresso } = await import(
      "@/lib/produzione/fornitore-accesso-server"
    );
    const processo = processoControlloBySlug("materiale-in-ingresso");
    if (!processo) notFound();
    const accesso = await contestoMaterialeIngresso(null);
    if (accesso.esito === "negato") {
      const testo =
        accesso.motivo === "non_collegato"
          ? "Il tuo utente non è collegato a un fornitore. I dati riservati restano chiusi finché Agrinsicilia non associa l'anagrafica."
          : "Accesso non consentito ai dati di questo fornitore.";
      return (
        <>
          <AppHeader title={page.label} subtitle={page.description} />
          <div className="p-6">
            <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {testo}
            </p>
          </div>
        </>
      );
    }
    const { leggiFoglioIngressoAction, listFogliIngressoAction } = await import(
      "@/app/actions/foglio-ingresso"
    );
    const { FoglioIngressoScheda } = await import(
      "@/components/produzione/FoglioIngressoScheda"
    );
    const { FogliIngressoElenco } = await import(
      "@/components/produzione/FogliIngressoElenco"
    );
    const { ControlloProcessoDettaglio } = await import(
      "@/components/produzione/ControlloProcessiVista"
    );
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
            <FogliIngressoElenco vista="fornitore" fogli={elenco.fogli} />
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

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
