import { notFound, redirect } from "next/navigation";
import { CommercialistaElaboraFattureModal } from "@/components/amministrazione/CommercialistaElaboraFattureModal";
import { CommercialistaElaboraTrimestreModal } from "@/components/amministrazione/CommercialistaElaboraTrimestreModal";
import { requireAreaAccess } from "@/lib/areas/guard";
import { sessioneOspiteCommercialista } from "@/lib/amministrazione/commercialista-ospite-accesso";
import type { CommercialistaRegistroKind } from "@/lib/amministrazione/commercialista";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

export const maxDuration = 300;

function trimestreValido(n: number): n is TrimestreNumero {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

export default async function CommercialistaElaboraOspitePage() {
  const ospite = await sessioneOspiteCommercialista();
  if (!ospite || !trimestreValido(ospite.trimestre)) {
    await requireAreaAccess("area-fiscale");
    redirect("/app/area-fiscale/commercialista");
  }

  if (ospite.ambito === "trimestre") {
    return (
      <CommercialistaElaboraTrimestreModal
        anno={ospite.anno}
        trimestre={ospite.trimestre}
        pagina={true}
      />
    );
  }

  if (!ospite.registro) notFound();

  const kind: CommercialistaRegistroKind = ospite.registro;
  return (
    <CommercialistaElaboraFattureModal
      kind={kind}
      anno={ospite.anno}
      trimestre={ospite.trimestre}
      pagina={true}
    />
  );
}
