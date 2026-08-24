import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { RsRicercheBoard } from "@/components/ricerca-sviluppo/RsRicercheBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  resolveRicercaSviluppoPage,
  sezioneToTipo,
} from "@/lib/areas/ricerca-sviluppo";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function RicercaSviluppoSubPage({ params }: Props) {
  await requireAreaAccess("ricerca-sviluppo");
  const { section, sub } = await params;
  const tipo = sezioneToTipo(section);
  if (!tipo) notFound();

  const page = resolveRicercaSviluppoPage([section, sub]);
  if (!page) notFound();

  if (sub !== "nuova" && sub !== "elenco" && sub !== "archivio") {
    notFound();
  }

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <RsRicercheBoard tipo={tipo} mode={sub} />
      </div>
    </>
  );
}
