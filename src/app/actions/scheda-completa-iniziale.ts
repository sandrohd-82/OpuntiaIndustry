"use server";

import { leggiAllerteAzienda } from "@/lib/anagrafica/allerte-lettura";
import { leggiRiepilogoAnagrafica } from "@/lib/anagrafica/riepilogo-lettura";
import { leggiAnagraficaExtra } from "@/lib/amministrazione/anagrafica-extra-lettura";
import { leggiSchedaClienteCompleta } from "@/lib/amministrazione/scheda-cliente-lettura";
import { leggiSchedeCardAzienda } from "@/lib/amministrazione/schede-card-lettura";
import { leggiReferentiAnagrafica } from "@/lib/rubrica/referenti-lettura";
import { coordinaLettureScheda } from "@/lib/scheda-completa/coordina-letture";

export async function caricaSchedaCompletaInizialeAction(
  input: { clienteId: string; includiRiepilogo: boolean }
) {
  return coordinaLettureScheda({
    scheda: leggiSchedaClienteCompleta(input.clienteId),
    extra: leggiAnagraficaExtra({
      ownerKind: "cliente",
      ownerId: input.clienteId,
    }),
    schede: leggiSchedeCardAzienda({
      ownerKind: "cliente",
      ownerId: input.clienteId,
    }),
    referenti: leggiReferentiAnagrafica({
      tipo: "cliente",
      entityId: input.clienteId,
    }),
    riepilogo: input.includiRiepilogo
      ? leggiRiepilogoAnagrafica({ kind: "cliente", id: input.clienteId })
      : Promise.resolve(null),
    allerte: leggiAllerteAzienda({
      aziende: [{ tipo: "cliente", id: input.clienteId }],
    }),
  });
}
