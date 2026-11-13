import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { ControlloProcessoDettaglio } from "@/components/produzione/ControlloProcessiVista";
import { processoControlloBySlug } from "@/lib/produzione/controllo-processi";
import { contestoMaterialeIngresso } from "@/lib/produzione/fornitore-accesso-server";
import { createClient } from "@/lib/supabase/server";
import {
  AREA_FORNITORI_SECTIONS,
  resolveAreaFornitoriPage,
} from "@/lib/areas/area-fornitori";
import { isNavBranch } from "@/lib/areas/nav-tree";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function AreaFornitoriSectionPage({ params }: Props) {
  await requireAreaAccess("area-fornitori");
  const { section } = await params;
  const item = AREA_FORNITORI_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveAreaFornitoriPage([section]);
  if (!page) notFound();

  if (section === "materiale-in-ingresso") {
    const processo = processoControlloBySlug("materiale-in-ingresso");
    if (!processo) notFound();
    const accesso = await contestoMaterialeIngresso(null);
    if (accesso.esito === "negato") {
      return (
        <>
          <AppHeader title={page.label} subtitle={page.description} />
          <div className="p-6">
            <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {accesso.motivo === "non_collegato"
                ? "Il tuo utente non è collegato a un fornitore. I dati riservati restano chiusi finché Agrinsicilia non associa l'anagrafica."
                : "Accesso non consentito ai dati di questo fornitore."}
            </p>
          </div>
        </>
      );
    }
    let ragioneSociale: string | null = null;
    if (accesso.esito === "fornitore") {
      const supabase = await createClient();
      const { data } = await supabase
        .from("fornitori")
        .select("ragione_sociale")
        .eq("id", accesso.fornitoreId)
        .is("deleted_at", null)
        .maybeSingle();
      ragioneSociale = (data?.ragione_sociale as string | undefined) ?? null;
    }
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          {accesso.esito === "fornitore" ? (
            <p className="mb-4 text-sm text-slate-700">
              Anagrafica collegata
              {ragioneSociale ? `: ${ragioneSociale}` : ""}.
            </p>
          ) : null}
          <ControlloProcessoDettaglio processo={processo} soloFornitore />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        <AreaPlaceholder title={page.label} description={page.description} />
      </div>
    </>
  );
}
