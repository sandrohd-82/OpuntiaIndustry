import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { PiantaLuogoBoard } from "@/components/magazzino/PiantaLuogoBoard";
import { getPiantaLuogoBySlugAction } from "@/app/actions/magazzino-mappa";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function PiantaLuogoPage({ params }: Props) {
  const { slug } = await params;
  const res = await getPiantaLuogoBySlugAction(decodeURIComponent(slug));
  if (!res.success) notFound();
  if (res.redirectTo) redirect(`/app/pianta/${res.redirectTo}`);

  return (
    <>
      <AppHeader
        title={res.luogo.etichetta}
        subtitle={res.luogo.percorsoEtichetta}
      />
      <div className="min-w-0 px-4 pb-8 pt-2">
        <PiantaLuogoBoard luogo={res.luogo} />
      </div>
    </>
  );
}
