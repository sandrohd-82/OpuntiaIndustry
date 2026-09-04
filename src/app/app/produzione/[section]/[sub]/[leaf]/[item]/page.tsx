import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MacchinarioBoard } from "@/components/produzione/MacchinarioBoard";
import { PostoLavoroBoard } from "@/components/produzione/PostoLavoroBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzioneDynamic } from "../../../../_resolve";

type Props = {
  params: Promise<{
    section: string;
    sub: string;
    leaf: string;
    item: string;
  }>;
};

export default async function ProduzioneItemPage({ params }: Props) {
  await requireAreaAccess("produzione");
  const { section, sub, leaf, item } = await params;
  if (section !== "gestione-aree") notFound();
  if (item === "elenco" || item === "panoramica") {
    redirect(`/app/produzione/gestione-aree/${sub}/${leaf}`);
  }

  const page = await resolveProduzioneDynamic([section, sub, leaf, item]);
  if (!page) notFound();

  if (leaf === "macchinari") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MacchinarioBoard areaCodice={sub} macchinaCodice={item} />
        </div>
      </>
    );
  }

  if (leaf === "postazioni") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PostoLavoroBoard areaCodice={sub} postoCodice={item} />
        </div>
      </>
    );
  }

  notFound();
}
