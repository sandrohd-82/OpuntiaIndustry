import { notFound, redirect } from "next/navigation";
import { ClientiBoard } from "@/components/amministrazione/ClientiBoard";
import { FatturaEmissioneBoard } from "@/components/amministrazione/FatturaEmissioneBoard";
import { ListiniB2bBoard } from "@/components/amministrazione/ListiniB2bBoard";
import { PossibiliClientiBoard } from "@/components/amministrazione/PossibiliClientiBoard";
import { PreventiviBoard } from "@/components/amministrazione/PreventiviBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  COMMERCIALE_SECTIONS,
  resolveCommercialePage,
} from "@/lib/areas/commerciale";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isNavBranch } from "@/lib/areas/nav-tree";

type Props = {
  params: Promise<{ section: string }>;
};

export const maxDuration = 300;

export default async function CommercialeSectionPage({ params }: Props) {
  const { section } = await params;

  if (section === "webmail") {
    redirect("/app/webmail/caselle");
  }
  if (section === "clienti-con-storico") {
    redirect("/app/commerciale/clienti");
  }
  if (section === "clienti-contattati") {
    redirect("/app/commerciale/possibili-clienti");
  }

  if (section === "nuova-fattura") {
    await requireAnyAreaAccess([
      "commerciale",
      "amministrazione",
      "area-fiscale",
    ]);
  } else {
    await requireAnyAreaAccess(["commerciale", "amministrazione"]);
  }

  const item = COMMERCIALE_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveCommercialePage([section]);
  if (!page) notFound();

  if (section === "clienti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ClientiBoard />
        </div>
      </>
    );
  }

  if (section === "possibili-clienti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PossibiliClientiBoard />
        </div>
      </>
    );
  }

  if (section === "preventivi") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <PreventiviBoard />
        </div>
      </>
    );
  }

  if (section === "listino") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ListiniB2bBoard />
        </div>
      </>
    );
  }

  if (section === "nuova-fattura") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FatturaEmissioneBoard />
        </div>
      </>
    );
  }

  notFound();
}
