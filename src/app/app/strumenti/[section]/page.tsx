import { notFound } from "next/navigation";
import { BarcodeGeneratoreBoard } from "@/components/magazzino/BarcodeGeneratoreBoard";
import { BarcodeRegistratiBoard } from "@/components/magazzino/BarcodeRegistratiBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { LottiEsterniBoard } from "@/components/produzione/LottiEsterniBoard";
import { LottoEsternoDecoderBoard } from "@/components/produzione/LottoEsternoDecoderBoard";
import { requireAreaAccess } from "@/lib/areas/guard";
import { resolveStrumentiPage } from "@/lib/areas/strumenti";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function StrumentiSectionPage({ params }: Props) {
  await requireAreaAccess("strumenti");
  const { section } = await params;
  const page = resolveStrumentiPage([section]);
  if (!page) notFound();

  return (
    <>
      <AppHeader title={page.label} subtitle={page.description} />
      <div className="p-6">
        {section === "generatore-lotti" ? <LottiEsterniBoard /> : null}
        {section === "decifratore" ? <LottoEsternoDecoderBoard /> : null}
        {section === "generatore-barcode" ? <BarcodeGeneratoreBoard /> : null}
        {section === "barcode-mp" ? (
          <BarcodeRegistratiBoard catalogKind="materia_prima" />
        ) : null}
        {section === "barcode-prodotti" ? (
          <BarcodeRegistratiBoard catalogKind="prodotto_fornitore" />
        ) : null}
      </div>
    </>
  );
}
