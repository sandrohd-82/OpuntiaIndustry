"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { mapClienteRow, type ConsegnaAltraAzienda } from "@/lib/amministrazione/clienti";
import { normalizeContattiGenerici } from "@/lib/amministrazione/contatti-generici";
import type { AnagraficaSchedaDetailModel } from "@/components/amministrazione/AnagraficaSchedaDetail";
import { requireOrdineReadAccess } from "@/lib/auth/ordini-access";
import {
  resolvePerimetroDocumenti,
  rigaNelPerimetro,
} from "@/lib/auth/anagrafica-visibility";
import { formatCommercialeAssegnazione } from "@/lib/auth/commerciale";
import {
  loadCommercialeLabels,
  loadOrganigrammaNomi,
} from "@/lib/auth/commerciale-lineage";
import { parseTrattativa } from "@/lib/promemorie-e-note/trattativa";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ClienteConsegnaAltraAziendaRow, ClienteRow } from "@/types/database";

function statoPossibile(stato: string): string {
  if (stato === "convertito") return "già cliente";
  if (stato === "in_contatto") return "in contatto";
  if (stato === "scartato") return "scartato";
  return "da valutare";
}

function sede(
  row: Record<string, unknown>,
  prefix: "sede_amm" | "sede_mag"
) {
  return {
    nazione: String(row[`${prefix}_nazione`] ?? ""),
    provincia: String(row[`${prefix}_provincia`] ?? ""),
    localita: String(row[`${prefix}_localita`] ?? ""),
    citta: String(row[`${prefix}_citta`] ?? ""),
    cap: String(row[`${prefix}_cap`] ?? ""),
    indirizzo: String(row[`${prefix}_indirizzo`] ?? ""),
  };
}

function consegne(raw: unknown): ConsegnaAltraAzienda[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const r = item as ClienteConsegnaAltraAziendaRow;
    return {
      ragioneSociale: String(r.ragione_sociale ?? ""),
      nazione: String(r.nazione ?? ""),
      provincia: String(r.provincia ?? ""),
      localita: String(r.localita ?? ""),
      citta: String(r.citta ?? ""),
      cap: String(r.cap ?? ""),
      indirizzo: String(r.indirizzo ?? ""),
    };
  });
}

async function etichettaCommerciale(row: {
  commerciale_id?: string | null;
  commerciale_persona_id?: string | null;
  affiancato_id?: string | null;
  affiancato_persona_id?: string | null;
}): Promise<string> {
  const commercialeId = row.commerciale_id ? String(row.commerciale_id) : "";
  const affiancatoId = row.affiancato_id ? String(row.affiancato_id) : "";
  const commercialePersonaId = row.commerciale_persona_id
    ? String(row.commerciale_persona_id)
    : "";
  const affiancatoPersonaId = row.affiancato_persona_id
    ? String(row.affiancato_persona_id)
    : "";
  const [labels, persone] = await Promise.all([
    loadCommercialeLabels([commercialeId, affiancatoId].filter(Boolean)),
    loadOrganigrammaNomi(
      [commercialePersonaId, affiancatoPersonaId].filter(Boolean)
    ),
  ]);
  const commerciale = commercialeId
    ? labels.get(commercialeId)
    : persone.get(commercialePersonaId);
  const affiancato = affiancatoId
    ? labels.get(affiancatoId)
    : persone.get(affiancatoPersonaId);
  return formatCommercialeAssegnazione({
    commercialeId: commercialeId || null,
    commercialePersonaId: commercialePersonaId || null,
    commercialeNome: commerciale?.nome,
    commercialeGrado: commerciale?.grado,
    affiancatoId: affiancatoId || null,
    affiancatoPersonaId: affiancatoPersonaId || null,
    affiancatoNome: affiancato?.nome,
    affiancatoGrado: affiancato?.grado,
  });
}

function modelDaCliente(
  row: ClienteRow,
  commercialeLabel: string
): AnagraficaSchedaDetailModel {
  const cliente = mapClienteRow(row);
  return {
    id: cliente.id,
    kind: "cliente",
    codiceTarga: cliente.codiceTarga,
    ragioneSociale: cliente.ragioneSociale,
    partitaIva: cliente.partitaIva,
    codiceFiscale: cliente.codiceFiscale,
    isPrivato: cliente.isPrivato,
    email: cliente.email,
    pec: cliente.pec,
    sdiCode: cliente.sdiCode,
    telefono: cliente.telefono,
    sitoWeb: cliente.sitoWeb,
    emailGeneriche: cliente.emailGeneriche,
    telefoniGenerici: cliente.telefoniGenerici,
    sitiWebGenerici: cliente.sitiWebGenerici,
    sedeAmministrativa: cliente.sedeAmministrativa,
    sedeMagazzino: cliente.sedeMagazzino,
    consegneAltraAzienda: cliente.consegneAltraAzienda,
    prodotti: cliente.prodottiAcquistati,
    prodottiLabel: "Prodotti acquistati",
    commercialeLabel,
    cancellazionePrenotata: false,
  };
}

