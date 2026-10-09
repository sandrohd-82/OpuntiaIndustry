"use server";

import { randomUUID, timingSafeEqual } from "crypto";
import { revalidatePath } from "next/cache";
import { getAuthContext, getAuthUser } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { EMAIL_OTP_MAX_ATTEMPTS, EMAIL_OTP_TTL_MINUTES } from "@/lib/auth/constants";
import { generateEmailOtp, hashOtp, otpExpiresAt } from "@/lib/auth/two-factor";
import { sendOtpEmail } from "@/lib/email/smtp";
import {
  caveauConfigurato,
  cifraPasswordCaveau,
  decifraPasswordCaveau,
} from "@/lib/amministrazione/caveau-siti-crypto";
import {
  caveauAcquistoSchema,
  caveauAcquistoUpdateSchema,
  messaggioValidazioneCaveau,
  normalizzaInputAcquisto,
  caveauEliminaSchema,
  caveauRivelaSchema,
  CAVEAU_DOCUMENTO_BUCKET,
  CAVEAU_DOCUMENTO_MAX_BYTES,
  CAVEAU_UNITA_BASE,
  caveauSitoSchema,
  caveauSitoUpdateSchema,
  caveauUnitaSchema,
  chiaveUrlCaveau,
  mimeDocumentoCaveau,
  normalizzaUnita,
  prezzoAcquistoOrNull,
  urlCaveauAccettabile,
  registratoAtOrNull,
  type CaveauAcquistoRiga,
  type CaveauSitoRiga,
} from "@/lib/amministrazione/caveau-siti";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { createServiceClient } from "@/lib/supabase/server";

const PATH = "/app/amministrazione/caveau-siti";
const ENTITY = "caveau_siti_aziendali";
const ENTITY_ACQUISTO = "caveau_siti_acquisti";
const ENTITY_DOCUMENTO = "caveau_siti_acquisto_documenti";
const ENTITY_UNITA = "caveau_unita_misura";
const FINESTRA_MS = 15 * 60 * 1000;
const PAUSA_INVIO_MS = 30 * 1000;

type Gate =
  | { ok: true; actorId: string }
  | { ok: false; error: string };

async function gate(): Promise<Gate> {
  const auth = await getAuthContext();
  if (
    !auth?.isSecondFactorVerified ||
    auth.impersonating ||
    !isSuperadminProfile(auth.actorProfile)
  ) {
    return { ok: false, error: "Accesso negato." };
  }
  return { ok: true, actorId: auth.actorUserId };
}

function configError(): string {
  return "Il caveau non è configurato sul server. Manca CREDENTIALS_VAULT_KEY.";
}

