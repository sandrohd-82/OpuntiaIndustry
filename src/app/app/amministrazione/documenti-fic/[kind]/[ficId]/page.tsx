import { notFound } from "next/navigation";
import { PaperInvoiceSheet } from "@/components/PaperInvoiceSheet";
import { PaperInvoicePrintBar } from "@/components/PaperInvoicePrintBar";
import { parseFatturaPaXml } from "@/lib/amministrazione/fattura-pa-xml";
import {
  parseFicKindParam,
  resolveFicDocumentXml,
} from "@/lib/amministrazione/fic-document-xml";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ kind: string; ficId: string }>;
};

export default async function DocumentoFicFoglioPage({ params }: Props) {
  await requireAreaAccess("amministrazione");
  const { kind: kindParam, ficId: ficIdParam } = await params;
  const kind = parseFicKindParam(kindParam);
  const ficId = Number(ficIdParam);
  if (!kind || !Number.isFinite(ficId) || ficId <= 0) notFound();

  let model;
  let error: string | null = null;
  try {
    const { xml } = await resolveFicDocumentXml({ kind, ficId });
    model = parseFatturaPaXml(xml);
  } catch (e) {
    error = e instanceof Error ? e.message : "Impossibile generare il foglio.";
    model = null;
  }

  return (
    <div className="paper-invoice-viewer min-h-screen bg-slate-200/80 print:bg-white">
      <PaperInvoicePrintBar
        title={`Fattura ${model?.numero ?? ficId}`}
        error={error}
      />
      <div className="mx-auto max-w-[220mm] px-3 py-6 print:p-0">
        {model ? <PaperInvoiceSheet model={model} /> : null}
      </div>
    </div>
  );
}
