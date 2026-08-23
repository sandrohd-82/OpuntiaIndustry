import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { RepartiBoard } from "@/components/produzione/RepartiBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isNavBranch } from "@/lib/areas/nav-tree";
import {
  PRODUZIONE_SECTIONS,
  resolveProduzionePage,
} from "@/lib/areas/produzione";

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

  if (section === "processi") {
    redirect("/app/produzione/processi-e-attivita");
  }
  if (section === "essiccatori") {
    redirect("/app/produzione/gestione-aree/essiccatori");
  }
  if (section === "linea-di-taglio") {
    redirect("/app/produzione/gestione-aree/taglio");
  }
  if (section === "turnistica" || section === "calendario-produzione") {
    redirect("/app/produzione/calendario/turnistica");
  }
  if (section === "merce-in-ingresso") {
    redirect("/app/magazzino/materia-prima/nuovo-ingresso");
  }
  if (section === "statistiche") {
    redirect("/app/amministrazione/statistiche");
  }
  if (section === "fogli-lavorazione") {
    redirect(
      query.nuovo === "1"
        ? "/app/produzione/fogli-lavorazione/nuovo"
        : "/app/produzione/fogli-lavorazione/nuovo"
    );
  }

  if (section === "reparti") {
    return (
      <>
        <AppHeader
          title="Reparti"
          subtitle="Anagrafica reparti produttivi collegabili al magazzino"
        />
        <div className="p-6">
          <RepartiBoard />
        </div>
      </>
    );
  }

  const item = PRODUZIONE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveProduzionePage([section]);
  if (!page) notFound();

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
