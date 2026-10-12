import { notFound, redirect } from "next/navigation";
import { CommercialistaBoard } from "@/components/amministrazione/CommercialistaBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  AREA_FISCALE_SECTIONS,
  resolveAreaFiscalePage,
} from "@/lib/areas/area-fiscale";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";
import { sessioneOspiteCommercialista } from "@/lib/amministrazione/commercialista-ospite-accesso";

export const maxDuration = 300;

type Props = {
  params: Promise<{ section: string }>;
};

export default async function AreaFiscaleSectionPage({ params }: Props) {
  const { section } = await params;
  const auth = await getAuthContext();
  const ospite =
    section === "commercialista" && !auth
      ? await sessioneOspiteCommercialista()
      : null;
  if (!ospite) {
    await requireAreaAccess("area-fiscale");
  }

  // Legacy flat paths
  if (section === "dati-e-calcoli") {
    redirect("/app/area-fiscale/dati-e-calcoli/iva-e-imposte");
  }
  if (section === "rapporti-banca") {
    redirect("/app/area-fiscale/banca/movimenti");
  }
  if (section === "il-commercialista") {
    redirect("/app/area-fiscale/commercialista");
  }

  const item = AREA_FISCALE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveAreaFiscalePage([section]);
  if (!page) notFound();

  if (section === "commercialista") {
    return (
      <>
        {ospite ? (
          <header className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
            <h1 className="text-xl font-semibold">{page.label}</h1>
            {page.description ? (
              <p className="text-sm text-[var(--muted)]">{page.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-[var(--muted)]">
              Accesso temporaneo, solo questa pagina.
            </p>
          </header>
        ) : (
          <AppHeader title={page.label} subtitle={page.description} />
        )}
        <div className="p-6">
          <CommercialistaBoard ospite={Boolean(ospite)} />
        </div>
      </>
    );
  }

  return <AreaPlaceholder title={page.label} description={page.description} />;
}
