"use server";

import { requireOrdineCreateAccess } from "@/lib/auth/ordini-access";
import type { ContattoRitiro } from "@/lib/amministrazione/ordine-ritiro";
import { createServiceClient } from "@/lib/supabase/service";

function aggiungi(
  lista: ContattoRitiro[],
  visti: Set<string>,
  valore: string,
  etichetta: string
) {
  const pulito = valore.trim();
  if (!pulito) return;
  const chiave = pulito.toLowerCase();
  if (visti.has(chiave)) return;
  visti.add(chiave);
  lista.push({ valore: pulito, etichetta });
}

export async function elencoContattiRitiroAction(input: {
  clienteId?: string | null;
  possibileClienteId?: string | null;
}): Promise<
  | { success: true; telefoni: ContattoRitiro[]; mail: ContattoRitiro[] }
  | { success: false; error: string }
> {
  await requireOrdineCreateAccess();
  const clienteId = input.clienteId?.trim() || "";
  const possibileId = input.possibileClienteId?.trim() || "";
  if (!clienteId && !possibileId) {
    return { success: true, telefoni: [], mail: [] };
  }

  const supabase = createServiceClient();
  const telefoni: ContattoRitiro[] = [];
  const mail: ContattoRitiro[] = [];
  const vistiTel = new Set<string>();
  const vistiMail = new Set<string>();

  if (clienteId) {
    const { data, error } = await supabase
      .from("clienti")
      .select("ragione_sociale, telefono, telefoni_generici, email, pec, email_generiche")
      .eq("id", clienteId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    const nome = String(data?.ragione_sociale ?? "Azienda");
    aggiungi(telefoni, vistiTel, String(data?.telefono ?? ""), `${nome} · azienda`);
    for (const extra of data?.telefoni_generici ?? []) {
      aggiungi(telefoni, vistiTel, String(extra), `${nome} · azienda`);
    }
    aggiungi(mail, vistiMail, String(data?.email ?? ""), `${nome} · azienda`);
    aggiungi(mail, vistiMail, String(data?.pec ?? ""), `${nome} · PEC`);
    for (const extra of data?.email_generiche ?? []) {
      aggiungi(mail, vistiMail, String(extra), `${nome} · azienda`);
    }

    const { data: link, error: linkErr } = await supabase
      .from("clienti_referenti")
      .select("contatto_id")
      .eq("cliente_id", clienteId);
    if (linkErr) return { success: false, error: linkErr.message };
    const ids = (link ?? []).map((row) => String(row.contatto_id));
    if (ids.length) {
      const { data: contatti, error: contErr } = await supabase
        .from("rubrica_contatti")
        .select("nome, cognome, telefono, email, deleted_at")
        .in("id", ids);
      if (contErr) return { success: false, error: contErr.message };
      for (const contatto of contatti ?? []) {
        if (contatto.deleted_at) continue;
        const chi = `${String(contatto.nome ?? "").trim()} ${String(contatto.cognome ?? "").trim()}`.trim();
        const etichetta = chi ? `${chi} · referente` : "Referente";
        aggiungi(telefoni, vistiTel, String(contatto.telefono ?? ""), etichetta);
        aggiungi(mail, vistiMail, String(contatto.email ?? ""), etichetta);
      }
    }
  } else {
    const { data, error } = await supabase
      .from("clienti_possibili")
      .select("ragione_sociale, telefono, telefoni_generici, email, pec, email_generiche")
      .eq("id", possibileId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    const nome = String(data?.ragione_sociale ?? "Azienda");
    aggiungi(telefoni, vistiTel, String(data?.telefono ?? ""), `${nome} · azienda`);
    for (const extra of data?.telefoni_generici ?? []) {
      aggiungi(telefoni, vistiTel, String(extra), `${nome} · azienda`);
    }
    aggiungi(mail, vistiMail, String(data?.email ?? ""), `${nome} · azienda`);
    aggiungi(mail, vistiMail, String(data?.pec ?? ""), `${nome} · PEC`);
    for (const extra of data?.email_generiche ?? []) {
      aggiungi(mail, vistiMail, String(extra), `${nome} · azienda`);
    }

    const { data: link, error: linkErr } = await supabase
      .from("clienti_possibili_referenti")
      .select("contatto_id")
      .eq("cliente_possibile_id", possibileId);
    if (linkErr) return { success: false, error: linkErr.message };
    const ids = (link ?? []).map((row) => String(row.contatto_id));
    if (ids.length) {
      const { data: contatti, error: contErr } = await supabase
        .from("rubrica_contatti")
        .select("nome, cognome, telefono, email, deleted_at")
        .in("id", ids);
      if (contErr) return { success: false, error: contErr.message };
      for (const contatto of contatti ?? []) {
        if (contatto.deleted_at) continue;
        const chi = `${String(contatto.nome ?? "").trim()} ${String(contatto.cognome ?? "").trim()}`.trim();
        const etichetta = chi ? `${chi} · referente` : "Referente";
        aggiungi(telefoni, vistiTel, String(contatto.telefono ?? ""), etichetta);
        aggiungi(mail, vistiMail, String(contatto.email ?? ""), etichetta);
      }
    }
  }

  return { success: true, telefoni, mail };
}
