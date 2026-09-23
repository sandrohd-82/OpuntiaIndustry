import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BarcodeGeneratoreBoard } from "@/components/magazzino/BarcodeGeneratoreBoard";
import { BarcodeRegistratiBoard } from "@/components/magazzino/BarcodeRegistratiBoard";
import { EditorAreeBoard } from "@/components/magazzino/EditorAreeBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { LottiEsterniBoard } from "@/components/produzione/LottiEsterniBoard";
import { LottoEsternoDecoderBoard } from "@/components/produzione/LottoEsternoDecoderBoard";
import { TicketBoard } from "@/components/strumenti/TicketBoard";
import { requireAnyAreaAccess, requireAreaAccess } from "@/lib/areas/guard";
import { resolveStrumentiPage } from "@/lib/areas/strumenti";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function StrumentiSectionPage({ params }: Props) {
  const { section } = await params;
  if (section === "ticket") {
    await requireAnyAreaAccess(["strumenti", "amministrazione"]);
  } else {
    await requireAreaAccess("strumenti");
  }
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
        {section === "editor-aree" ? <EditorAreeBoard /> : null}
        {section === "ticket" ? (
          <Suspense fallback={<p className="text-sm text-slate-600">Apro i ticket…</p>}>
            <TicketBoard mode="viva" />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}
