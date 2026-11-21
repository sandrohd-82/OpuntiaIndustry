import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { riepilogoRichiesta } from "@/lib/anagrafica/richiesta-db";

export async function leggiRiepilogoAnagrafica(input: {
  kind: "cliente" | "cliente_possibile";
  id: string;
}) {
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  return riepilogoRichiesta(input.kind, input.id);
}
