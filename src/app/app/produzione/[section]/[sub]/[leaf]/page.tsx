import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { PostoLavoroBoard } from "@/components/produzione/PostoLavoroBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzioneDynamic } from "../../../_resolve";

type Props = {
  params: Promise<{ section: string; sub: string; leaf: string }>;
};

export default async function ProduzioneLeafPage({ params }: Props) {
  await requireAreaAccess("produzione");

  const { section, sub, leaf } = await params;
  if (section === "gestione-aree" && leaf === "panoramica") {
    redirect(`/app/produzione/gestione-aree/${sub}`);
  }

  const page = await resolveProduzioneDynamic([section, sub, leaf]);
  if (!page) notFound();

  if (section === "gestione-aree") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PostoLavoroBoard areaCodice={sub} postoCodice={leaf} />
        </div>
      </>
    );
  }

  notFound();
}
