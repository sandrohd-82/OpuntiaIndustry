import { notFound, redirect } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { resolveMagazzinoPage } from "@/lib/areas/magazzino";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string }>;
};

const BARCODE_SUBS = new Set([
  "lotto-materia-prima",
  "lotto-prodotto-finito",
  "generico",
]);

export default async function MagazzinoSubPage({ params }: Props) {
  await requireAreaAccess("magazzino");

  const { section, sub } = await params;
  const page = resolveMagazzinoPage([section, sub]);
  if (!page) notFound();

  if (section === "barcode" && BARCODE_SUBS.has(sub)) {
    return (
      <AreaPlaceholder title={page.label} description={page.description} />
    );
  }

  // Compatibilità: vecchio /magazzino/barcode → generico
  if (section === "barcode") {
    redirect("/app/magazzino/barcode/generico");
  }

  notFound();
}
