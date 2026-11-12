import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ControlloProcessoDettaglio } from "@/components/produzione/ControlloProcessiVista";
import { processoControlloBySlug } from "@/lib/produzione/controllo-processi";
import { MacchinariBoard } from "@/components/produzione/MacchinariBoard";
import { PostazioniBoard } from "@/components/produzione/PostazioniBoard";
import { PostoLavoroBoard } from "@/components/produzione/PostoLavoroBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzioneDynamic } from "../../../_resolve";

type Props = {
  params: Promise<{ section: string; sub: string; leaf: string }>;
};

export default async function ProduzioneLeafPage({ params }: Props) {
  await requireAreaAccess("produzione");

  const { section, sub, leaf } = await params;
  if (
    section === "controlli-haccp" &&
    sub === "controllo-processi"
  ) {
    const processo = processoControlloBySlug(leaf);
    if (!processo) notFound();
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
