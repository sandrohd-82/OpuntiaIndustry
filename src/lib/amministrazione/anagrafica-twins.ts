import { createServiceClient } from "@/lib/supabase/server";

export type AnagraficaTwinKey = {
  tipo: "cliente" | "cliente_possibile";
  id: string;
};

type ServiceDb = ReturnType<typeof createServiceClient>;

async function addTwinsByRagioneSociale(
  service: ServiceDb,
  add: (tipo: AnagraficaTwinKey["tipo"], id: string) => void,
  ragioneSociale: string
): Promise<void> {
  const nome = ragioneSociale.trim();
  if (!nome) return;
  const [{ data: clienti }, { data: leads }] = await Promise.all([
    service
      .from("clienti")
      .select("id")
      .ilike("ragione_sociale", nome)
      .is("deleted_at", null),
    service
      .from("clienti_possibili")
      .select("id, cliente_id")
      .ilike("ragione_sociale", nome)
      .is("deleted_at", null),
  ]);
  for (const row of clienti ?? []) add("cliente", String(row.id));
  for (const row of leads ?? []) {
    add("cliente_possibile", String(row.id));
    if (row.cliente_id) add("cliente", String(row.cliente_id));
  }
}

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
  ragioneSociale: string;
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
    return { keys, clienteIds, possibileIds, ragioneSociale: "" };
  }

  let ragioneSociale = "";
  let linkedClienteId = "";
  if (aziendaTipo === "cliente") {
    const { data: me } = await service
      .from("clienti")
      .select("ragione_sociale")
      .eq("id", aziendaId)
      .maybeSingle();
    ragioneSociale = String(me?.ragione_sociale ?? "").trim();
  } else {
    const { data: me } = await service
      .from("clienti_possibili")
      .select("ragione_sociale, cliente_id")
      .eq("id", aziendaId)
      .maybeSingle();
    ragioneSociale = String(me?.ragione_sociale ?? "").trim();
    linkedClienteId = me?.cliente_id ? String(me.cliente_id) : "";
  }

  if (aziendaTipo === "cliente") {
    add("cliente", aziendaId);
    const { data } = await service
      .from("clienti_possibili")
      .select("id")
      .eq("cliente_id", aziendaId)
      .is("deleted_at", null);
    for (const row of data ?? []) add("cliente_possibile", String(row.id));
    if (ragioneSociale) {
      await addTwinsByRagioneSociale(service, add, ragioneSociale);
    }
    return { keys, clienteIds, possibileIds, ragioneSociale };
  }

  add("cliente_possibile", aziendaId);
  const clienteId = linkedClienteId;
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
  if (ragioneSociale) {
    await addTwinsByRagioneSociale(service, add, ragioneSociale);
  }

  return { keys, clienteIds, possibileIds, ragioneSociale };
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
