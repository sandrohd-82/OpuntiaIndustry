import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { GraficiIncassiBoard } from "@/components/amministrazione/grafici/GraficiIncassiBoard";
import { GraficiOrdiniBoard } from "@/components/amministrazione/grafici/GraficiOrdiniBoard";
import { GraficiProduttivitaBoard } from "@/components/amministrazione/grafici/GraficiProduttivitaBoard";
import { CatalogoOffertaBoard } from "@/components/amministrazione/CatalogoOffertaBoard";
import { MateriePrimeBoard } from "@/components/amministrazione/MateriePrimeBoard";
import { ClientiBoard } from "@/components/amministrazione/ClientiBoard";
import { PossibiliClientiBoard } from "@/components/amministrazione/PossibiliClientiBoard";
import { FornitoriBoard } from "@/components/amministrazione/FornitoriBoard";
import { ImballaggiSpedizioniBoard } from "@/components/amministrazione/ImballaggiSpedizioniBoard";
import { ProdottiPropriBoard } from "@/components/amministrazione/ProdottiPropriBoard";
import { ListiniB2bBoard } from "@/components/amministrazione/ListiniB2bBoard";
import { CanaliPubblicazioneBoard } from "@/components/amministrazione/CanaliPubblicazioneBoard";
import {
  PortaleNewsletterBoard,
  PortaleRichiesteBoard,
} from "@/components/amministrazione/PortaleLeadBoard";
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

  // Legacy redirects
  if (section === "fatture") {
    const map: Record<string, string> = {
      emetti: "/app/area-fiscale/fatture/nuova",
      emesse: "/app/area-fiscale/fatture/emesse",
      ricevute: "/app/area-fiscale/fatture/ricevute",
      "note-credito": "/app/area-fiscale/note-di-credito/emesse",
      inviate: "/app/area-fiscale/fatture/emesse",
    };
    redirect(map[sub] ?? "/app/area-fiscale/fatture");
  }
  if (section === "grafici") {
    const map: Record<string, string> = {
      ordini: "/app/amministrazione/statistiche/ordini",
      incassi: "/app/amministrazione/statistiche/economia",
      produttivita: "/app/amministrazione/statistiche/produttivita",
      "materia-prima": "/app/amministrazione/statistiche/produttivita",
    };
    redirect(map[sub] ?? "/app/amministrazione/statistiche");
  }
  if (section === "ordini" && sub === "ricevuti") {
    redirect("/app/amministrazione/ordini/crea-nuovo");
  }
  if (section === "ordini" && sub === "evasi") {
    redirect("/app/amministrazione/ordini/processati");
  }
  if (section === "dipendenti") {
    redirect("/app/amministrazione/organigramma/elenco-e-mansioni");
  }
  if (section === "schede" && sub === "attivita") {
    redirect("/app/produzione/processi-e-attivita/elenco-attivita");
  }
  if (section === "schede" && (sub === "fornitori" || sub === "clienti")) {
    redirect(
      sub === "fornitori"
        ? "/app/amministrazione/fornitori/elenco"
        : "/app/amministrazione/clienti/elenco"
    );
  }

  const page = resolveAmministrazionePage([section, sub]);
  if (!page) notFound();

  if (section === "clienti" && sub === "elenco") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ClientiBoard />
        </div>
      </>
    );
  }

  if (section === "clienti" && sub === "possibili") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PossibiliClientiBoard />
        </div>
      </>
    );
  }

  if (section === "fornitori" && sub === "bio") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FornitoriBoard bioMode="bio" />
        </div>
      </>
    );
  }

  if (section === "fornitori" && sub === "elenco") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FornitoriBoard bioMode="non_bio" />
        </div>
      </>
    );
  }

  if (section === "ordini" && sub === "crea-nuovo") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniRicevutiBoard />
        </div>
      </>
    );
  }

  if (section === "ordini" && sub === "storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniStoricoBoard />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "materia-prima") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
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
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <CatalogoOffertaBoard kind="servizio" />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "prodotti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <CatalogoOffertaBoard kind="prodotto" />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "prodotti-propri") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
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

  if (section === "schede" && sub === "listini-b2b") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ListiniB2bBoard />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "canali-pubblicazione") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <CanaliPubblicazioneBoard />
        </div>
      </>
    );
  }

  if (section === "portale" && sub === "richieste-contatto") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PortaleRichiesteBoard origine="opuntiaitalia" />
        </div>
      </>
    );
  }

  if (section === "portale" && sub === "newsletter") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PortaleNewsletterBoard />
        </div>
      </>
    );
  }

  if (section === "schede" && sub === "imballaggi-spedizioni") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ImballaggiSpedizioniBoard />
        </div>
      </>
    );
  }

  if (section === "statistiche" && sub === "produttivita") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <GraficiProduttivitaBoard />
        </div>
      </>
    );
  }

  if (section === "statistiche" && sub === "ordini") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <GraficiOrdiniBoard />
        </div>
      </>
    );
  }

  if (section === "statistiche" && sub === "economia") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <GraficiIncassiBoard />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
