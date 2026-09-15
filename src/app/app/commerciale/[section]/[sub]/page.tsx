import { notFound, redirect } from "next/navigation";
import { OrdiniElencoBoard } from "@/components/amministrazione/OrdiniElencoBoard";
import { OrdiniRicevutiBoard } from "@/components/amministrazione/OrdiniRicevutiBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { resolveCommercialePage } from "@/lib/areas/commerciale";
import { requireAnyAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function CommercialeSubPage({ params }: Props) {
  await requireAnyAreaAccess(["commerciale", "amministrazione"]);

  const { section, sub } = await params;

  if (section === "clienti-con-storico") {
    redirect("/app/commerciale/clienti");
  }
  if (section === "clienti-contattati") {
    redirect("/app/commerciale/possibili-clienti");
  }
  if (section === "ordini" && sub === "crea-nuovo") {
    redirect("/app/commerciale/ordini/nuovo");
  }

  const page = resolveCommercialePage([section, sub]);
  if (!page) notFound();

  if (section === "ordini" && sub === "elenco") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniElencoBoard />
        </div>
      </>
    );
  }

  if (section === "ordini" && sub === "nuovo") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniRicevutiBoard />
        </div>
      </>
    );
  }

  notFound();
}
