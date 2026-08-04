import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { EssiccatoriBoard } from "@/components/produzione/EssiccatoriBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzionePage } from "@/lib/areas/produzione";
import { ESSICCATORI } from "@/lib/produzione/essiccatori";

type Props = {
  params: Promise<{ sub: string }>;
};

export default async function EssiccatoriSubPage({ params }: Props) {
  await requireAreaAccess("produzione");

  const { sub } = await params;
  const page = resolveProduzionePage(["essiccatori", sub]);
  if (!page) notFound();

  if (sub === "gestione") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <EssiccatoriBoard items={ESSICCATORI} />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
