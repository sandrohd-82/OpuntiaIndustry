import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { FogliInEsecuzioneBoard } from "@/components/produzione/FogliInEsecuzioneBoard";
import { FogliLavorazioneBoard } from "@/components/produzione/FogliLavorazioneBoard";
import { GestioneAreaBoard } from "@/components/produzione/GestioneAreaBoard";
import { ProcessiAttivitaBoard } from "@/components/produzione/ProcessiAttivitaBoard";
import { ProcessiBoard } from "@/components/produzione/ProcessiBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzioneDynamic } from "../../_resolve";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function ProduzioneSubPage({ params }: Props) {
  await requireAreaAccess("produzione");

  const { section, sub } = await params;
  const page = await resolveProduzioneDynamic([section, sub]);
  if (!page) notFound();

  if (section === "fogli-lavorazione" && sub === "nuovo") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliLavorazioneBoard startCreate />
        </div>
      </>
    );
  }

  if (section === "processi-e-attivita" && sub === "nuovo-processo") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiBoard startCreate />
        </div>
      </>
    );
  }

  if (section === "processi-e-attivita" && sub === "elenco-processi") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiBoard />
        </div>
      </>
    );
  }

  if (section === "processi-e-attivita" && sub === "nuova-attivita") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiAttivitaBoard startCreate />
        </div>
      </>
    );
  }

  if (section === "processi-e-attivita" && sub === "elenco-attivita") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiAttivitaBoard />
        </div>
      </>
    );
  }

  if (section === "fogli-lavorazione" && sub === "in-esecuzione") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliInEsecuzioneBoard />
        </div>
      </>
    );
  }

  if (section === "fogli-lavorazione" && sub === "storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliLavorazioneBoard initialFilter="chiusi" />
        </div>
      </>
    );
  }

  if (section === "gestione-aree") {
    return (
      <>
        <AppHeader
          title="Gestione Area"
          subtitle="Impianti, eventi di linea e stato dell’area."
        />
        <div className="p-6">
          <GestioneAreaBoard areaCodice={sub} />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
