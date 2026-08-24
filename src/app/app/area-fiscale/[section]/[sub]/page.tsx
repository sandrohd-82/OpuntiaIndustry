import { notFound } from "next/navigation";
import { ContrattiFiscaliBoard } from "@/components/amministrazione/ContrattiFiscaliBoard";
import { DashboardFiscaleBoard } from "@/components/amministrazione/DashboardFiscaleBoard";
import { FatturaEmissioneBoard } from "@/components/amministrazione/FatturaEmissioneBoard";
import { FattureInterneBoard } from "@/components/amministrazione/FattureInterneBoard";
import { RapportiBancaBoard } from "@/components/amministrazione/RapportiBancaBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { AppHeader } from "@/components/layout/AppHeader";
import { resolveAreaFiscalePage } from "@/lib/areas/area-fiscale";
import { requireAreaAccess } from "@/lib/areas/guard";

export const maxDuration = 300;

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

export default async function AreaFiscaleSubPage({ params }: Props) {
  await requireAreaAccess("area-fiscale");

  const { section, sub } = await params;
  const page = resolveAreaFiscalePage([section, sub]);
  if (!page) notFound();

  if (section === "fatture" && sub === "nuova") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FatturaEmissioneBoard />
        </div>
      </>
    );
  }

  if (section === "fatture" && sub === "emesse") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FattureInterneBoard kind="emessa" />
        </div>
      </>
    );
  }

  if (section === "fatture" && sub === "ricevute") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FattureInterneBoard kind="ricevuta" />
        </div>
      </>
    );
  }

  if (section === "note-di-credito" && sub === "emesse") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FattureInterneBoard kind="nota_credito" />
        </div>
      </>
    );
  }

  if (section === "note-di-credito" && sub === "nuova") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FatturaEmissioneBoard />
        </div>
      </>
    );
  }

  if (section === "dati-e-calcoli" && sub === "iva-e-imposte") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <DashboardFiscaleBoard />
        </div>
      </>
    );
  }

  if (section === "banca" && sub === "movimenti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <RapportiBancaBoard />
        </div>
      </>
    );
  }

  if (section === "contratti" && (sub === "nuovo" || sub === "elenco" || sub === "archivio")) {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ContrattiFiscaliBoard mode={sub} />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