function modelDaPossibile(
  row: Record<string, unknown>,
  commercialeLabel: string
): AnagraficaSchedaDetailModel {
  const contatti = normalizeContattiGenerici({
    emailGeneriche: row.email_generiche,
    telefoniGenerici: row.telefoni_generici,
    sitiWebGenerici: row.siti_web_generici,
  });
  const prodotti = Array.isArray(row.prodotti_interessati)
    ? row.prodotti_interessati.map(String).filter(Boolean)
    : [];
  return {
    id: String(row.id),
    kind: "cliente_possibile",
    ragioneSociale: String(row.ragione_sociale ?? ""),
    partitaIva: String(row.partita_iva ?? ""),
    codiceFiscale: String(row.codice_fiscale ?? ""),
    isPrivato: Boolean(row.is_privato),
    email: String(row.email ?? ""),
    pec: String(row.pec ?? ""),
    sdiCode: String(row.sdi_code ?? ""),
    telefono: String(row.telefono ?? ""),
    sitoWeb: String(row.sito_web ?? ""),
    ...contatti,
    sedeAmministrativa: sede(row, "sede_amm"),
    sedeMagazzino: sede(row, "sede_mag"),
    consegneAltraAzienda: consegne(row.consegne_altra_azienda),
    prodotti,
    prodottiLabel: "Prodotti interessati",
    commercialeLabel,
    trattativa: parseTrattativa(row.trattativa),
    statoLabel: statoPossibile(String(row.stato ?? "")),
    referente: String(row.referente ?? ""),
    noteInterne: String(row.note_interne ?? ""),
  };
}

export async function schedaAziendaDaOrdineAction(
  ordineId: string
): Promise<
  | { success: true; scheda: AnagraficaSchedaDetailModel }
  | { success: false; error: string }
> {
  const { auth } = await requireOrdineReadAccess();
  const parsed = z.string().uuid().safeParse(ordineId);
  if (!parsed.success) {
    return { success: false, error: "Ordine non valido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ordini")
    .select(
      "id, numero_interno, cliente_id, cliente_possibile_id, cliente_ragione_sociale, created_by, preventivo_id, deleted_at"
    )
    .eq("id", parsed.data)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const ordine = data as {
    id: string;
    numero_interno: string;
    cliente_id: string | null;
    cliente_possibile_id: string | null;
    cliente_ragione_sociale: string;
    created_by: string | null;
    preventivo_id: string | null;
    deleted_at: string | null;
  } | null;
  if (!ordine || ordine.deleted_at) {
    return { success: false, error: "Ordine non trovato." };
  }
  const perimetro = await resolvePerimetroDocumenti();
  if (
    !perimetro.unrestricted &&
    !rigaNelPerimetro(ordine, perimetro, { autoriSottoalbero: true })
  ) {
    return { success: false, error: "Ordine non trovato." };
  }

  const service = createServiceClient();
  let clienteId = ordine.cliente_id ? String(ordine.cliente_id) : "";
  const possibileId = ordine.cliente_possibile_id
    ? String(ordine.cliente_possibile_id)
    : "";
  if (!clienteId && possibileId) {
    const { data: lead } = await service
      .from("clienti_possibili")
      .select("cliente_id")
      .eq("id", possibileId)
      .maybeSingle();
    const collegato = lead?.cliente_id ? String(lead.cliente_id) : "";
    if (collegato) clienteId = collegato;
  }

  let scheda: AnagraficaSchedaDetailModel | null = null;
  if (clienteId) {
    const { data: row, error: clienteErr } = await service
      .from("clienti")
      .select("*")
      .eq("id", clienteId)
      .maybeSingle();
    if (clienteErr) return { success: false, error: clienteErr.message };
    if (row) {
      const cliente = row as ClienteRow;
      scheda = modelDaCliente(
        cliente,
        await etichettaCommerciale(cliente)
      );
    }
  }
  if (!scheda && possibileId) {
    const { data: row, error: leadErr } = await service
      .from("clienti_possibili")
      .select("*")
      .eq("id", possibileId)
      .maybeSingle();
    if (leadErr) return { success: false, error: leadErr.message };
    if (row) {
      const lead = row as Record<string, unknown>;
      scheda = modelDaPossibile(
        lead,
        await etichettaCommerciale({
          commerciale_id: lead.commerciale_id ? String(lead.commerciale_id) : null,
          commerciale_persona_id: lead.commerciale_persona_id
            ? String(lead.commerciale_persona_id)
            : null,
          affiancato_id: lead.affiancato_id ? String(lead.affiancato_id) : null,
          affiancato_persona_id: lead.affiancato_persona_id
            ? String(lead.affiancato_persona_id)
            : null,
        })
      );
    }
  }
  if (!scheda) {
    return {
      success: false,
      error: "Questo ordine non ha una scheda azienda collegata.",
    };
  }

  await writeAuditLog({
    entity_type: "ordini",
    entity_id: ordine.id,
    action: "view",
    actor_id: auth.actorUserId,
    summary: `Consultata scheda azienda ${scheda.ragioneSociale} dall'ordine ${ordine.numero_interno}`,
    payload: {
      kind: scheda.kind,
      aziendaId: scheda.id,
    },
  });
  return { success: true, scheda };
}
