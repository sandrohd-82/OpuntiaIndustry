"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { eUtenteInternoHaccp } from "@/lib/produzione/fornitore-accesso";
import { soggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso-server";
import {
  MOTIVO_TRANSIZIONE_NON_DISPONIBILE,
  fornitoreAperturaFoglio,
  normalizzaValoreRisposta,
  puoLeggereFoglio,
  puoRegistrareRisposta,
  statoDopoRipresa,
  transizioneFoglio,
  versioniCheBloccanoCompilazione,
  voceCompilabile,
  vociIncomplete,
  type StatoFoglioIngresso,
  type ValoreRispostaFoglio,
  type VistaFoglio,
} from "@/lib/produzione/foglio-ingresso";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

type Errore = { success: false; error: string };

export type FoglioIngressoRiga = {
  id: string;
  codice: string;
  fornitoreId: string;
  ragioneSociale: string;
  stato: StatoFoglioIngresso;
  openedAt: string;
  incomplete: number;
};

export type RispostaFoglioRiga = {
  id: string;
  voceCodice: string;
  valore: ValoreRispostaFoglio;
  motivazione: string | null;
  confermataAt: string;
  autore: string;
};

export type VersioneApplicabileFoglio = {
  versioneId: string;
  documentoId: string;
  titolo: string;
  numero: number;
  corpo: string;
  confermataDaMe: boolean;
  confermataDaAzienda: boolean;
};

export type FoglioIngressoDettaglio = {
  id: string;
  codice: string;
  fornitoreId: string;
  ragioneSociale: string;
  stato: StatoFoglioIngresso;
  openedAt: string;
  attore: "interno" | "fornitore";
  versioni: VersioneApplicabileFoglio[];
  risposte: RispostaFoglioRiga[];
  incomplete: string[];
};

function messaggioDb(error: { message?: string } | null, fallback: string): string {
  const testo = error?.message ?? "";
  if (testo.includes("presa visione")) {
    return "Prima conferma la presa visione della versione applicabile.";
  }
  if (testo.includes("motivazione")) return "La correzione richiede una motivazione.";
  if (testo.includes("non è compilabile") || testo.includes("Valore") || testo.includes("non valido")) {
    return "Questa voce non accetta il valore inviato.";
  }
  if (testo.includes("altro fornitore")) return "Non puoi accedere a un altro fornitore.";
  if (testo.includes("Transizione non disponibile")) return MOTIVO_TRANSIZIONE_NON_DISPONIBILE;
  if (testo.includes("non consentita")) return "Transizione di stato non consentita.";
  if (testo.includes("non è in compilazione")) return "Il foglio non è in compilazione.";
  if (testo.includes("già registrata")) {
    return "Il personale interno corregge una risposta già registrata dal fornitore.";
  }
  return fallback;
}

async function contesto(vista: VistaFoglio) {
  if (vista === "produzione") {
    const { auth } = await requireAreaAccess("produzione");
    const soggetto = await soggettoAccessoFornitore();
    if (!soggetto || !eUtenteInternoHaccp(soggetto)) {
      return { ok: false as const, error: "Accesso non consentito." };
    }
    return { ok: true as const, auth, soggetto, vista };
  }
  const { auth } = await requireAreaAccess("area-fornitori");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto?.fornitoreCollegatoId) {
    return {
      ok: false as const,
      error:
        "Il tuo utente non è collegato a un fornitore. I fogli riservati restano chiusi.",
    };
  }
  return { ok: true as const, auth, soggetto, vista };
}

function comeStato(valore: string): StatoFoglioIngresso {
  if (
    valore === "aperto" ||
    valore === "in_compilazione" ||
    valore === "in_attesa" ||
    valore === "partito" ||
    valore === "arrivato" ||
    valore === "chiuso"
  ) {
    return valore;
  }
  return "aperto";
}

export async function listFogliIngressoAction(
  vista: VistaFoglio
): Promise<
  | { success: true; fogli: FoglioIngressoRiga[]; fornitori: { id: string; ragioneSociale: string }[] }
  | Errore
