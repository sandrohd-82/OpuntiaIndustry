import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string; leaf: string }>;
};

/** Vecchi path a 3 segmenti sotto Generatore → unica pagina Generatore. */
export default async function MagazzinoLeafPage({ params }: Props) {
  await requireAreaAccess("magazzino");
  const { section, sub } = await params;
  if (section === "barcode" && sub === "generatore") {
    redirect("/app/magazzino/barcode/generatore");
  }
  redirect("/app/magazzino/barcode/generatore");
}
