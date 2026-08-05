import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { FogliLavorazioneBoard } from "@/components/produzione/FogliLavorazioneBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzionePage } from "@/lib/areas/produzione";

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ nuovo?: string }>;
};

export default async function ProduzioneSectionPage({
  params,
  searchParams,
}: Props) {
  await requireAreaAccess("produzione");

  const { section } = await params;
  const query = await searchParams;
  const page = resolveProduzionePage([section]);
  if (!page) notFound();

  if (section === "fogli-lavorazione") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliLavorazioneBoard startCreate={query.nuovo === "1"} />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
