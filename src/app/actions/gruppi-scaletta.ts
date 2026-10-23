"use server";

import { passaCampionaturaInScalettaAction } from "@/app/actions/campionature";
import { listLottiMagazzinoInserimentoAction } from "@/app/actions/lotto-produzione-magazzino";
import { processOrdineInScalettaAction } from "@/app/actions/ordini";
import {
  inviaMailSpedizioneAction,
  listCaselleSpedizioneMailAction,
  upsertPrenotazioneSpedizioneMailAction,
} from "@/app/actions/spedizione-mail";
import { writeAuditLog } from "@/lib/audit";
import { requireOrdineProcessAccess } from "@/lib/auth/ordini-access";
import {
  EMAIL_CONTROLLO_DEFAULT,
  oggiRoma,
} from "@/lib/amministrazione/prova-ordine";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

export type RiferimentoDocumento = {
  entityType: "ordine" | "campionatura";
  entityId: string;
};

export type CandidatoRaggruppamento = RiferimentoDocumento & {
  numero: string;
  cliente: string;
  destinatario: string;
  indirizzo: string;
  prodotto: string;
  tipoOrdine: "vendita" | "campionatura" | "";
  stessoDestinatario: boolean;
};

export type ContestoRaggruppamento = {
  candidati: CandidatoRaggruppamento[];
  processo: { numero: string; stato: string } | null;
  spedizione: {
    numero: string;
    stato: string;
    trackingUrl: string;
    mailInviata: boolean;
    colli: Array<{ etichetta: string; numeri: string[] }>;
  } | null;
};

const riferimentoSchema = z.object({
  entityType: z.enum(["ordine", "campionatura"]),
  entityId: z.string().uuid(),
});

const salvaSchema = z.object({
  principale: riferimentoSchema,
  processo: z.array(riferimentoSchema).max(30),
  colli: z
    .array(
      z.object({
        etichetta: z.string().trim().min(1).max(80),
        membri: z.array(riferimentoSchema).min(1).max(30),
      })
    )
    .max(12),
  trackingUrl: z.string().trim().max(2000).optional().default(""),
  mailInviata: z.boolean().optional().default(false),
  parametriOrdine: z
    .object({
      giorniProduzione: z.array(z.string()).optional(),
      giorniAttivita: z.array(z.string()).optional(),
      attivitaSnapshot: z
        .array(
          z.object({
            attivitaId: z.string(),
            codice: z.string(),
            titolo: z.string(),
            dates: z.array(z.string()),
          })
        )
        .optional(),
      dataConsegnaCalendario: z.string(),
      usaMagazzino: z.boolean().optional(),
      approvvigionamento: z.enum(["magazzino", "lavorazione"]).optional(),
      usaSabato: z.boolean().optional(),
      urgente: z.boolean().optional(),
    })
    .optional(),
});

type DocBreve = {
  entityType: "ordine" | "campionatura";
  entityId: string;
  numero: string;
  cliente: string;
  destinatario: string;
  indirizzo: string;
  prodotto: string;
  tipoOrdine: "vendita" | "campionatura" | "";
  inCoda: boolean;
};

function chiaveDestinatario(nome: string, indirizzo: string): string {
  return `${nome} ${indirizzo}`.trim().toLowerCase().replace(/\s+/g, " ");
}