function hashUguale(inserito: string, atteso: string): boolean {
  const a = Buffer.from(hashOtp(inserito), "hex");
  const b = Buffer.from(atteso, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function audita(input: {
  entityType?: string;
  entityId: string;
  action: string;
  actorId: string;
  summary: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("audit_log").insert({
    entity_type: input.entityType ?? ENTITY,
    entity_id: input.entityId,
    action: input.action,
    actor_id: input.actorId,
    summary: input.summary,
    payload: input.payload,
  });
  if (error) console.error("[caveau audit]", error.message);
}

async function contaInviiCodice(actorId: string): Promise<number | null> {
  const since = new Date(Date.now() - FINESTRA_MS).toISOString();
  const db = createServiceClient();
  const { count, error } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", ENTITY)
    .eq("action", "codice_inviato")
    .eq("actor_id", actorId)
    .gte("created_at", since);
  if (error) return null;
  return count ?? 0;
}

export async function listCaveauSitiAction(): Promise<
  { ok: true; righe: CaveauSitoRiga[]; unitaExtra: string[] } | { ok: false; error: string }
> {
  const g = await gate();
  if (!g.ok) return g;
  if (!caveauConfigurato()) return { ok: false, error: configError() };

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .select("id, nome, url, mail, password_cifrata, versione, updated_at")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { ok: false, error: "Impossibile leggere l'elenco dei siti." };

  const siti = (data ?? []).map((row) => ({
    id: String(row.id),
    nome: String(row.nome ?? ""),
    url: String(row.url ?? ""),
    mail: String(row.mail ?? ""),
    haPassword: String(row.password_cifrata ?? "").trim().length > 0,
    versione: Number(row.versione ?? 1),
    updatedAt: String(row.updated_at ?? ""),
  }));
  const perSito = new Map<string, CaveauAcquistoRiga[]>();
  if (siti.length > 0) {
    const { data: acquisti, error: acqErr } = await db
      .from("caveau_siti_acquisti")
      .select("id, sito_id, url, titolo, descrizione, prezzo, unita_misura, registrato_at, versione, created_at")
      .in(
        "sito_id",
        siti.map((sito) => sito.id)
      )
      .is("deleted_at", null)
      .order("registrato_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (acqErr) return { ok: false, error: "Impossibile leggere gli acquisti." };
    for (const row of acquisti ?? []) {
      const sitoId = String(row.sito_id);
      const lista = perSito.get(sitoId) ?? [];
      const prezzoN = row.prezzo == null || row.prezzo === "" ? null : Number(row.prezzo);
      lista.push({
        id: String(row.id),
        sitoId,
        url: String(row.url ?? ""),
        titolo: String(row.titolo ?? ""),
        descrizione: String(row.descrizione ?? ""),
        prezzo: prezzoN != null && Number.isFinite(prezzoN) ? prezzoN : null,
        unitaMisura: String(row.unita_misura ?? ""),
        registratoAt: row.registrato_at ? String(row.registrato_at) : null,
        versione: Number(row.versione ?? 1),
        documenti: [],
      });
      perSito.set(sitoId, lista);
    }
    const acquistoIds = [...perSito.values()].flat().map((voce) => voce.id);
    if (acquistoIds.length > 0) {
      const { data: documenti, error: docErr } = await db
        .from("caveau_siti_acquisto_documenti")
        .select("id, acquisto_id, nome, file_name, file_size")
        .in("acquisto_id", acquistoIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (docErr) return { ok: false, error: "Impossibile leggere i documenti degli acquisti." };
      const perAcquisto = new Map<string, CaveauSitoRiga["acquisti"][number]["documenti"]>();
      for (const row of documenti ?? []) {
        const acquistoId = String(row.acquisto_id);
        const lista = perAcquisto.get(acquistoId) ?? [];
        lista.push({
          id: String(row.id),
          nome: String(row.nome ?? ""),
          fileName: String(row.file_name ?? ""),
          fileSize: Number(row.file_size ?? 0),
        });
        perAcquisto.set(acquistoId, lista);
      }
      for (const lista of perSito.values()) {
        for (const voce of lista) {
          voce.documenti = perAcquisto.get(voce.id) ?? [];
        }
      }
    }
  }
  const righe: CaveauSitoRiga[] = siti.map((sito) => ({
    ...sito,
    acquisti: perSito.get(sito.id) ?? [],
  }));
  const { data: unita, error: unitaErr } = await db
    .from("caveau_unita_misura")
    .select("sigla")
    .is("deleted_at", null)
    .order("sigla", { ascending: true });
  if (unitaErr) return { ok: false, error: "Impossibile leggere le unità di misura." };
  const unitaExtra = (unita ?? []).map((row) => String(row.sigla ?? "")).filter(Boolean);
  return { ok: true, righe, unitaExtra };
}

export async function creaCaveauSitoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauSitoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const url = urlCaveauAccettabile(parsed.data.url);
  if (!url.ok) return url;
  const gia = await urlGiaPresente({ chiave: url.chiave });
  if (!gia.ok) return gia;

  const password = parsed.data.password.trim();
  let cifrata = "";
  if (password) {
    if (!caveauConfigurato()) return { ok: false, error: configError() };
    try {
      cifrata = cifraPasswordCaveau(password);
    } catch {
      return { ok: false, error: configError() };
    }
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .insert({
      nome: parsed.data.nome,
      url: url.url,
      mail: parsed.data.mail,
      password_cifrata: cifrata,
      created_by: g.actorId,
      updated_by: g.actorId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Registrazione del sito non riuscita." };

  await audita({
    entityId: String(data.id),
    action: "create",
    actorId: g.actorId,
    summary: `Sito registrato: ${parsed.data.nome}`,
    payload: {
      nome: parsed.data.nome,
      url: url.url,
      mail: parsed.data.mail,
      password_registrata: Boolean(password),
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function aggiornaCaveauSitoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauSitoUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const url = urlCaveauAccettabile(parsed.data.url);
  if (!url.ok) return url;
  const gia = await urlGiaPresente({
    chiave: url.chiave,
    escludiSitoId: parsed.data.id,
  });
  if (!gia.ok) return gia;

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_aziendali")
    .select("id, versione, password_cifrata")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Scheda non trovata." };

  const nuova = parsed.data.password?.trim() ?? "";
  let cifrata = String(current.password_cifrata ?? "");
  if (nuova) {
    if (!caveauConfigurato()) return { ok: false, error: configError() };
    try {
      cifrata = cifraPasswordCaveau(nuova);
    } catch {
      return { ok: false, error: configError() };
    }
  }

  const { error } = await db
    .from("caveau_siti_aziendali")
    .update({
      nome: parsed.data.nome,
      url: url.url,
      mail: parsed.data.mail,
      password_cifrata: cifrata,
      versione: Number(current.versione ?? 1) + 1,
      updated_by: g.actorId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Aggiornamento non riuscito." };

  await audita({
    entityId: parsed.data.id,
    action: "update",
    actorId: g.actorId,
    summary: `Sito aggiornato: ${parsed.data.nome}`,
    payload: {
      nome: parsed.data.nome,
      url: url.url,
      mail: parsed.data.mail,
      password_sostituita: Boolean(nuova),
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

async function archiviaDocumentiAcquisti(
  db: ReturnType<typeof createServiceClient>,
  actorId: string,
  now: string,
  acquistoIds: string[]
): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  if (acquistoIds.length === 0) return { ok: true, n: 0 };
  const { data, error: readErr } = await db
    .from("caveau_siti_acquisto_documenti")
    .select("id")
    .in("acquisto_id", acquistoIds)
    .is("deleted_at", null);
  if (readErr) return { ok: false, error: "Impossibile leggere i documenti dell'acquisto." };
  const ids = (data ?? []).map((row) => String(row.id));
  if (ids.length === 0) return { ok: true, n: 0 };
  const { error } = await db
    .from("caveau_siti_acquisto_documenti")
    .update({
      deleted_at: now,
      deleted_by: actorId,
      updated_by: actorId,
      documento_stato: "archiviato",
    })
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Documenti non archiviati." };
  return { ok: true, n: ids.length };
}

export async function eliminaCaveauSitoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauEliminaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conferma non valida." };

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_aziendali")
    .select("id, nome, versione")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Scheda non trovata." };

  const nome = String(current.nome ?? "");
  if (parsed.data.conferma !== fraseConfermaSoftDelete(nome)) {
    return { ok: false, error: `Per eliminare scrivi: ${fraseConfermaSoftDelete(nome)}` };
  }

  const now = new Date().toISOString();
  const { data: acquistiVivi, error: lettiErr } = await db
    .from("caveau_siti_acquisti")
    .select("id")
    .eq("sito_id", parsed.data.id)
    .is("deleted_at", null);
  if (lettiErr) return { ok: false, error: "Impossibile leggere gli acquisti del sito." };
  const acquistoIds = (acquistiVivi ?? []).map((row) => String(row.id));
  const documenti = await archiviaDocumentiAcquisti(db, g.actorId, now, acquistoIds);
  if (!documenti.ok) return documenti;

  const { error } = await db
    .from("caveau_siti_aziendali")
    .update({
      deleted_at: now,
      deleted_by: g.actorId,
      updated_by: g.actorId,
      versione: Number(current.versione ?? 1) + 1,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Eliminazione non riuscita." };

  const { error: acqErr } = await db
    .from("caveau_siti_acquisti")
    .update({
      deleted_at: now,
      deleted_by: g.actorId,
      updated_by: g.actorId,
    })
    .eq("sito_id", parsed.data.id)
    .is("deleted_at", null);
  if (acqErr) return { ok: false, error: "Sito archiviato, acquisti non chiusi." };

  await audita({
    entityId: parsed.data.id,
    action: "soft_delete",
    actorId: g.actorId,
    summary: `Sito rimosso dall'elenco: ${nome}`,
    payload: {
      nome,
      acquisti_archiviati: acquistoIds.length,
      documenti_archiviati: documenti.n,
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function rivelaPasswordCaveauAction(
  input: unknown
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  if (!caveauConfigurato()) return { ok: false, error: configError() };

  const parsed = caveauRivelaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const db = createServiceClient();
  const { data: sito, error: sitoErr } = await db
    .from("caveau_siti_aziendali")
    .select("id, password_cifrata")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (sitoErr || !sito) return { ok: false, error: "Scheda non trovata." };
  if (!String(sito.password_cifrata ?? "").trim()) {
    return { ok: false, error: "Password non ancora registrata." };
  }

  const { data: sfida, error: sfidaErr } = await db
    .from("caveau_codici_email")
    .select("codice_hash, expires_at, attempts")
    .eq("actor_id", g.actorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (sfidaErr) return { ok: false, error: "Controllo del codice non disponibile. Riprova." };
  if (!sfida?.codice_hash) {
    return { ok: false, error: "Prima chiedi il codice: arriva per email." };
  }
  if (Number(sfida.attempts ?? 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Troppi tentativi. Chiedi un nuovo codice." };
  }
  const scadenza = new Date(String(sfida.expires_at ?? ""));
  if (Number.isNaN(scadenza.getTime()) || scadenza.getTime() < Date.now()) {
    return { ok: false, error: "Codice scaduto. Chiedine uno nuovo per email." };
  }
  if (!hashUguale(parsed.data.codice, String(sfida.codice_hash))) {
    await db
      .from("caveau_codici_email")
      .update({
        attempts: Number(sfida.attempts ?? 0) + 1,
        updated_by: g.actorId,
      })
      .eq("actor_id", g.actorId)
      .is("deleted_at", null);
    await audita({
      entityId: parsed.data.id,
      action: "reveal_denied",
      actorId: g.actorId,
      summary: "Codice email rifiutato",
      payload: { esito: "codice_errato" },
    });
    return { ok: false, error: "Codice non valido." };
  }
  await db
    .from("caveau_codici_email")
    .update({
      codice_hash: "",
      expires_at: new Date(0).toISOString(),
      updated_by: g.actorId,
    })
    .eq("actor_id", g.actorId)
    .is("deleted_at", null);

  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .select("id, nome, password_cifrata")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Scheda non trovata." };

  let password: string;
  try {
    password = decifraPasswordCaveau(String(data.password_cifrata ?? ""));
  } catch {
    return { ok: false, error: "Impossibile leggere la password. Controlla la chiave del caveau." };
  }

  await audita({
    entityId: parsed.data.id,
    action: "reveal",
    actorId: g.actorId,
    summary: `Password visualizzata: ${String(data.nome ?? "")}`,
    payload: { nome: String(data.nome ?? "") },
  });
  return { ok: true, password };
}

export async function inviaCodiceCaveauAction(): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const g = await gate();
  if (!g.ok) return g;
  const user = await getAuthUser();
  const email = user?.email?.trim() ?? "";
  if (!email.includes("@")) {
    return { ok: false, error: "Email del Super Admin non disponibile." };
  }

  const inviati = await contaInviiCodice(g.actorId);
  if (inviati === null) {
    return { ok: false, error: "Controllo degli invii non disponibile. Riprova." };
  }
  if (inviati >= EMAIL_OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Troppi codici inviati. Riprova tra qualche minuto." };
  }

  const db = createServiceClient();
  const { data: attuale } = await db
    .from("caveau_codici_email")
    .select("updated_at, codice_hash")
    .eq("actor_id", g.actorId)
    .is("deleted_at", null)
    .maybeSingle();
  const ultimo = attuale?.updated_at ? new Date(String(attuale.updated_at)).getTime() : 0;
  if (attuale?.codice_hash && ultimo && Date.now() - ultimo < PAUSA_INVIO_MS) {
    return { ok: false, error: "Codice appena inviato. Controlla la posta." };
  }

  const codice = generateEmailOtp();
  const scadenza = otpExpiresAt().toISOString();
  const { error } = await db.from("caveau_codici_email").upsert(
    {
      actor_id: g.actorId,
      codice_hash: hashOtp(codice),
      expires_at: scadenza,
      attempts: 0,
      created_by: g.actorId,
      updated_by: g.actorId,
      deleted_at: null,
      deleted_by: null,
    },
    { onConflict: "actor_id" }
  );
  if (error) return { ok: false, error: "Impossibile preparare il codice." };

  try {
    await sendOtpEmail(email, codice, "caveau");
  } catch (e) {
    console.error("[caveau email]", e instanceof Error ? e.message : "invio");
    await db
      .from("caveau_codici_email")
      .update({
        codice_hash: "",
        expires_at: new Date(0).toISOString(),
        updated_by: g.actorId,
      })
      .eq("actor_id", g.actorId);
    return {
      ok: false,
      error: "Impossibile inviare l'email con il codice. Controlla la posta più tardi.",
    };
  }

  await audita({
    entityId: g.actorId,
    action: "codice_inviato",
    actorId: g.actorId,
    summary: "Codice per la password inviato al Super Admin",
    payload: { minuti: EMAIL_OTP_TTL_MINUTES },
  });
  return { ok: true, email };
}

async function unitaNota(sigla: string): Promise<boolean> {
  if (!sigla) return true;
  if ((CAVEAU_UNITA_BASE as readonly string[]).includes(sigla)) return true;
  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_unita_misura")
    .select("id")
    .is("deleted_at", null)
    .ilike("sigla", sigla)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

function campiAcquisto(input: {
  url: string;
  titolo: string;
  descrizione: string;
  prezzo: string;
  unitaMisura: string;
  registratoAt: string;
}):
  | {
      ok: true;
      url: string;
      titolo: string;
      descrizione: string;
      prezzo: number | null;
      unitaMisura: string;
      registratoAt: string | null;
    }
  | { ok: false; error: string } {
  const prezzo = prezzoAcquistoOrNull(input.prezzo);
  if (!prezzo.ok) return prezzo;
  const unita = normalizzaUnita(input.unitaMisura);
  if (!unita.ok) return unita;
  const quando = registratoAtOrNull(input.registratoAt);
  if (!quando.ok) return quando;
  return {
    ok: true,
    url: input.url,
    titolo: input.titolo,
    descrizione: input.descrizione,
    prezzo: prezzo.value,
    unitaMisura: unita.value,
    registratoAt: quando.value,
  };
}

async function urlGiaPresente(opts: {
  chiave: string;
  escludiSitoId?: string;
  escludiAcquistoId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createServiceClient();
  const [{ data: siti, error: sitiErr }, { data: acquisti, error: acqErr }] =
    await Promise.all([
      db
        .from("caveau_siti_aziendali")
        .select("id, nome, url")
        .is("deleted_at", null),
      db
        .from("caveau_siti_acquisti")
        .select("id, titolo, url, sito_id")
        .is("deleted_at", null),
    ]);
  if (sitiErr || acqErr) {
    return { ok: false, error: "Impossibile verificare se l'URL è già presente." };
  }
  const nomeSito = new Map<string, string>();
  for (const row of siti ?? []) {
    const id = String(row.id ?? "");
    nomeSito.set(id, String(row.nome ?? "").trim() || "senza nome");
    if (opts.escludiSitoId && id === opts.escludiSitoId) continue;
    if (chiaveUrlCaveau(String(row.url ?? "")) !== opts.chiave) continue;
    return {
      ok: false,
      error: `Questo URL è già registrato sul sito «${nomeSito.get(id)}».`,
    };
  }
  for (const row of acquisti ?? []) {
    const id = String(row.id ?? "");
    if (opts.escludiAcquistoId && id === opts.escludiAcquistoId) continue;
    if (chiaveUrlCaveau(String(row.url ?? "")) !== opts.chiave) continue;
    const titolo = String(row.titolo ?? "").trim() || "senza titolo";
    const sito = nomeSito.get(String(row.sito_id ?? "")) ?? "un sito";
    return {
      ok: false,
      error: `Questo URL è già presente nell'acquisto «${titolo}» del sito «${sito}».`,
    };
  }
  return { ok: true };
}

async function sitoVivo(sitoId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .select("id")
    .eq("id", sitoId)
    .is("deleted_at", null)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function creaCaveauAcquistoAction(
  input: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauAcquistoSchema.safeParse(normalizzaInputAcquisto(input));
  if (!parsed.success) {
    return { ok: false, error: messaggioValidazioneCaveau(parsed.error) };
  }
  const campi = campiAcquisto(parsed.data);
  if (!campi.ok) return campi;
  const url = urlCaveauAccettabile(campi.url);
  if (!url.ok) return url;
  const gia = await urlGiaPresente({ chiave: url.chiave });
  if (!gia.ok) return gia;
  if (!(await unitaNota(campi.unitaMisura))) {
    return { ok: false, error: "Unità non registrata. Aggiungila da Altro." };
  }
  if (!(await sitoVivo(parsed.data.sitoId))) {
    return { ok: false, error: "Sito non trovato." };
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_acquisti")
    .insert({
      sito_id: parsed.data.sitoId,
      url: url.url,
      titolo: campi.titolo,
      descrizione: campi.descrizione,
      prezzo: campi.prezzo,
      unita_misura: campi.unitaMisura,
      registrato_at: campi.registratoAt,
      created_by: g.actorId,
      updated_by: g.actorId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Registrazione dell'acquisto non riuscita." };

  await audita({
    entityType: ENTITY_ACQUISTO,
    entityId: String(data.id),
    action: "create",
    actorId: g.actorId,
    summary: `Acquisto registrato: ${campi.titolo}`,
    payload: {
      sito_id: parsed.data.sitoId,
      url: url.url,
      titolo: campi.titolo,
      prezzo: campi.prezzo,
      unita_misura: campi.unitaMisura,
      registrato_at: campi.registratoAt,
    },
  });
  revalidatePath(PATH);
  return { ok: true, id: String(data.id) };
}

export async function aggiornaCaveauAcquistoAction(
  input: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauAcquistoUpdateSchema.safeParse(normalizzaInputAcquisto(input));
  if (!parsed.success) {
    return { ok: false, error: messaggioValidazioneCaveau(parsed.error) };
  }
  const campi = campiAcquisto(parsed.data);
  if (!campi.ok) return campi;
  const url = urlCaveauAccettabile(campi.url);
  if (!url.ok) return url;
  const gia = await urlGiaPresente({
    chiave: url.chiave,
    escludiAcquistoId: parsed.data.id,
  });
  if (!gia.ok) return gia;
  if (!(await unitaNota(campi.unitaMisura))) {
    return { ok: false, error: "Unità non registrata. Aggiungila da Altro." };
  }

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_acquisti")
    .select("id, versione, sito_id")
    .eq("id", parsed.data.id)
    .eq("sito_id", parsed.data.sitoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Acquisto non trovato." };

  const { error } = await db
    .from("caveau_siti_acquisti")
    .update({
      url: url.url,
      titolo: campi.titolo,
      descrizione: campi.descrizione,
      prezzo: campi.prezzo,
      unita_misura: campi.unitaMisura,
      registrato_at: campi.registratoAt,
      versione: Number(current.versione ?? 1) + 1,
      updated_by: g.actorId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Aggiornamento dell'acquisto non riuscito." };

  await audita({
    entityType: ENTITY_ACQUISTO,
    entityId: parsed.data.id,
    action: "update",
    actorId: g.actorId,
    summary: `Acquisto aggiornato: ${campi.titolo}`,
    payload: {
      sito_id: parsed.data.sitoId,
      url: url.url,
      titolo: campi.titolo,
      prezzo: campi.prezzo,
      unita_misura: campi.unitaMisura,
      registrato_at: campi.registratoAt,
    },
  });
  revalidatePath(PATH);
  return { ok: true, id: parsed.data.id };
}

export async function creaCaveauUnitaAction(
  input: unknown
): Promise<{ ok: true; sigla: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const parsed = caveauUnitaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Sigla non valida." };
  }
  const unita = normalizzaUnita(parsed.data.sigla);
  if (!unita.ok) return unita;
  if (!unita.value) return { ok: false, error: "Indica la sigla." };
  if ((CAVEAU_UNITA_BASE as readonly string[]).includes(unita.value) || (await unitaNota(unita.value))) {
    return { ok: false, error: "Questa unità è già in elenco." };
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_unita_misura")
    .insert({
      sigla: unita.value,
      created_by: g.actorId,
      updated_by: g.actorId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Registrazione dell'unità non riuscita." };

  await audita({
    entityType: ENTITY_UNITA,
    entityId: String(data.id),
    action: "create",
    actorId: g.actorId,
    summary: `Unità di misura registrata: ${unita.value}`,
    payload: { sigla: unita.value },
  });
  revalidatePath(PATH);
  return { ok: true, sigla: unita.value };
}

export async function eliminaCaveauAcquistoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauEliminaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conferma non valida." };

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_acquisti")
    .select("id, titolo, versione")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Acquisto non trovato." };

  const titolo = String(current.titolo ?? "");
  if (parsed.data.conferma !== fraseConfermaSoftDelete(titolo)) {
    return { ok: false, error: `Per eliminare scrivi: ${fraseConfermaSoftDelete(titolo)}` };
  }

  const now = new Date().toISOString();
  const documenti = await archiviaDocumentiAcquisti(db, g.actorId, now, [parsed.data.id]);
  if (!documenti.ok) return documenti;
  const { error } = await db
    .from("caveau_siti_acquisti")
    .update({
      deleted_at: now,
      deleted_by: g.actorId,
      updated_by: g.actorId,
      versione: Number(current.versione ?? 1) + 1,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Eliminazione dell'acquisto non riuscita." };

  await audita({
    entityType: ENTITY_ACQUISTO,
    entityId: parsed.data.id,
    action: "soft_delete",
    actorId: g.actorId,
    summary: `Acquisto rimosso: ${titolo}`,
    payload: { titolo, documenti_archiviati: documenti.n },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function caricaCaveauAcquistoDocumentoAction(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const acquistoId = String(formData.get("acquistoId") ?? "");
  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const file = formData.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(acquistoId)) {
    return { ok: false, error: "Acquisto non valido." };
  }
  if (!nome || nome.length > 120) {
    return { ok: false, error: "Indica il nome del documento, al massimo 120 caratteri." };
  }
  if (!(file instanceof Blob) || file.size <= 0) {
    return { ok: false, error: "Scegli un file per il documento." };
  }
  if (file.size > CAVEAU_DOCUMENTO_MAX_BYTES) {
    return { ok: false, error: "Il file supera 15 MB." };
  }
  const nomeOriginale = file instanceof File && file.name ? file.name : "documento";
  const mime = mimeDocumentoCaveau(nomeOriginale, file.type);
  if (!mime) {
    return {
      ok: false,
      error: "Formato non ammesso. Usa PDF, immagine, Word o Excel.",
    };
  }
  if (!(await sitoAcquistoVivo(acquistoId))) {
    return { ok: false, error: "Acquisto non trovato." };
  }
  const ext = nomeOriginale.split(".").pop()?.replace(/[^\w]+/g, "").slice(0, 8) || "bin";
  const fileName =
    nomeOriginale.replace(/[^\w.\- ()àèéìòùÀÈÉÌÒÙ]+/g, "_").slice(0, 120) || "documento";
  const path = `acquisti/${acquistoId}/${randomUUID()}.${ext}`;
  const db = createServiceClient();
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "Il file non si può leggere. Riprova." };
  }
  const { error: upErr } = await db.storage.from(CAVEAU_DOCUMENTO_BUCKET).upload(
    path,
    new Blob([bytes], { type: mime }),
    { contentType: mime, upsert: false }
  );
  if (upErr) {
    console.error("[caveau documento]", upErr.message);
    return {
      ok: false,
      error: "Caricamento del file non riuscito. Usa PDF, immagine, Word o Excel, fino a 15 MB.",
    };
  }
  const { data, error } = await db
    .from("caveau_siti_acquisto_documenti")
    .insert({
      acquisto_id: acquistoId,
      nome,
      storage_path: path,
      file_name: fileName,
      mime,
      file_size: file.size,
      documento_stato: "registrato",
      created_by: g.actorId,
      updated_by: g.actorId,
    })
    .select("id")
    .single();
  if (error || !data) {
    await db.storage.from(CAVEAU_DOCUMENTO_BUCKET).remove([path]);
    return { ok: false, error: "Il file è stato caricato ma non registrato. Riprova." };
  }
  await audita({
    entityType: ENTITY_DOCUMENTO,
    entityId: String(data.id),
    action: "create",
    actorId: g.actorId,
    summary: `Documento acquisto registrato: ${nome}`,
    payload: {
      acquisto_id: acquistoId,
      nome,
      file_name: fileName,
      mime,
      file_size: file.size,
    },
  });
  revalidatePath(PATH);
  return { ok: true, id: String(data.id) };
}

async function sitoAcquistoVivo(acquistoId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_acquisti")
    .select("id")
    .eq("id", acquistoId)
    .is("deleted_at", null)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function apriCaveauAcquistoDocumentoAction(input: {
  id: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const id = String(input?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Documento non valido." };
  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_acquisto_documenti")
    .select("id, nome, storage_path, acquisto_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Documento non trovato." };
  const path = String(data.storage_path ?? "");
  const { data: signed, error: signErr } = await db.storage
    .from(CAVEAU_DOCUMENTO_BUCKET)
    .createSignedUrl(path, 120);
  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: "Impossibile aprire il documento." };
  }
  await audita({
    entityType: ENTITY_DOCUMENTO,
    entityId: id,
    action: "read",
    actorId: g.actorId,
    summary: `Documento acquisto aperto: ${String(data.nome ?? "")}`,
    payload: { acquisto_id: String(data.acquisto_id ?? ""), nome: String(data.nome ?? "") },
  });
  return { ok: true, url: signed.signedUrl };
}

export async function eliminaCaveauAcquistoDocumentoAction(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const id = String(input?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Documento non valido." };
  const db = createServiceClient();
  const { data, error: readErr } = await db
    .from("caveau_siti_acquisto_documenti")
    .select("id, nome, acquisto_id, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !data) return { ok: false, error: "Documento non trovato." };
  const now = new Date().toISOString();
  const { error } = await db
    .from("caveau_siti_acquisto_documenti")
    .update({
      deleted_at: now,
      deleted_by: g.actorId,
      updated_by: g.actorId,
      documento_stato: "archiviato",
      versione: Number(data.versione ?? 1) + 1,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Rimozione del documento non riuscita." };
  await audita({
    entityType: ENTITY_DOCUMENTO,
    entityId: id,
    action: "soft_delete",
    actorId: g.actorId,
    summary: `Documento acquisto archiviato: ${String(data.nome ?? "")}`,
    payload: {
      acquisto_id: String(data.acquisto_id ?? ""),
      nome: String(data.nome ?? ""),
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}
