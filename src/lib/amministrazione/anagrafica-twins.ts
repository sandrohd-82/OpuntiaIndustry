import { createServiceClient } from "@/lib/supabase/server";

export type AnagraficaTwinKey = {
  tipo: "cliente" | "cliente_possibile";
  id: string;
};

type ServiceDb = ReturnType<typeof createServiceClient>;

/**
 * Cliente e possibile cliente convertito sono la stessa azienda:
 * mail/note restano sul lead, campionature/ordini sul cliente.
 */
export async function resolveAnagraficaTwins(
  service: ServiceDb,
  aziendaTipo: "cliente" | "fornitore" | "cliente_possibile",
  aziendaId: string
): Promise<{
  keys: AnagraficaTwinKey[];
  clienteIds: string[];
  possibileIds: string[];
}> {
  const keys: AnagraficaTwinKey[] = [];
  const clienteIds: string[] = [];
  const possibileIds: string[] = [];

  const add = (tipo: AnagraficaTwinKey["tipo"], id: string) => {
    const clean = id.trim();
    if (!clean) return;
    if (keys.some((k) => k.tipo === tipo && k.id === clean)) return;
    keys.push({ tipo, id: clean });
    if (tipo === "cliente") clienteIds.push(clean);
    else possibileIds.push(clean);
  };

  if (aziendaTipo === "fornitore") {
    return { keys, clienteIds, possibileIds };
  }

  if (aziendaTipo === "cliente") {
    add("cliente", aziendaId);
    const { data } = await service
      .from("clienti_possibili")
      .select("id")
      .eq("cliente_id", aziendaId)
      .is("deleted_at", null);
    for (const row of data ?? []) add("cliente_possibile", String(row.id));
    return { keys, clienteIds, possibileIds };
  }

  add("cliente_possibile", aziendaId);
  const { data: lead } = await service
    .from("clienti_possibili")
    .select("cliente_id")
    .eq("id", aziendaId)
    .maybeSingle();
  const clienteId = lead?.cliente_id ? String(lead.cliente_id) : "";
  if (clienteId) {
    add("cliente", clienteId);
    const { data: siblings } = await service
      .from("clienti_possibili")
      .select("id")
      .eq("cliente_id", clienteId)
      .is("deleted_at", null);
    for (const row of siblings ?? []) {
      add("cliente_possibile", String(row.id));
    }
  }

  return { keys, clienteIds, possibileIds };
}

export function filterOrTipoId(
  keys: Array<{ tipo: string; id: string }>,
  tipoCol: string,
  idCol: string
): string {
  return keys
    .map((k) => `and(${tipoCol}.eq.${k.tipo},${idCol}.eq.${k.id})`)
    .join(",");
}
