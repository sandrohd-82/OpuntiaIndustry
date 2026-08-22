import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProcessiAttivitaBoard } from "@/components/produzione/ProcessiAttivitaBoard";
import { ProcessiBoard } from "@/components/produzione/ProcessiBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveProduzionePage } from "@/lib/areas/produzione";

type Props = {
  params: Promise<{ sub: string }>;
};

export default async function ProcessiSubPage({ params }: Props) {
  await requireAreaAccess("produzione");

  const { sub } = await params;
  const page = resolveProduzionePage(["processi", sub]);
  if (!page) notFound();

  if (sub === "elenco") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiBoard />
        </div>
      </>
    );
  }

  if (sub === "attivita") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiAttivitaBoard />
        </div>
      </>
    );
  }

  notFound();
}
