import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ControlloProcessoDettaglio } from "@/components/produzione/ControlloProcessiVista";
import { FogliIngressoElenco } from "@/components/produzione/FogliIngressoElenco";
import { FoglioIngressoScheda } from "@/components/produzione/FoglioIngressoScheda";
import {
  leggiFoglioIngressoAction,
  listFogliIngressoAction,
} from "@/app/actions/foglio-ingresso";
import { processoControlloBySlug } from "@/lib/produzione/controllo-processi";
import { MacchinariBoard } from "@/components/produzione/MacchinariBoard";
import { PostazioniBoard } from "@/components/produzione/PostazioniBoard";
import { PostoLavoroBoard } from "@/components/produzione/PostoLavoroBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzioneDynamic } from "../../../_resolve";

type Props = {
  params: Promise<{ section: string; sub: string; leaf: string }>;
  searchParams: Promise<{ foglio?: string }>;
};

export default async function ProduzioneLeafPage({ params, searchParams }: Props) {
  await requireAreaAccess("produzione");

  const { section, sub, leaf } = await params;
  if (
    section === "controlli-haccp" &&
    sub === "controllo-processi"
  ) {
    const processo = processoControlloBySlug(leaf);
    if (!processo) notFound();
    if (leaf === "materiale-in-ingresso") {
      const query = await searchParams;
      if (query.foglio) {
        const dettaglio = await leggiFoglioIngressoAction("produzione", query.foglio);
        return (
          <>
            <AppHeader title={processo.titolo} subtitle={processo.sintesi} />
            <div className="p-6">
              {dettaglio.success ? (
                <FoglioIngressoScheda vista="produzione" foglio={dettaglio.foglio} />
              ) : (
                <p className="text-sm text-red-700">{dettaglio.error}</p>
              )}
            </div>
          </>
        );
      }
      const elenco = await listFogliIngressoAction("produzione");
      return (
        <>
          <AppHeader title={processo.titolo} subtitle={processo.sintesi} />
          <div className="space-y-8 p-6">
            {elenco.success ? (
              <FogliIngressoElenco
                vista="produzione"
                fogli={elenco.fogli}
                fornitori={elenco.fornitori}
              />
            ) : (
              <p className="text-sm text-red-700">{elenco.error}</p>
            )}
            <ControlloProcessoDettaglio processo={processo} />
          </div>
        </>
      );
    }
    return (
      <>
        <AppHeader title={processo.titolo} subtitle={processo.sintesi} />
        <div className="p-6">
          <ControlloProcessoDettaglio processo={processo} />
        </div>
      </>
    );
  }
  if (section === "gestione-aree" && leaf === "panoramica") {
    redirect(`/app/produzione/gestione-aree/${sub}`);
  }
  if (section === "gestione-aree" && leaf === "elenco") {
    redirect(`/app/produzione/gestione-aree/${sub}`);
  }

  if (section === "gestione-aree" && leaf === "macchinari") {
    const page = await resolveProduzioneDynamic([section, sub, leaf]);
    return (
      <>
        <AppHeader
          title="Elenco"
          subtitle={page?.description ?? "Elenco macchine dell’area."}
        />
        <div className="p-6">
          <MacchinariBoard areaCodice={sub} />
        </div>
      </>
    );
  }

  if (section === "gestione-aree" && leaf === "postazioni") {
    const page = await resolveProduzioneDynamic([section, sub, leaf]);
    return (
      <>
        <AppHeader
          title="Elenco Postazioni"
          subtitle={
            page?.description ??
            "Posti lavoro che richiedono la presenza di un operatore."
          }
        />
        <div className="p-6">
          <PostazioniBoard areaCodice={sub} />
        </div>
      </>
    );
  }

  if (section === "gestione-aree") {
    redirect(`/app/produzione/gestione-aree/${sub}/postazioni/${leaf}`);
  }

  const page = await resolveProduzioneDynamic([section, sub, leaf]);
  if (!page) notFound();
  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <PostoLavoroBoard areaCodice={sub} postoCodice={leaf} />
      </div>
    </>
  );
}
