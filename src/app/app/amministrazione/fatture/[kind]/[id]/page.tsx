import { notFound } from "next/navigation";
import { getFatturaByIdAction } from "@/app/actions/fatture";
import { FatturaDettaglioView } from "@/components/amministrazione/FatturaDettaglioView";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireAreaAccess } from "@/lib/areas/guard";
import type { FatturaKind } from "@/lib/amministrazione/fatture";

type Props = {
  params: Promise<{ kind: string; id: string }>;
};

function parseKind(kind: string): FatturaKind | null {
  if (kind === "emesse" || kind === "emessa") return "emessa";
  if (kind === "ricevute" || kind === "ricevuta") return "ricevuta";
  if (
    kind === "note-credito" ||
    kind === "note_credito" ||
    kind === "nota_credito" ||
    kind === "nota-credito"
  ) {
    return "nota_credito";
  }
  return null;
}

export default async function FatturaDettaglioPage({ params }: Props) {
  await requireAreaAccess("amministrazione");
  const { kind: kindParam, id } = await params;
  const kind = parseKind(kindParam);
  if (!kind || !id) notFound();

  const result = await getFatturaByIdAction(kind, id);
  if (!result.success) notFound();

  const title =
    kind === "nota_credito"
      ? "Dettaglio nota di credito"
      : kind === "emessa"
        ? "Dettaglio fattura emessa"
        : "Dettaglio fattura ricevuta";

  return (
    <>
      <AppHeader
        title={title}
        subtitle={`Consultazione condizioni (sconti, prezzi, IVA spedizione) — ${result.fattura.numeroInterno}`}
      />
      <div className="p-6">
        <FatturaDettaglioView fattura={result.fattura} />
      </div>
    </>
  );
}
