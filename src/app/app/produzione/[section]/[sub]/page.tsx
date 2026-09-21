import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { FogliInEsecuzioneBoard } from "@/components/produzione/FogliInEsecuzioneBoard";
import { FoglioIngressoMpForm } from "@/components/produzione/FoglioIngressoMpForm";
import { FogliIngressoMpBoard } from "@/components/produzione/FogliIngressoMpBoard";
import { FogliLavorazioneBoard } from "@/components/produzione/FogliLavorazioneBoard";
import { AreeElencoBoard } from "@/components/produzione/AreeElencoBoard";
import { GestioneAreaBoard } from "@/components/produzione/GestioneAreaBoard";
import { ProcessiAttivitaBoard } from "@/components/produzione/ProcessiAttivitaBoard";
import { ProcessiBoard } from "@/components/produzione/ProcessiBoard";
import { OrdiniDaProcessareBoard } from "@/components/amministrazione/OrdiniDaProcessareBoard";
import { OrdiniProcessatiBoard } from "@/components/amministrazione/OrdiniProcessatiBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { requireOrdiniDaProcessarePageAccess } from "@/lib/auth/ordini-access";
import { resolveProduzioneDynamic } from "../../_resolve";

type Props = {
  params: Promise<{ section: string; sub: string }>;
  searchParams: Promise<{ id?: string; codice?: string }>;
};

export default async function ProduzioneSubPage({ params, searchParams }: Props) {
  await requireAreaAccess("produzione");

  const { section, sub } = await params;
  const query = await searchParams;
  if (section === "processi-e-attivita" && sub === "nuovo-processo") {
    redirect("/app/produzione/processi-e-attivita/elenco-processi");
  }
  if (section === "processi-e-attivita" && sub === "nuova-attivita") {
    redirect("/app/produzione/processi-e-attivita/elenco-attivita");
  }
  if (section === "processi-e-attivita" && sub === "storico-processi") {
    redirect("/app/archivio/produzione/processi-e-attivita/storico-processi");
  }
  if (section === "processi-e-attivita" && sub === "storico-attivita") {
    redirect("/app/archivio/produzione/processi-e-attivita/storico-attivita");
  }
  if (section === "fogli-lavorazione" && sub === "storico") {
    redirect("/app/archivio/produzione/fogli-lavorazione/storico");
  }
  if (section === "fogli-lavorazione" && sub === "lotti-uscita") {
    redirect("/app/strumenti/generatore-lotti");
  }
  if (section === "fogli-lavorazione" && sub === "decifratore") {
    const codice = query.codice?.trim();
    redirect(
      codice
        ? `/app/strumenti/decifratore?codice=${encodeURIComponent(codice)}`
        : "/app/strumenti/decifratore"
    );
  }
  if (section === "strumenti") {
    const codice = query.codice?.trim();
    const dest = `/app/strumenti/${sub}`;
    redirect(
      sub === "decifratore" && codice
        ? `${dest}?codice=${encodeURIComponent(codice)}`
        : dest
    );
  }
  const page = await resolveProduzioneDynamic([section, sub]);
  if (!page) notFound();

  if (section === "foglio-ingresso-mp" && sub === "nuovo") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FoglioIngressoMpForm
            foglioId={
              query.id &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                query.id
              )
                ? query.id
                : undefined
            }
          />
        </div>
      </>
    );
  }

  if (section === "foglio-ingresso-mp" && sub === "aperti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliIngressoMpBoard />
        </div>
      </>
    );
  }

  if (section === "foglio-ingresso-mp" && sub === "storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliIngressoMpBoard storico />
        </div>
      </>
    );
  }

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

  if (section === "ordini" && sub === "da-processare") {
    await requireOrdiniDaProcessarePageAccess();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniDaProcessareBoard />
        </div>
      </>
    );
  }

  if (section === "ordini" && sub === "scaletta") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniProcessatiBoard />
        </div>
      </>
    );
  }

  if (section === "gestione-aree" && sub === "elenco") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <AreeElencoBoard />
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