function chiaveDoc(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function dedupe(refs: RiferimentoDocumento[]): RiferimentoDocumento[] {
  const visti = new Set<string>();
  const out: RiferimentoDocumento[] = [];
  for (const ref of refs) {
    const key = chiaveDoc(ref.entityType, ref.entityId);
    if (visti.has(key)) continue;
    visti.add(key);
    out.push(ref);
  }
  return out;
}

async function numeriAperti(
  table: "produzione_gruppi_processo" | "spedizioni_gruppi",
  stati: string[]
): Promise<Set<string>> {
  const service = createServiceClient();
  const { data: gruppi } = await service
    .from(table)
    .select("id")
    .in("stato", stati)
    .is("deleted_at", null);
  const ids = (gruppi ?? []).map((row) => String((row as { id: string }).id));
  if (ids.length === 0) return new Set();
  if (table === "produzione_gruppi_processo") {
    const { data: membri } = await service
      .from("produzione_gruppi_processo_membri")
      .select("entity_type, entity_id")
      .in("gruppo_id", ids)
      .is("deleted_at", null);
    return new Set(
      (membri ?? []).map((row) =>
        chiaveDoc(
          String((row as { entity_type: string }).entity_type),
          String((row as { entity_id: string }).entity_id)
        )
      )
    );
  }
  const { data: contenuti } = await service
    .from("spedizioni_gruppi_contenuti")
    .select("entity_type, entity_id")
    .in("gruppo_id", ids)
    .is("deleted_at", null);
  return new Set(
    (contenuti ?? []).map((row) =>
      chiaveDoc(
        String((row as { entity_type: string }).entity_type),
        String((row as { entity_id: string }).entity_id)
      )
    )
  );
}

async function caricaDocumentiCoda(): Promise<DocBreve[]> {
  const service = createServiceClient();
  const [{ data: ordini }, { data: campionature }] = await Promise.all([
    service
      .from("ordini")
      .select(
        "id, numero_interno, cliente_ragione_sociale, destinatario, indirizzo_spedizione, stato, tipo"
      )
      .in("stato", ["in_attesa", "ricevuto"])
      .is("deleted_at", null)
      .limit(80),
    service
      .from("campionature")
      .select(
        "id, numero_interno, cliente_ragione_sociale, destinatario, indirizzo_spedizione, stato"
      )
      .in("stato", ["inserita", "bozza"])
      .is("deleted_at", null)
      .limit(80),
  ]);
  const ordineIds = (ordini ?? []).map((row) => String((row as { id: string }).id));
  const campIds = (campionature ?? []).map((row) =>
    String((row as { id: string }).id)
  );
  const prodottiOrdine = new Map<string, string>();
  const prodottiCamp = new Map<string, string>();
  if (ordineIds.length > 0) {
    const { data: righe } = await service
      .from("ordini_righe")
      .select("ordine_id, prodotto_codice, sort_order")
      .in("ordine_id", ordineIds)
      .order("sort_order", { ascending: true });
    for (const riga of righe ?? []) {
      const id = String((riga as { ordine_id: string }).ordine_id);
      if (!prodottiOrdine.has(id)) {
        prodottiOrdine.set(id, String((riga as { prodotto_codice?: string }).prodotto_codice ?? ""));
      }
    }
  }
  if (campIds.length > 0) {
    const { data: righe } = await service
      .from("campionature_righe")
      .select("campionatura_id, prodotto_codice")
      .in("campionatura_id", campIds);
    for (const riga of righe ?? []) {
      const id = String((riga as { campionatura_id: string }).campionatura_id);
      if (!prodottiCamp.has(id)) {
        prodottiCamp.set(
          id,
          String((riga as { prodotto_codice?: string }).prodotto_codice ?? "")
        );
      }
    }
  }
  const documenti: DocBreve[] = [];
  for (const row of ordini ?? []) {
    const item = row as {
      id: string;
      numero_interno: string;
      cliente_ragione_sociale: string;
      destinatario?: string | null;
      indirizzo_spedizione?: string | null;
      tipo?: string | null;
    };
    const tipo = item.tipo === "campionatura" ? "campionatura" : "vendita";
    documenti.push({
      entityType: "ordine",
      entityId: item.id,
      numero: item.numero_interno,
      cliente: item.cliente_ragione_sociale,
      destinatario: String(item.destinatario ?? ""),
      indirizzo: String(item.indirizzo_spedizione ?? ""),
      prodotto: prodottiOrdine.get(item.id) ?? "",
      tipoOrdine: tipo,
      inCoda: true,
    });
  }
  for (const row of campionature ?? []) {
    const item = row as {
      id: string;
      numero_interno: string;
      cliente_ragione_sociale: string;
      destinatario?: string | null;
      indirizzo_spedizione?: string | null;
    };
    documenti.push({
      entityType: "campionatura",
      entityId: item.id,
      numero: item.numero_interno,
      cliente: item.cliente_ragione_sociale,
      destinatario: String(item.destinatario ?? ""),
      indirizzo: String(item.indirizzo_spedizione ?? ""),
      prodotto: prodottiCamp.get(item.id) ?? "",
      tipoOrdine: "",
      inCoda: true,
    });
  }
  return documenti;
}

async function leggiDocumento(
  ref: RiferimentoDocumento
): Promise<DocBreve | null> {
  const service = createServiceClient();
  if (ref.entityType === "ordine") {
    const { data } = await service
      .from("ordini")
      .select(
        "id, numero_interno, cliente_ragione_sociale, destinatario, indirizzo_spedizione, stato, tipo"
      )
      .eq("id", ref.entityId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return null;
    const item = data as {
      numero_interno: string;
      cliente_ragione_sociale: string;
      destinatario?: string | null;
      indirizzo_spedizione?: string | null;
      stato: string;
      tipo?: string | null;
    };
    return {
      entityType: "ordine",
      entityId: ref.entityId,
      numero: item.numero_interno,
      cliente: item.cliente_ragione_sociale,
      destinatario: String(item.destinatario ?? ""),
      indirizzo: String(item.indirizzo_spedizione ?? ""),
      prodotto: "",
      tipoOrdine: item.tipo === "campionatura" ? "campionatura" : "vendita",
      inCoda: item.stato === "in_attesa" || item.stato === "ricevuto",
    };
  }
  const { data } = await service
    .from("campionature")
    .select(
      "id, numero_interno, cliente_ragione_sociale, destinatario, indirizzo_spedizione, stato"
    )
    .eq("id", ref.entityId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const item = data as {
    numero_interno: string;
    cliente_ragione_sociale: string;
    destinatario?: string | null;
    indirizzo_spedizione?: string | null;
    stato: string;
  };
  return {
    entityType: "campionatura",
    entityId: ref.entityId,
    numero: item.numero_interno,
    cliente: item.cliente_ragione_sociale,
    destinatario: String(item.destinatario ?? ""),
    indirizzo: String(item.indirizzo_spedizione ?? ""),
    prodotto: "",
    tipoOrdine: "",
    inCoda: item.stato === "inserita" || item.stato === "bozza",
  };
}

async function gruppoApertoDi(
  table: "processo" | "spedizione",
  ref: RiferimentoDocumento
): Promise<{ id: string; numero: string; stato: string; trackingUrl: string; mailInviata: boolean } | null> {
  const service = createServiceClient();
  if (table === "processo") {
    const { data: membri } = await service
      .from("produzione_gruppi_processo_membri")
      .select("gruppo_id")
      .eq("entity_type", ref.entityType)
      .eq("entity_id", ref.entityId)
      .is("deleted_at", null);
    const ids = (membri ?? []).map((row) => String((row as { gruppo_id: string }).gruppo_id));
    if (ids.length === 0) return null;
    const { data } = await service
      .from("produzione_gruppi_processo")
      .select("id, numero, stato")
      .in("id", ids)
      .in("stato", ["bozza", "in_scaletta"])
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const gruppo = data as { id: string; numero: string; stato: string };
    return {
      id: gruppo.id,
      numero: gruppo.numero,
      stato: gruppo.stato,
      trackingUrl: "",
      mailInviata: false,
    };
  }
  const { data: contenuti } = await service
    .from("spedizioni_gruppi_contenuti")
    .select("gruppo_id")
    .eq("entity_type", ref.entityType)
    .eq("entity_id", ref.entityId)
    .is("deleted_at", null);
  const ids = (contenuti ?? []).map((row) => String((row as { gruppo_id: string }).gruppo_id));
  if (ids.length === 0) return null;
  const { data } = await service
    .from("spedizioni_gruppi")
    .select("id, numero, stato, tracking_url, mail_inviata_at")
    .in("id", ids)
    .in("stato", ["bozza", "pronta", "spedita"])
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const gruppo = data as {
    id: string;
    numero: string;
    stato: string;
    tracking_url?: string | null;
    mail_inviata_at?: string | null;
  };
  return {
    id: gruppo.id,
    numero: gruppo.numero,
    stato: gruppo.stato,
    trackingUrl: String(gruppo.tracking_url ?? ""),
    mailInviata: Boolean(gruppo.mail_inviata_at),
  };
}

async function prossimoNumero(
  table: "produzione_gruppi_processo" | "spedizioni_gruppi",
  prefix: "GP" | "GS"
): Promise<string> {
  const service = createServiceClient();
  const yy = String(new Date().getFullYear()).slice(2);
  const { data } = await service
    .from(table)
    .select("numero")
    .like("numero", `${prefix}-${yy}-%`);
  let max = 0;
  for (const row of data ?? []) {
    const pezzo = String((row as { numero?: string }).numero ?? "").split("-").pop();
    max = Math.max(max, Number(pezzo) || 0);
  }
  return `${prefix}-${yy}-${String(max + 1).padStart(4, "0")}`;
}

export async function contestoRaggruppamentoScalettaAction(input: {
  entityType: "ordine" | "campionatura";
  entityId: string;
}): Promise<
  { success: true; contesto: ContestoRaggruppamento } | { success: false; error: string }
> {
  await requireOrdineProcessAccess();
  const parsed = riferimentoSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Documento non valido." };
  const principale = await leggiDocumento(parsed.data);
  if (!principale) return { success: false, error: "Documento non trovato." };
  const [occupatiProcesso, occupatiSpedizione, documenti, processo, spedizione] =
    await Promise.all([
      numeriAperti("produzione_gruppi_processo", ["bozza", "in_scaletta"]),
      numeriAperti("spedizioni_gruppi", ["bozza", "pronta", "spedita"]),
      caricaDocumentiCoda(),
      gruppoApertoDi("processo", parsed.data),
      gruppoApertoDi("spedizione", parsed.data),
    ]);
  const chiavePrincipale = chiaveDestinatario(
    principale.destinatario || principale.cliente,
    principale.indirizzo
  );
  const propria = chiaveDoc(parsed.data.entityType, parsed.data.entityId);
  const candidati = documenti
    .filter((doc) => chiaveDoc(doc.entityType, doc.entityId) !== propria)
    .filter(
      (doc) =>
        !occupatiProcesso.has(chiaveDoc(doc.entityType, doc.entityId)) &&
        !occupatiSpedizione.has(chiaveDoc(doc.entityType, doc.entityId))
    )
    .map((doc) => {
      const chiave = chiaveDestinatario(doc.destinatario || doc.cliente, doc.indirizzo);
      return {
        entityType: doc.entityType,
        entityId: doc.entityId,
        numero: doc.numero,
        cliente: doc.cliente,
        destinatario: doc.destinatario || doc.cliente,
        indirizzo: doc.indirizzo,
        prodotto: doc.prodotto,
        tipoOrdine: doc.tipoOrdine,
        stessoDestinatario: Boolean(chiavePrincipale) && chiave === chiavePrincipale,
      };
    })
    .sort((a, b) => Number(b.stessoDestinatario) - Number(a.stessoDestinatario));

  let colli: Array<{ etichetta: string; numeri: string[] }> = [];
  if (spedizione) {
    const service = createServiceClient();
    const { data: scatole } = await service
      .from("spedizioni_gruppi_colli")
      .select("id, etichetta, sort_order")
      .eq("gruppo_id", spedizione.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    const { data: contenuti } = await service
      .from("spedizioni_gruppi_contenuti")
      .select("collo_id, entity_type, entity_id")
      .eq("gruppo_id", spedizione.id)
      .is("deleted_at", null);
    colli = (scatole ?? []).map((scatola) => {
      const id = String((scatola as { id: string }).id);
      const numeri = (contenuti ?? [])
        .filter((row) => String((row as { collo_id: string }).collo_id) === id)
        .map((row) =>
          chiaveDoc(
            String((row as { entity_type: string }).entity_type),
            String((row as { entity_id: string }).entity_id)
          )
        );
      return {
        etichetta: String((scatola as { etichetta: string }).etichetta),
        numeri,
      };
    });
  }

  return {
    success: true,
    contesto: {
      candidati,
      processo: processo ? { numero: processo.numero, stato: processo.stato } : null,
      spedizione: spedizione
        ? {
            numero: spedizione.numero,
            stato: spedizione.stato,
            trackingUrl: spedizione.trackingUrl,
            mailInviata: spedizione.mailInviata,
            colli,
          }
        : null,
    },
  };
}

export async function salvaGruppiScalettaAction(
  raw: unknown
): Promise<{ success: true; avviso: string } | { success: false; error: string }> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = salvaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Raggruppamento non valido.",
    };
  }
  const input = parsed.data;
  const principale = await leggiDocumento(input.principale);
  if (!principale) return { success: false, error: "Documento principale non trovato." };

  const note: string[] = [];
  const service = createServiceClient();
  const ora = new Date().toISOString();
  const [occupatiProcesso, occupatiSpedizione, processoEsistente, spedizioneEsistente] =
    await Promise.all([
      numeriAperti("produzione_gruppi_processo", ["bozza", "in_scaletta"]),
      numeriAperti("spedizioni_gruppi", ["bozza", "pronta", "spedita"]),
      gruppoApertoDi("processo", input.principale),
      gruppoApertoDi("spedizione", input.principale),
    ]);

  const extrasProcesso = dedupe(input.processo).filter(
    (ref) => chiaveDoc(ref.entityType, ref.entityId) !== chiaveDoc(principale.entityType, principale.entityId)
  );
  if (extrasProcesso.length > 0 && !processoEsistente) {
    const ammessi: Array<{ ref: RiferimentoDocumento; doc: DocBreve; inScaletta: boolean }> = [];
    for (const ref of extrasProcesso) {
      const key = chiaveDoc(ref.entityType, ref.entityId);
      if (occupatiProcesso.has(key)) {
        note.push("Un documento è già in un processo aperto.");
        continue;
      }
      const doc = await leggiDocumento(ref);
      if (!doc || !doc.inCoda) {
        note.push("Un documento scelto per il processo non è più da processare.");
        continue;
      }
      if (ref.entityType === "ordine") {
        const parametri = input.parametriOrdine;
        if (!parametri?.dataConsegnaCalendario) {
          note.push(
            `${doc.numero} resta da processare: mancano i giorni del processo.`
          );
          continue;
        }
        const esito = await processOrdineInScalettaAction({
          ordineId: ref.entityId,
          giorniProduzione: parametri.giorniProduzione ?? [],
          giorniAttivita: parametri.giorniAttivita ?? [],
          attivitaSnapshot: parametri.attivitaSnapshot ?? [],
          dataConsegnaCalendario: parametri.dataConsegnaCalendario,
          urgente: parametri.urgente ?? false,
          usaMagazzino: parametri.usaMagazzino ?? true,
          approvvigionamento: parametri.approvvigionamento ?? "magazzino",
          usaSabato: parametri.usaSabato ?? false,
        });
        if (!esito.success) {
          note.push(`${doc.numero} non è entrato in scaletta: ${esito.error}`);
          continue;
        }
        ammessi.push({ ref, doc, inScaletta: true });
        if (esito.avviso) note.push(`${doc.numero}: ${esito.avviso}`);
      } else {
        ammessi.push({ ref, doc, inScaletta: false });
        note.push(
          `${doc.numero} è nel processo. Resta da processare per scegliere il lotto.`
        );
      }
    }
    if (ammessi.length > 0) {
      const numero = await prossimoNumero("produzione_gruppi_processo", "GP");
      const { data: creato, error } = await service
        .from("produzione_gruppi_processo")
        .insert({
          numero,
          stato: "in_scaletta",
          documento_stato: "approvato",
          versione: 1,
          created_by: auth.userId,
          updated_by: auth.userId,
        })
        .select("id")
        .single();
      if (error || !creato) {
        note.push(error?.message ?? "Processo non creato.");
      } else {
        const gruppoId = String((creato as { id: string }).id);
        const membri = [
          {
            gruppo_id: gruppoId,
            entity_type: principale.entityType,
            entity_id: principale.entityId,
            in_scaletta: true,
            created_by: auth.userId,
            updated_by: auth.userId,
          },
          ...ammessi.map((item) => ({
            gruppo_id: gruppoId,
            entity_type: item.ref.entityType,
            entity_id: item.ref.entityId,
            in_scaletta: item.inScaletta,
            created_by: auth.userId,
            updated_by: auth.userId,
          })),
        ];
        const { error: memErr } = await service
          .from("produzione_gruppi_processo_membri")
          .insert(membri);
        if (memErr) note.push(memErr.message);
        else {
          note.unshift(`Processo ${numero} con ${membri.length} documenti.`);
          await writeAuditLog({
            entity_type: "produzione_gruppi_processo",
            entity_id: gruppoId,
            action: "create",
            actor_id: auth.userId,
            summary: `Creato processo ${numero}`,
            payload: {
              numero,
              membri: membri.map((m) => ({
                entity_type: m.entity_type,
                entity_id: m.entity_id,
                in_scaletta: m.in_scaletta,
              })),
            },
          });
        }
      }
    }
  }

  const colliRichiesti = input.colli
    .map((collo) => ({
      etichetta: collo.etichetta,
      membri: dedupe(collo.membri),
    }))
    .filter((collo) => collo.membri.length > 0);
  const membriSpedizione = dedupe(colliRichiesti.flatMap((collo) => collo.membri));
  const extraSpedizione = membriSpedizione.filter(
    (ref) => chiaveDoc(ref.entityType, ref.entityId) !== chiaveDoc(principale.entityType, principale.entityId)
  );
  if (extraSpedizione.length > 0 && !spedizioneEsistente) {
    const visti = new Set<string>();
    let doppio = false;
    for (const collo of colliRichiesti) {
      for (const membro of collo.membri) {
        const key = chiaveDoc(membro.entityType, membro.entityId);
        if (visti.has(key)) doppio = true;
        visti.add(key);
      }
    }
    const principaleDentro = visti.has(
      chiaveDoc(principale.entityType, principale.entityId)
    );
    if (doppio || !principaleDentro) {
      note.push(
        "La spedizione non è stata creata: ogni documento sta in una sola scatola e questo documento va incluso."
      );
    } else {
      const validi: RiferimentoDocumento[] = [input.principale];
      for (const ref of extraSpedizione) {
        const key = chiaveDoc(ref.entityType, ref.entityId);
        if (occupatiSpedizione.has(key)) {
          note.push("Un documento è già in una spedizione aperta.");
          continue;
        }
        const doc = await leggiDocumento(ref);
        if (!doc) {
          note.push("Un documento della spedizione non è più disponibile.");
          continue;
        }
        validi.push(ref);
      }
      if (validi.length > 1) {
        const numero = await prossimoNumero("spedizioni_gruppi", "GS");
        const conTracking = Boolean(input.trackingUrl.trim());
        const { data: creato, error } = await service
          .from("spedizioni_gruppi")
          .insert({
            numero,
            stato: conTracking ? "pronta" : "bozza",
            documento_stato: conTracking ? "approvato" : "bozza",
            versione: 1,
            destinatario: principale.destinatario || principale.cliente,
            indirizzo: principale.indirizzo,
            tracking_url: input.trackingUrl.trim(),
            mail_inviata_at: input.mailInviata ? ora : null,
            created_by: auth.userId,
            updated_by: auth.userId,
          })
          .select("id")
          .single();
        if (error || !creato) {
          note.push(error?.message ?? "Spedizione non creata.");
        } else {
          const gruppoId = String((creato as { id: string }).id);
          const ammessi = new Set(validi.map((ref) => chiaveDoc(ref.entityType, ref.entityId)));
          let sort = 0;
          const colliCreati: string[] = [];
          for (const collo of colliRichiesti) {
            const membri = collo.membri.filter((ref) =>
              ammessi.has(chiaveDoc(ref.entityType, ref.entityId))
            );
            if (membri.length === 0) continue;
            const { data: scatola, error: colloErr } = await service
              .from("spedizioni_gruppi_colli")
              .insert({
                gruppo_id: gruppoId,
                etichetta: collo.etichetta,
                sort_order: sort,
                created_by: auth.userId,
                updated_by: auth.userId,
              })
              .select("id")
              .single();
            sort += 1;
            if (colloErr || !scatola) {
              note.push(colloErr?.message ?? "Scatola non creata.");
              continue;
            }
            const colloId = String((scatola as { id: string }).id);
            colliCreati.push(collo.etichetta);
            const { error: contErr } = await service
              .from("spedizioni_gruppi_contenuti")
              .insert(
                membri.map((ref) => ({
                  gruppo_id: gruppoId,
                  collo_id: colloId,
                  entity_type: ref.entityType,
                  entity_id: ref.entityId,
                  created_by: auth.userId,
                  updated_by: auth.userId,
                }))
              );
            if (contErr) note.push(contErr.message);
          }
          note.unshift(
            `Spedizione ${numero} in ${colliCreati.length} scatole. La mail di tracking è unica.`
          );
          await writeAuditLog({
            entity_type: "spedizioni_gruppi",
            entity_id: gruppoId,
            action: "create",
            actor_id: auth.userId,
            summary: `Creata spedizione ${numero}`,
            payload: {
              numero,
              destinatario: principale.destinatario || principale.cliente,
              colli: colliCreati,
              mail_inviata: input.mailInviata,
              tracking: Boolean(input.trackingUrl.trim()),
            },
          });
        }
      }
    }
  }

  return { success: true, avviso: note.filter(Boolean).join(" ") };
}

const raggruppaSchema = z.object({
  documenti: z.array(riferimentoSchema).min(1).max(30),
  giaProcessato: riferimentoSchema.nullable().optional(),
  unicoPacco: z.boolean(),
  unicaMail: z.boolean(),
  trackingUrl: z.string().trim().max(2000).optional().default(""),
});

async function emailCliente(ref: RiferimentoDocumento): Promise<string> {
  const service = createServiceClient();
  const table = ref.entityType === "ordine" ? "ordini" : "campionature";
  const colonna =
    ref.entityType === "ordine" ? "cliente_id" : "cliente_id";
  const { data } = await service
    .from(table)
    .select(colonna)
    .eq("id", ref.entityId)
    .maybeSingle();
  const clienteId = String(
    (data as { cliente_id?: string | null } | null)?.cliente_id ?? ""
  );
  if (!clienteId) return "";
  const { data: cliente } = await service
    .from("clienti")
    .select("email")
    .eq("id", clienteId)
    .maybeSingle();
  const email = String((cliente as { email?: string | null } | null)?.email ?? "")
    .trim();
  if (email.toLowerCase() === EMAIL_CONTROLLO_DEFAULT.toLowerCase()) return "";
  return email;
}

async function processaCampionaturaInGruppo(
  campionaturaId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const service = createServiceClient();
  const { data: righeData, error } = await service
    .from("campionature_righe")
    .select("id, prodotto_id, prodotto_codice")
    .eq("campionatura_id", campionaturaId);
  if (error) return { success: false, error: error.message };
  const righe = (righeData ?? []) as Array<{
    id: string;
    prodotto_id: string | null;
    prodotto_codice: string;
  }>;
  const lotti = await listLottiMagazzinoInserimentoAction();
  if (!lotti.success) return { success: false, error: lotti.error };
  const scelte = [];
  for (const riga of righe) {
    const lotto = lotti.lotti.find(
      (item) => item.prodottoId === riga.prodotto_id && item.quantitaKg > 0
    );
    if (!lotto) {
      return {
        success: false,
        error: `Manca un lotto a magazzino per ${riga.prodotto_codice}.`,
      };
    }
    scelte.push({
      rigaId: riga.id,
      lottoInternoCodice: lotto.lottoInternoCodice,
      lottoProdottoId: lotto.prodottoId,
      lottoProdottoCodice: lotto.prodottoCodice,
      conforme: true,
      processoId: null,
      processoCodice: "",
      processoNome: "",
      sottoprodottoPrenotato: false,
    });
  }
  if (scelte.length === 0) {
    return { success: false, error: "Campionatura senza righe." };
  }
  const oggi = oggiRoma();
  return passaCampionaturaInScalettaAction({
    campionaturaId,
    dataLavorazione: oggi,
    dataConfezionamento: oggi,
    righe: scelte,
    pack: {},
  });
}

export async function elencoRaggruppoScalettaAction(): Promise<
  | {
      success: true;
      coda: CandidatoRaggruppamento[];
      giaProcessati: CandidatoRaggruppamento[];
    }
  | { success: false; error: string }
> {
  await requireOrdineProcessAccess();
  const service = createServiceClient();
  const [coda, occupatiProcesso, occupatiSpedizione] = await Promise.all([
    caricaDocumentiCoda(),
    numeriAperti("produzione_gruppi_processo", ["bozza", "in_scaletta"]),
    numeriAperti("spedizioni_gruppi", ["bozza", "pronta", "spedita"]),
  ]);
  const liberi = (docs: DocBreve[]) =>
    docs.filter(
      (doc) =>
        !occupatiProcesso.has(chiaveDoc(doc.entityType, doc.entityId)) &&
        !occupatiSpedizione.has(chiaveDoc(doc.entityType, doc.entityId))
    );
  const [{ data: ordini }, { data: campionature }] = await Promise.all([
    service
      .from("ordini")
      .select(
        "id, numero_interno, cliente_ragione_sociale, destinatario, indirizzo_spedizione, tipo"
      )
      .eq("stato", "in_scaletta")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(40),
    service
      .from("campionature")
      .select(
        "id, numero_interno, cliente_ragione_sociale, destinatario, indirizzo_spedizione"
      )
      .eq("stato", "processata")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);
  const gia: DocBreve[] = [];
  for (const row of ordini ?? []) {
    const item = row as {
      id: string;
      numero_interno: string;
      cliente_ragione_sociale: string;
      destinatario?: string | null;
      indirizzo_spedizione?: string | null;
      tipo?: string | null;
    };
    gia.push({
      entityType: "ordine",
      entityId: item.id,
      numero: item.numero_interno,
      cliente: item.cliente_ragione_sociale,
      destinatario: String(item.destinatario ?? ""),
      indirizzo: String(item.indirizzo_spedizione ?? ""),
      prodotto: "",
      tipoOrdine: item.tipo === "campionatura" ? "campionatura" : "vendita",
      inCoda: false,
    });
  }
  for (const row of campionature ?? []) {
    const item = row as {
      id: string;
      numero_interno: string;
      cliente_ragione_sociale: string;
      destinatario?: string | null;
      indirizzo_spedizione?: string | null;
    };
    gia.push({
      entityType: "campionatura",
      entityId: item.id,
      numero: item.numero_interno,
      cliente: item.cliente_ragione_sociale,
      destinatario: String(item.destinatario ?? ""),
      indirizzo: String(item.indirizzo_spedizione ?? ""),
      prodotto: "",
      tipoOrdine: "",
      inCoda: false,
    });
  }
  const mappa = (doc: DocBreve): CandidatoRaggruppamento => ({
    entityType: doc.entityType,
    entityId: doc.entityId,
    numero: doc.numero,
    cliente: doc.cliente,
    destinatario: doc.destinatario || doc.cliente,
    indirizzo: doc.indirizzo,
    prodotto: doc.prodotto,
    tipoOrdine: doc.tipoOrdine,
    stessoDestinatario: false,
  });
  return {
    success: true,
    coda: liberi(coda).map(mappa),
    giaProcessati: gia.map(mappa),
  };
}

export async function raggruppaEProcessaAction(
  raw: unknown
): Promise<{ success: true; avviso: string } | { success: false; error: string }> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = raggruppaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Raggruppamento non valido.",
    };
  }
  const input = parsed.data;
  const documenti = dedupe(input.documenti);
  const gia = input.giaProcessato ?? null;
  const totale = documenti.length + (gia ? 1 : 0);
  if (totale < 2) {
    return {
      success: false,
      error: "Seleziona almeno due documenti, oppure uno e un ordine già in scaletta.",
    };
  }
  if (input.unicaMail && !input.trackingUrl.trim()) {
    return {
      success: false,
      error: "Con la mail unica serve il link di tracking.",
    };
  }
  const note: string[] = [];
  const entrati: RiferimentoDocumento[] = [];
  const oggi = oggiRoma();
  for (const ref of documenti) {
    const doc = await leggiDocumento(ref);
    if (!doc) {
      note.push("Un documento selezionato non è più disponibile.");
      continue;
    }
    if (!doc.inCoda) {
      entrati.push(ref);
      continue;
    }
    if (ref.entityType === "ordine") {
      const esito = await processOrdineInScalettaAction({
        ordineId: ref.entityId,
        giorniProduzione: [],
        giorniAttivita: [],
        dataConsegnaCalendario: oggi,
        urgente: false,
        usaMagazzino: true,
        approvvigionamento: "magazzino",
        usaSabato: false,
      });
      if (!esito.success) {
        note.push(`${doc.numero} non è entrato in scaletta: ${esito.error}`);
        continue;
      }
      entrati.push(ref);
      if (esito.avviso) note.push(`${doc.numero}: ${esito.avviso}`);
    } else {
      const esito = await processaCampionaturaInGruppo(ref.entityId);
      if (!esito.success) {
        note.push(`${doc.numero} non è entrato in scaletta: ${esito.error}`);
        continue;
      }
      entrati.push(ref);
    }
  }
  if (gia) {
    const doc = await leggiDocumento(gia);
    if (!doc || doc.inCoda) {
      return {
        success: false,
        error: "L'ordine da associare non risulta già in scaletta.",
      };
    }
    entrati.push(gia);
  }
  const unici = dedupe(entrati);
  if (unici.length < 2) {
    return {
      success: false,
      error: note.join(" ") || "Non ci sono abbastanza documenti entrati in scaletta.",
    };
  }

  const ancora = gia ?? unici[0];
  const ancoraDoc = await leggiDocumento(ancora);
  if (!ancoraDoc) return { success: false, error: "Documento di ancoraggio non trovato." };
  const processoEsistente = await gruppoApertoDi("processo", ancora);
  const spedizioneEsistente = await gruppoApertoDi("spedizione", ancora);
  const service = createServiceClient();

  if (processoEsistente && gia) {
    const nuovi = unici.filter(
      (ref) => chiaveDoc(ref.entityType, ref.entityId) !== chiaveDoc(gia.entityType, gia.entityId)
    );
    if (nuovi.length > 0) {
      const { error } = await service.from("produzione_gruppi_processo_membri").insert(
        nuovi.map((ref) => ({
          gruppo_id: processoEsistente.id,
          entity_type: ref.entityType,
          entity_id: ref.entityId,
          in_scaletta: true,
          created_by: auth.userId,
          updated_by: auth.userId,
        }))
      );
      if (error) note.push(error.message);
      else note.unshift(`Aggiunti al processo ${processoEsistente.numero}.`);
    }
  } else {
    const numero = await prossimoNumero("produzione_gruppi_processo", "GP");
    const { data: creato, error } = await service
      .from("produzione_gruppi_processo")
      .insert({
        numero,
        stato: "in_scaletta",
        documento_stato: "approvato",
        versione: 1,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !creato) note.push(error?.message ?? "Processo non creato.");
    else {
      const gruppoId = String((creato as { id: string }).id);
      await service.from("produzione_gruppi_processo_membri").insert(
        unici.map((ref) => ({
          gruppo_id: gruppoId,
          entity_type: ref.entityType,
          entity_id: ref.entityId,
          in_scaletta: true,
          created_by: auth.userId,
          updated_by: auth.userId,
        }))
      );
      note.unshift(`Processo ${numero} con ${unici.length} documenti.`);
      await writeAuditLog({
        entity_type: "produzione_gruppi_processo",
        entity_id: gruppoId,
        action: "create",
        actor_id: auth.userId,
        summary: `Creato processo ${numero} dal raggruppamento`,
        payload: { numero, membri: unici, unico_pacco: input.unicoPacco, unica_mail: input.unicaMail },
      });
    }
  }

  const etichette = input.unicoPacco
    ? [{ etichetta: "Pacco unico", membri: unici }]
    : unici.map((ref, index) => ({
        etichetta: `Pacco ${index + 1}`,
        membri: [ref],
      }));

  let gruppoSpedizioneId = spedizioneEsistente?.id ?? "";
  let numeroSpedizione = spedizioneEsistente?.numero ?? "";
  if (spedizioneEsistente && gia) {
    const { error } = await service
      .from("spedizioni_gruppi")
      .update({
        unico_pacco: input.unicoPacco,
        unica_mail: input.unicaMail,
        tracking_url: input.trackingUrl.trim() || undefined,
        updated_by: auth.userId,
      })
      .eq("id", spedizioneEsistente.id);
    if (error) note.push(error.message);
    else note.unshift(`Spedizione ${spedizioneEsistente.numero} aggiornata.`);
  } else {
    numeroSpedizione = await prossimoNumero("spedizioni_gruppi", "GS");
    const { data: creato, error } = await service
      .from("spedizioni_gruppi")
      .insert({
        numero: numeroSpedizione,
        stato: input.trackingUrl.trim() ? "pronta" : "bozza",
        documento_stato: input.trackingUrl.trim() ? "approvato" : "bozza",
        versione: 1,
        destinatario: ancoraDoc.destinatario || ancoraDoc.cliente,
        indirizzo: ancoraDoc.indirizzo,
        tracking_url: input.trackingUrl.trim(),
        unico_pacco: input.unicoPacco,
        unica_mail: input.unicaMail,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !creato) note.push(error?.message ?? "Spedizione non creata.");
    else {
      gruppoSpedizioneId = String((creato as { id: string }).id);
      let sort = 0;
      for (const collo of etichette) {
        const { data: scatola, error: colloErr } = await service
          .from("spedizioni_gruppi_colli")
          .insert({
            gruppo_id: gruppoSpedizioneId,
            etichetta: collo.etichetta,
            sort_order: sort,
            created_by: auth.userId,
            updated_by: auth.userId,
          })
          .select("id")
          .single();
        sort += 1;
        if (colloErr || !scatola) {
          note.push(colloErr?.message ?? "Pacco non creato.");
          continue;
        }
        await service.from("spedizioni_gruppi_contenuti").insert(
          collo.membri.map((ref) => ({
            gruppo_id: gruppoSpedizioneId,
            collo_id: String((scatola as { id: string }).id),
            entity_type: ref.entityType,
            entity_id: ref.entityId,
            created_by: auth.userId,
            updated_by: auth.userId,
          }))
        );
      }
      note.unshift(
        input.unicoPacco
          ? `Spedizione ${numeroSpedizione} in un unico pacco.`
          : `Spedizione ${numeroSpedizione} con un pacco per documento.`
      );
      await writeAuditLog({
        entity_type: "spedizioni_gruppi",
        entity_id: gruppoSpedizioneId,
        action: "create",
        actor_id: auth.userId,
        summary: `Creata spedizione ${numeroSpedizione} dal raggruppamento`,
        payload: {
          numero: numeroSpedizione,
          unico_pacco: input.unicoPacco,
          unica_mail: input.unicaMail,
          membri: unici,
        },
      });
    }
  }

  if (input.unicaMail && gruppoSpedizioneId) {
    if (spedizioneEsistente?.mailInviata) {
      note.push("La mail unica di questa spedizione era già partita.");
    } else {
      const email = await emailCliente(ancora);
      const caselle = await listCaselleSpedizioneMailAction();
      const accountId = caselle.success ? caselle.accounts[0]?.id ?? "" : "";
      if (!email || !accountId) {
        note.push(
          "Mail unica non partita: manca l'indirizzo del cliente o una casella mittente."
        );
      } else {
        const numeri = [];
        for (const ref of unici) {
          const doc = await leggiDocumento(ref);
          if (doc) numeri.push(doc.numero);
        }
        const corpo = `Spedizione ${numeroSpedizione} per ${ancoraDoc.destinatario || ancoraDoc.cliente}.\nDocumenti: ${numeri.join(", ")}.`;
        const salvata = await upsertPrenotazioneSpedizioneMailAction({
          entityType: ancora.entityType,
          entityId: ancora.entityId,
          trackingUrl: input.trackingUrl.trim(),
          letteraViaPath: "",
          letteraViaName: "",
          allegati: [],
          allegaTracking: true,
          allegaLettera: false,
          allegaFile: false,
          destinatarioEmail: email,
          oggetto: `Spedizione ${numeroSpedizione}`,
          corpo,
          accountId,
          modo: "salva",
          soloTracking: false,
        });
        if (!salvata.success) note.push(salvata.error);
        else {
          const inviata = await inviaMailSpedizioneAction({
            prenotazioneId: salvata.item.id,
            accountId: salvata.item.accountId || accountId,
            to: email,
            subject: salvata.item.oggetto || `Spedizione ${numeroSpedizione}`,
            bodyText: salvata.item.corpo || corpo,
            produzioneReale: true,
          });
          if (!inviata.success) note.push(inviata.error);
          else {
            await service
              .from("spedizioni_gruppi")
              .update({
                mail_inviata_at: new Date().toISOString(),
                tracking_url: input.trackingUrl.trim(),
                stato: "pronta",
                documento_stato: "approvato",
                updated_by: auth.userId,
              })
              .eq("id", gruppoSpedizioneId);
            note.unshift(`Una sola mail con il tracking è partita a ${email}.`);
          }
        }
      }
    }
  } else if (!input.unicaMail) {
    note.push("Ogni documento tiene la propria mail.");
  }

  return { success: true, avviso: note.filter(Boolean).join(" ") };
}
