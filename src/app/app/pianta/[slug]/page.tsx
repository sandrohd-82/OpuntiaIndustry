import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MagazzinoMappaBoard } from "@/components/magazzino/MagazzinoMappaBoard";
import { getMappaBySlugAction } from "@/app/actions/magazzino-mappa";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function PiantaCollegataPage({ params }: Props) {
  const { slug } = await params;
  const res = await getMappaBySlugAction(decodeURIComponent(slug));
  if (!res.success) notFound();

  return (
    <>
      <AppHeader
        title={res.mappa.percorsoEtichetta || res.mappa.luogoNome}
        subtitle={`Pianta v${res.mappa.versione} · sola consultazione`}
      />
      <div className="min-w-0 px-4 pb-8 pt-2">
        <MagazzinoMappaBoard mappaId={res.mappa.id} mode="lettura" />
      </div>
    </>
  );
}
