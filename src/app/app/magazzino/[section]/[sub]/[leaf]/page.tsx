import { notFound } from "next/navigation";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import { resolveMagazzinoPage } from "@/lib/areas/magazzino";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string; leaf: string }>;
};

const GENERATORE_LEAVES = new Set([
  "lotto-materia-prima",
  "lotto-prodotto-finito",
  "generico",
]);

export default async function MagazzinoLeafPage({ params }: Props) {
  await requireAreaAccess("magazzino");

  const { section, sub, leaf } = await params;
  const page = resolveMagazzinoPage([section, sub, leaf]);
  if (!page) notFound();

  if (
    section === "barcode" &&
    sub === "generatore" &&
    GENERATORE_LEAVES.has(leaf)
  ) {
    return (
      <AreaPlaceholder title={page.label} description={page.description} />
    );
  }

  notFound();
}