> {
  const gate = await contesto(vista);
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  let query = supabase
    .from("haccp_fogli_ingresso")
    .select("id, codice, fornitore_id, stato, opened_at")
    .is("deleted_at", null)
    .order("opened_at", { ascending: false });
  if (vista === "fornitore") {
    query = query.eq("fornitore_id", gate.soggetto.fornitoreCollegatoId);
  }
  const { data, error } = await query;
  if (error) return { success: false, error: "Fogli non disponibili." };
  const ids = (data ?? []).map((row) => String(row.id));
  const fornitoreIds = [...new Set((data ?? []).map((row) => String(row.fornitore_id)))];
  const [risposteRes, fornitoriRes, anagraficheRes] = await Promise.all([
    ids.length
      ? supabase
          .from("haccp_fogli_ingresso_risposte")
          .select("foglio_id, voce_codice")
          .in("foglio_id", ids)
      : Promise.resolve({ data: [], error: null }),
    fornitoreIds.length
      ? supabase.from("fornitori").select("id, ragione_sociale").in("id", fornitoreIds)
      : Promise.resolve({ data: [], error: null }),
    vista === "produzione"
      ? supabase
          .from("fornitori")
          .select("id, ragione_sociale")
          .is("deleted_at", null)
          .order("ragione_sociale", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (risposteRes.error || fornitoriRes.error || anagraficheRes.error) {
    return { success: false, error: "Fogli non disponibili." };
  }
  const nomi = new Map(
    (fornitoriRes.data ?? []).map((row) => [String(row.id), String(row.ragione_sociale)])
  );
  const codici = new Map<string, string[]>();
  for (const row of risposteRes.data ?? []) {
    const lista = codici.get(String(row.foglio_id)) ?? [];
    lista.push(String(row.voce_codice));
    codici.set(String(row.foglio_id), lista);
  }
  return {
    success: true,
    fogli: (data ?? [])
      .filter((row) =>
        puoLeggereFoglio(gate.soggetto, String(row.fornitore_id))
      )
      .map((row) => ({
        id: String(row.id),
        codice: String(row.codice),
        fornitoreId: String(row.fornitore_id),
        ragioneSociale: nomi.get(String(row.fornitore_id)) ?? "Fornitore",
        stato: comeStato(String(row.stato)),
        openedAt: String(row.opened_at),
        incomplete: vociIncomplete(codici.get(String(row.id)) ?? []).length,
      })),
    fornitori:
      vista === "produzione"
        ? (anagraficheRes.data ?? []).map((row) => ({
            id: String(row.id),
            ragioneSociale: String(row.ragione_sociale),
          }))
        : [],
  };
}

export async function apriFoglioIngressoAction(raw: unknown): Promise<
  { success: true; id: string; codice: string } | Errore
> {
  const parsed = z
    .object({
      vista: z.enum(["produzione", "fornitore"]),
      fornitoreId: uuidSchema.nullable().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const gate = await contesto(parsed.data.vista);
  if (!gate.ok) return { success: false, error: gate.error };
  const scelto = fornitoreAperturaFoglio(
    gate.soggetto,
    parsed.data.vista === "fornitore" ? null : (parsed.data.fornitoreId ?? null)
  );
  if (!scelto.ok) return { success: false, error: scelto.motivo };
  const supabase = await createClient();
  const { data: fornitore, error: fornitoreError } = await supabase
    .from("fornitori")
    .select("id")
    .eq("id", scelto.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fornitoreError || !fornitore) return { success: false, error: "Fornitore non trovato." };
  const { data, error } = await supabase
    .from("haccp_fogli_ingresso")
    .insert({
      fornitore_id: scelto.fornitoreId,
      stato: "aperto",
      opened_by: gate.auth.userId,
      created_by: gate.auth.userId,
      updated_by: gate.auth.userId,
    })
    .select("id, codice")
    .single();
  if (error || !data) return { success: false, error: messaggioDb(error, "Foglio non aperto.") };
  await writeAuditLog({
    entity_type: "haccp_fogli_ingresso",
    entity_id: String(data.id),
    action: "apertura",
    actor_id: gate.auth.userId,
    summary: `Aperto il foglio ${data.codice}.`,
    payload: { fornitoreId: scelto.fornitoreId, codice: data.codice },
  });
  return { success: true, id: String(data.id), codice: String(data.codice) };
}

export async function leggiFoglioIngressoAction(
  vista: VistaFoglio,
  foglioId: string
): Promise<{ success: true; foglio: FoglioIngressoDettaglio } | Errore> {
  const parsed = uuidSchema.safeParse(foglioId);
  if (!parsed.success) return { success: false, error: "Foglio non valido." };
  const gate = await contesto(vista);
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data: foglio, error } = await supabase
    .from("haccp_fogli_ingresso")
    .select("id, codice, fornitore_id, stato, opened_at")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !foglio) return { success: false, error: "Foglio non disponibile." };
  if (!puoLeggereFoglio(gate.soggetto, String(foglio.fornitore_id))) {
    return { success: false, error: "Foglio non disponibile." };
  }
  if (
    vista === "fornitore" &&
    String(foglio.fornitore_id) !== gate.soggetto.fornitoreCollegatoId
  ) {
    return { success: false, error: "Foglio non disponibile." };
  }

  const [lineeRes, risposteRes, fornitoreRes] = await Promise.all([
    supabase
      .from("haccp_fogli_ingresso_linee")
      .select("documento_id, versione_id")
      .eq("foglio_id", foglio.id),
    supabase
      .from("haccp_fogli_ingresso_risposte")
      .select("id, voce_codice, valore, motivazione, confermata_at, confermata_by")
      .eq("foglio_id", foglio.id)
      .order("confermata_at", { ascending: false }),
    supabase
      .from("fornitori")
      .select("ragione_sociale")
      .eq("id", foglio.fornitore_id)
      .maybeSingle(),
  ]);
  if (lineeRes.error || risposteRes.error) {
    return { success: false, error: "Foglio non disponibile." };
  }
  const versioneIds = (lineeRes.data ?? []).map((row) => String(row.versione_id));
  const [versioniRes, preseRes] = await Promise.all([
    versioneIds.length
      ? supabase
          .from("haccp_linee_guida_versioni")
          .select("id, titolo, numero, corpo, stato")
          .in("id", versioneIds)
      : Promise.resolve({ data: [], error: null }),
    versioneIds.length
      ? supabase
          .from("haccp_linee_guida_prese_visione")
          .select("versione_id, profile_id")
          .eq("fornitore_id", foglio.fornitore_id)
          .in("versione_id", versioneIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (versioniRes.error || preseRes.error) {
    return { success: false, error: "Linee guida del foglio non disponibili." };
  }
  const autori = [
    ...new Set((risposteRes.data ?? []).map((row) => String(row.confermata_by))),
  ];
  const nomi = new Map<string, string>();
  if (autori.length > 0) {
    const { data: profili } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", autori);
    for (const profilo of profili ?? []) {
      nomi.set(String(profilo.id), String(profilo.full_name || "Utente"));
    }
  }
  const confermateDaMe = new Set(
    (preseRes.data ?? [])
      .filter((row) => String(row.profile_id) === gate.auth.userId)
      .map((row) => String(row.versione_id))
  );
  const confermateAzienda = new Set(
    (preseRes.data ?? []).map((row) => String(row.versione_id))
  );
  const versioni = (lineeRes.data ?? []).map((riga) => {
    const versione = (versioniRes.data ?? []).find(
      (item) => String(item.id) === String(riga.versione_id)
    );
    const versioneId = String(riga.versione_id);
    return {
      versioneId,
      documentoId: String(riga.documento_id),
      titolo: String(versione?.titolo ?? "Linea guida"),
      numero: Number(versione?.numero) || 0,
      corpo: String(versione?.corpo ?? ""),
      confermataDaMe: confermateDaMe.has(versioneId),
      confermataDaAzienda: confermateAzienda.has(versioneId),
    };
  });
  const attore: "interno" | "fornitore" =
    gate.soggetto.fornitoreCollegatoId === String(foglio.fornitore_id)
      ? "fornitore"
      : "interno";
  const risposte: RispostaFoglioRiga[] = [];
  for (const row of risposteRes.data ?? []) {
    const codice = String(row.voce_codice);
    if (!voceCompilabile(codice)) continue;
    const valore = row.valore as ValoreRispostaFoglio;
    if (!valore || typeof valore !== "object" || !("tipo" in valore)) continue;
    risposte.push({
      id: String(row.id),
      voceCodice: codice,
      valore,
      motivazione: row.motivazione ? String(row.motivazione) : null,
      confermataAt: String(row.confermata_at),
      autore: nomi.get(String(row.confermata_by)) ?? "Utente",
    });
  }
  const correnti = new Set<string>();
  for (const risposta of risposte) {
    if (!correnti.has(risposta.voceCodice)) correnti.add(risposta.voceCodice);
  }
  return {
    success: true,
    foglio: {
      id: String(foglio.id),
      codice: String(foglio.codice),
      fornitoreId: String(foglio.fornitore_id),
      ragioneSociale: String(fornitoreRes.data?.ragione_sociale ?? "Fornitore"),
      stato: comeStato(String(foglio.stato)),
      openedAt: String(foglio.opened_at),
      attore,
      versioni,
      risposte,
      incomplete: vociIncomplete([...correnti]),
    },
  };
}

export async function salvaRispostaFoglioAction(raw: unknown): Promise<
  { success: true } | Errore
> {
  const parsed = z
    .object({
      foglioId: uuidSchema,
      voceCodice: z.string().trim().min(1).max(8),
      valore: z.unknown(),
      motivazione: z.string().trim().max(500).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Risposta non valida." };
  const produzione = await soggettoAccessoFornitore();
  if (!produzione) return { success: false, error: "Accesso richiesto." };
  const accesso = produzione.aree.includes("area-fornitori")
    ? await requireAreaAccess("area-fornitori")
    : (eUtenteInternoHaccp(produzione)
      ? await requireAreaAccess("produzione")
      : null);
  if (!accesso) return { success: false, error: "Accesso richiesto." };
  const auth = accesso.auth;

  const supabase = await createClient();
  const { data: foglio, error: foglioError } = await supabase
    .from("haccp_fogli_ingresso")
    .select("id, fornitore_id, stato")
    .eq("id", parsed.data.foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (foglioError || !foglio) return { success: false, error: "Foglio non disponibile." };
  if (!puoLeggereFoglio(produzione, String(foglio.fornitore_id))) {
    return { success: false, error: "Foglio non disponibile." };
  }
  const attore: "interno" | "fornitore" =
    produzione.fornitoreCollegatoId === String(foglio.fornitore_id) ? "fornitore" : "interno";
  const normalizzato = normalizzaValoreRisposta(parsed.data.voceCodice, parsed.data.valore);
  if (!normalizzato.ok) return { success: false, error: normalizzato.motivo };
  const { data: precedenti } = await supabase
    .from("haccp_fogli_ingresso_risposte")
    .select("id")
    .eq("foglio_id", foglio.id)
    .eq("voce_codice", parsed.data.voceCodice)
    .limit(1);
  const { data: linee } = await supabase
    .from("haccp_fogli_ingresso_linee")
    .select("versione_id")
    .eq("foglio_id", foglio.id);
  const { data: prese } = await supabase
    .from("haccp_linee_guida_prese_visione")
    .select("versione_id")
    .eq("fornitore_id", foglio.fornitore_id)
    .eq("profile_id", auth.userId);
  const blocco =
    attore === "fornitore"
      ? versioniCheBloccanoCompilazione(
          (linee ?? []).map((row) => String(row.versione_id)),
          (prese ?? []).map((row) => String(row.versione_id))
        )
      : [];
  const decisione = puoRegistrareRisposta({
    codice: parsed.data.voceCodice,
    attore,
    stato: comeStato(String(foglio.stato)),
    esisteRisposta: (precedenti ?? []).length > 0,
    motivazione: parsed.data.motivazione ?? "",
    presaVisioneCompleta: blocco.length === 0,
  });
  if (!decisione.ok) return { success: false, error: decisione.motivo };

  const { error } = await supabase.from("haccp_fogli_ingresso_risposte").insert({
    foglio_id: foglio.id,
    voce_codice: parsed.data.voceCodice,
    valore: normalizzato.valore,
    motivazione: parsed.data.motivazione?.trim() || null,
    confermata_by: auth.userId,
    created_by: auth.userId,
  });
  if (error) return { success: false, error: messaggioDb(error, "Risposta non salvata.") };

  if (
    normalizzato.valore.tipo === "contatto" &&
    normalizzato.valore.esito === "in_attesa"
  ) {
    const passaggio = transizioneFoglio(
      comeStato(String(foglio.stato)) === "aperto" ? "in_compilazione" : comeStato(String(foglio.stato)),
      "in_attesa",
      attore
    );
    if (passaggio.ok) {
      await supabase
        .from("haccp_fogli_ingresso")
        .update({ stato: "in_attesa", updated_by: auth.userId })
        .eq("id", foglio.id);
    }
  }

  await writeAuditLog({
    entity_type: "haccp_fogli_ingresso_risposte",
    entity_id: String(foglio.id),
    action: (precedenti ?? []).length > 0 ? "correzione" : "risposta",
    actor_id: auth.userId,
    summary: `Risposta ${parsed.data.voceCodice} sul foglio.`,
    payload: {
      voce: parsed.data.voceCodice,
      correzione: (precedenti ?? []).length > 0,
    },
  });
  return { success: true };
}

async function cambiaStato(
  foglioId: string,
  destinazione: "in_attesa" | "ripresa"
): Promise<{ success: true } | Errore> {
  const parsed = uuidSchema.safeParse(foglioId);
  if (!parsed.success) return { success: false, error: "Foglio non valido." };
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto) return { success: false, error: "Accesso richiesto." };
  const accesso = soggetto.aree.includes("area-fornitori")
    ? await requireAreaAccess("area-fornitori")
    : (eUtenteInternoHaccp(soggetto)
      ? await requireAreaAccess("produzione")
      : null);
  if (!accesso) return { success: false, error: "Accesso richiesto." };
  const auth = accesso.auth;
  const supabase = await createClient();
  const { data: foglio } = await supabase
    .from("haccp_fogli_ingresso")
    .select("id, fornitore_id, stato")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!foglio || !puoLeggereFoglio(soggetto, String(foglio.fornitore_id))) {
    return { success: false, error: "Foglio non disponibile." };
  }
  const attore: "interno" | "fornitore" =
    soggetto.fornitoreCollegatoId === String(foglio.fornitore_id) ? "fornitore" : "interno";
  const attuale = comeStato(String(foglio.stato));
  let prossimo: StatoFoglioIngresso = "in_attesa";
  if (destinazione === "ripresa") {
    const { count, error: countError } = await supabase
      .from("haccp_fogli_ingresso_risposte")
      .select("id", { count: "exact", head: true })
      .eq("foglio_id", foglio.id);
    if (countError) return { success: false, error: "Stato non aggiornato." };
    prossimo = statoDopoRipresa((count ?? 0) > 0);
  }
  const passaggio = transizioneFoglio(attuale, prossimo, attore);
  if (!passaggio.ok) return { success: false, error: passaggio.motivo };
  const { error } = await supabase
    .from("haccp_fogli_ingresso")
    .update({ stato: prossimo, updated_by: auth.userId })
    .eq("id", foglio.id);
  if (error) return { success: false, error: messaggioDb(error, "Stato non aggiornato.") };
  await writeAuditLog({
    entity_type: "haccp_fogli_ingresso",
    entity_id: String(foglio.id),
    action: destinazione,
    actor_id: auth.userId,
    summary: `Foglio passato a ${prossimo}.`,
    payload: { da: attuale, a: prossimo },
  });
  return { success: true };
}

export async function sospendiFoglioIngressoAction(foglioId: string) {
  return cambiaStato(foglioId, "in_attesa");
}

export async function riprendiFoglioIngressoAction(foglioId: string) {
  return cambiaStato(foglioId, "ripresa");
}

export async function registraArrivoFoglioAction(): Promise<Errore> {
  await requireAreaAccess("produzione");
  return { success: false, error: MOTIVO_TRANSIZIONE_NON_DISPONIBILE };
}

export async function chiudiFoglioIngressoAction(): Promise<Errore> {
  await requireAreaAccess("produzione");
  return { success: false, error: MOTIVO_TRANSIZIONE_NON_DISPONIBILE };
}
