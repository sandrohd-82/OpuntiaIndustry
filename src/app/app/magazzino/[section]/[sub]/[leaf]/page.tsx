import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { LottoAgrinsiciliaDettaglioBoard } from "@/components/magazzino/LottoAgrinsiciliaDettaglioBoard";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ section: string; sub: string; leaf: string }>;
  searchParams: Promise<{ codice?: string; prodotto?: string }>;
};

export default async function MagazzinoLeafPage({ params, searchParams }: Props) {
  await requireAreaAccess("magazzino");
  const { section, sub, leaf } = await params;

  if (
    section === "prodotti-agrinsicilia" &&
    sub === "elenco-e-quantita" &&
    leaf === "lotto"
  ) {
    const q = await searchParams;
    return (
      <>
        <AppHeader
          title="Dettaglio lotto"
          subtitle="Fogli, registrazioni, lotti interni ed esterni, stampa etichetta"
        />
        <div className="p-6">
          <LottoAgrinsiciliaDettaglioBoard
            lottoCodice={q.codice ?? ""}
            prodottoId={q.prodotto}
          />
        </div>
      </>
    );
  }

  if (section === "barcode" && sub === "generatore") {
    redirect("/app/magazzino/barcode/generatore");
  }
  redirect("/app/magazzino/barcode/generatore");
}
