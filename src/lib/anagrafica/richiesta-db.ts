import { createHash, randomBytes } from "crypto";
import { getComuniByCAP } from "italian-cap-comuni-province";
import { ANAGRAFICA_DOCUMENTI_BUCKET } from "@/lib/amministrazione/anagrafica-documenti";
import {
  type AnagraficaFormPayload,
  type CampoAnagrafica,
  type SedeAnagraficaForm,
  type StatoRichiestaPubblica,
  type VistaPubblica,
  CAMPI_ANAGRAFICA,
  erroriPdf,
  formVuoto,
  normalizzaForm,
  sedeVuota,
} from "@/lib/anagrafica/richiesta-form";
import { FASE_TEST_ANAGRAFICA } from "@/lib/anagrafica/fase-test";
import { pdfAnagraficaAziendale } from "@/lib/anagrafica/richiesta-pdf";
import { createServiceClient } from "@/lib/supabase/service";

const GIORNI_VALIDITA = 7;

type Richiesta = {
  id: string;
  cliente_id: string | null;
  cliente_possibile_id: string | null;
  stato: StatoRichiestaPubblica;
  scade_at: string;
  payload: unknown;
  pdf_storage_path: string;
  firmato_storage_path?: string;
  firmato_file_name?: string;
  email_destinatario?: string;
  versione: number;
  created_by: string | null;
  fase_test?: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function nuovoToken(): string {
  return randomBytes(32).toString("base64url");
}

function oggiRoma(): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function scadenza(): string {
  return new Date(Date.now() + GIORNI_VALIDITA * 24 * 60 * 60 * 1000).toISOString();
}

function owner(row: Richiesta): { table: "clienti" | "clienti_possibili"; kind: "cliente" | "cliente_possibile"; id: string } {
  if (row.cliente_id) {
    return { table: "clienti", kind: "cliente", id: row.cliente_id };
  }
  return {
    table: "clienti_possibili",
    kind: "cliente_possibile",
    id: row.cliente_possibile_id ?? "",
  };
}

async function audit(
  entityType: string,
  entityId: string,
  summary: string,
  payload: Record<string, unknown>,
  actorId: string | null
) {
  const service = createServiceClient();
  await service.from("audit_log").insert({
    entity_type: entityType,
    entity_id: entityId,
    action: "update",
    actor_id: actorId,
    summary,
    payload,
  });
}

async function carica(token: string): Promise<Richiesta | { errore: string }> {
  const pulito = token.trim();
  if (pulito.length < 20) return { errore: "Link non valido o scaduto." };
  const service = createServiceClient();
  const { data, error } = await service
    .from("anagrafica_richieste")
    .select(
      "id, cliente_id, cliente_possibile_id, stato, scade_at, payload, pdf_storage_path, firmato_storage_path, firmato_file_name, email_destinatario, versione, created_by, fase_test"
    )
    .eq("token_hash", hashToken(pulito))
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { errore: "Link non valido o scaduto." };
  const row = data as Richiesta;
  if (
    (row.stato === "compilazione" || row.stato === "pdf_pronto") &&
    new Date(row.scade_at).getTime() < Date.now()
  ) {
    await service
      .from("anagrafica_richieste")
      .update({ stato: "scaduta", documento_stato: "chiuso" })
      .eq("id", row.id);
    row.stato = "scaduta";
  }
  return row;
}

function vista(row: Richiesta): VistaPubblica {
  const form = normalizzaForm(row.payload);
  return {
    stato: row.stato,
    form,
    scadeAt: row.scade_at,
    ragioneSociale: form.ragioneSociale,
    faseTest: row.fase_test === true,
    emailInvio: String(row.email_destinatario ?? ""),
  };
}

export async function leggiRichiestaPubblica(token: string): Promise<VistaPubblica | { errore: string }> {
  const row = await carica(token);
  if ("errore" in row) return row;
  return vista(row);
}

function comeSede(valore: unknown): SedeAnagraficaForm {
  return normalizzaForm({ sedeLegale: valore }).sedeLegale;
}

function applica(form: AnagraficaFormPayload, campo: CampoAnagrafica, valore: unknown): AnagraficaFormPayload {
  const next = { ...form, sedeLegale: { ...form.sedeLegale }, sedeAmministrativa: { ...form.sedeAmministrativa }, sedeMagazzino: { ...form.sedeMagazzino } };
  if (campo === "sedeLegale" || campo === "sedeAmministrativa" || campo === "sedeMagazzino") {
    next[campo] = comeSede(valore);
  } else if (campo === "sedeAmmUgualeLegale") {
    next.sedeAmmUgualeLegale = valore === true;
  } else if (campo === "consensoTrattamento") {
    next.consensoTrattamento = valore === true;
  } else if (campo === "sedeMagFonte") {
    const fonte = String(valore ?? "");
    next.sedeMagFonte =
      fonte === "legale" || fonte === "amministrativa" || fonte === "altra" ? fonte : "";
  } else if (campo === "partitaIva" || campo === "codiceFiscale" || campo === "sdiCode" || campo === "bancaIban" || campo === "titolareCf") {
    next[campo] = normalizzaForm({ [campo]: valore })[campo];
  } else {
    const testo = normalizzaForm({ [campo]: valore })[campo];
    if (typeof testo === "string") next[campo] = testo;
  }
  if (next.sedeAmmUgualeLegale) next.sedeAmministrativa = { ...next.sedeLegale };
  if (next.sedeMagFonte === "legale") next.sedeMagazzino = { ...next.sedeLegale };
  if (next.sedeMagFonte === "amministrativa") next.sedeMagazzino = { ...next.sedeAmministrativa };
  return next;
}

const COLONNE: Record<string, string> = {
  ragioneSociale: "ragione_sociale",
  partitaIva: "partita_iva",
  codiceFiscale: "codice_fiscale",
  sdiCode: "sdi_code",
  pec: "pec",
  telefono: "telefono",
  email: "email",
  respAcquistiNome: "resp_acquisti_nome",
  respAcquistiTel: "resp_acquisti_tel",
  respAcquistiEmail: "resp_acquisti_email",
  respTecnicoNome: "resp_tecnico_nome",
  respTecnicoTel: "resp_tecnico_tel",
  respTecnicoEmail: "resp_tecnico_email",
  legaleCognome: "legale_cognome",
  legaleNome: "legale_nome",
  legaleTel: "legale_tel",
  legaleEmail: "legale_email",
  bancaAppoggio: "banca_appoggio",
  bancaFiliale: "banca_filiale",
  bancaBic: "banca_bic",
  bancaIban: "banca_iban",
  titolareCognome: "titolare_cognome",
  titolareNome: "titolare_nome",
  titolareCf: "titolare_codice_fiscale",
  titolareDocumentoTipo: "titolare_documento_tipo",
  titolareDocumentoNumero: "titolare_documento_numero",
};

function patchSede(sede: SedeAnagraficaForm, prefisso: "sede_amm" | "sede_mag") {
  return {
    [`${prefisso}_nazione`]: sede.nazione,
    [`${prefisso}_provincia`]: sede.provincia,
    [`${prefisso}_localita`]: sede.localita,
    [`${prefisso}_citta`]: sede.citta,
    [`${prefisso}_cap`]: sede.cap,
    [`${prefisso}_indirizzo`]: sede.indirizzo,
  };
}

async function upsertSede(
  kind: "cliente" | "cliente_possibile",
  ownerId: string,
  tipo: "legale" | "amministrativa" | "magazzino",
  sede: SedeAnagraficaForm
): Promise<string | null> {
  const service = createServiceClient();
  const payload = {
    nazione: sede.nazione,
    provincia: sede.provincia,
    localita: sede.localita,
    citta: sede.citta,
    cap: sede.cap,
    indirizzo: sede.indirizzo,
    telefono: sede.telefono,
    updated_at: new Date().toISOString(),
  };
  const { data: esistente } = await service
    .from("anagrafica_sedi")
    .select("id")
    .eq("owner_kind", kind)
    .eq("owner_id", ownerId)
    .eq("tipo", tipo)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (esistente && typeof esistente === "object" && "id" in esistente) {
    const aggiornata = await service
      .from("anagrafica_sedi")
      .update(payload)
      .eq("id", (esistente as { id: string }).id);
    return aggiornata.error ? "Sede non aggiornata." : null;
  }
  const inserita = await service.from("anagrafica_sedi").insert({
    owner_kind: kind,
    owner_id: ownerId,
    tipo,
    sort_order: 0,
    ...payload,
  });
  return inserita.error ? "Sede non registrata." : null;
}

async function scriviScheda(row: Richiesta, form: AnagraficaFormPayload): Promise<string | null> {
  const chi = owner(row);
  if (!chi.id) return "Azienda non collegata.";
  const service = createServiceClient();
  const colonne: Record<string, string> = {};
  for (const [campo, colonna] of Object.entries(COLONNE)) {
    const valore = form[campo as keyof AnagraficaFormPayload];
    if (typeof valore !== "string") continue;
    if (
      (colonna === "ragione_sociale" || colonna === "partita_iva" || colonna === "codice_fiscale") &&
      !valore.trim()
    ) {
      continue;
    }
    colonne[colonna] = valore;
  }
  Object.assign(colonne, patchSede(form.sedeAmministrativa, "sede_amm"));
  Object.assign(colonne, patchSede(form.sedeMagazzino, "sede_mag"));
  const aggiornata = await service.from(chi.table).update(colonne).eq("id", chi.id);
  if (aggiornata.error) return "Questo dato non può essere scritto sulla scheda. Controlla il valore.";
  const sedi = await Promise.all([
    upsertSede(chi.kind, chi.id, "legale", form.sedeLegale),
    upsertSede(chi.kind, chi.id, "amministrativa", form.sedeAmministrativa),
    form.sedeMagFonte
      ? upsertSede(chi.kind, chi.id, "magazzino", form.sedeMagazzino)
      : Promise.resolve(null),
  ]);
  return sedi.find((voce) => voce) ?? null;
}

export async function salvaCampoPubblico(
  token: string,
  campo: string,
  valore: unknown
): Promise<{ form: AnagraficaFormPayload } | { errore: string }> {
  if (!(CAMPI_ANAGRAFICA as readonly string[]).includes(campo)) {
    return { errore: "Campo non previsto." };
  }
  const row = await carica(token);
  if ("errore" in row) return row;
  const consensoSuPdf = campo === "consensoTrattamento" && row.stato === "pdf_pronto";
  if (row.stato !== "compilazione" && !consensoSuPdf) {
    return { errore: "Il form non è modificabile in questo momento." };
  }
  const prima = normalizzaForm(row.payload);
  const dopo = applica(prima, campo as CampoAnagrafica, valore);
  const service = createServiceClient();
  const { error } = await service
    .from("anagrafica_richieste")
    .update({ payload: dopo, compilata_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("stato", consensoSuPdf ? "pdf_pronto" : "compilazione");
  if (error) return { errore: "Salvataggio non riuscito. Riprova." };
  const scheda = await scriviScheda(row, dopo);
  if (scheda) return { errore: scheda };
  const chi = owner(row);
  await audit(
    chi.table,
    chi.id,
    `Form anagrafica: aggiornato ${campo}.`,
    {
      richiesta_id: row.id,
      campo,
      prima: prima[campo as keyof AnagraficaFormPayload],
      dopo: dopo[campo as keyof AnagraficaFormPayload],
    },
    null
  );
  return { form: dopo };
}

export async function comuniDaCapPubblico(token: string, cap: string) {
  const row = await carica(token);
  if ("errore" in row) return row;
  if (!/^\d{5}$/.test(cap)) return { comuni: [] as Array<{ citta: string; provincia: string }> };
  const trovati = getComuniByCAP(cap) as Array<{ nome?: string; siglaProvincia?: string }>;
  const visti = new Set<string>();
  const comuni: Array<{ citta: string; provincia: string }> = [];
  for (const item of trovati) {
    const citta = String(item.nome ?? "").trim();
    const provincia = String(item.siglaProvincia ?? "").trim();
    const chiave = `${citta}|${provincia}`;
    if (!citta || visti.has(chiave)) continue;
    visti.add(chiave);
    comuni.push({ citta, provincia });
  }
  return { comuni };
}

async function archiviaPdfCliente(
  row: Richiesta,
  path: string,
  fileName: string,
  bytes: number,
  titolo: string,
  stato: "approvato" | "chiuso",
  mime: string
) {
  if (!row.cliente_id) return;
  const service = createServiceClient();
  await service.from("anagrafica_documenti").insert({
    cliente_id: row.cliente_id,
    tipo: "anagrafica_aziendale",
    titolo,
    note: row.fase_test
      ? "Prova anagrafica. Ritirata se il test viene annullato."
      : "Archivio permanente del form anagrafica.",
    storage_path: path,
    file_name: fileName,
    mime,
    file_size: bytes,
    versione: row.versione,
    documento_stato: stato,
    created_by: row.created_by,
    updated_by: row.created_by,
    approved_by: stato === "chiuso" ? row.created_by : null,
    approved_at: new Date().toISOString(),
  });
}

export async function scaricaPdfPubblico(
  token: string
): Promise<{ pdfBase64: string; fileName: string; form: AnagraficaFormPayload } | { errore: string; mancanti?: string[] }> {
  const row = await carica(token);
  if ("errore" in row) return row;
  if (row.stato !== "compilazione") {
    return { errore: "Il PDF si scarica dal form, non da questa schermata." };
  }
  const form = normalizzaForm(row.payload);
  const mancanti = erroriPdf(form);
  if (mancanti.length) return { errore: "Per il PDF mancano dei dati.", mancanti };
  const data = oggiRoma();
  const bytes = pdfAnagraficaAziendale(form, data);
  const versione = row.versione + 1;
  const chi = owner(row);
  const fileName = "Anagrafica-Aziendale.pdf";
  const path = `${chi.id}/anagrafica-richiesta/${row.id}-v${versione}.pdf`;
  const service = createServiceClient();
  const upload = await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error) return { errore: "Archivio del PDF non riuscito. Riprova." };
  const { error } = await service
    .from("anagrafica_richieste")
    .update({
      stato: "pdf_pronto",
      documento_stato: "approvato",
      payload: form,
      pdf_storage_path: path,
      pdf_file_name: fileName,
      pdf_scaricato_at: new Date().toISOString(),
      versione,
    })
    .eq("id", row.id)
    .eq("stato", "compilazione");
  if (error) return { errore: "Aggiornamento della richiesta non riuscito." };
  await archiviaPdfCliente(row, path, fileName, bytes.length, "Anagrafica aziendale", "approvato", "application/pdf");
  await audit(
    "anagrafica_richieste",
    row.id,
    "PDF anagrafica aziendale generato.",
    { versione, storage_path: path },
    null
  );
  return { pdfBase64: bytes.toString("base64"), fileName, form };
}

export async function tornaAlFormPubblico(token: string): Promise<VistaPubblica | { errore: string }> {
  const row = await carica(token);
  if ("errore" in row) return row;
  if (row.stato !== "pdf_pronto") return { errore: "Non puoi modificare i dati da questa schermata." };
  const service = createServiceClient();
  const { error } = await service
    .from("anagrafica_richieste")
    .update({ stato: "compilazione", documento_stato: "bozza" })
    .eq("id", row.id)
    .eq("stato", "pdf_pronto");
  if (error) return { errore: "Riapertura del form non riuscita." };
  row.stato = "compilazione";
  await audit("anagrafica_richieste", row.id, "Il cliente ha riaperto il form anagrafica.", {}, null);
  return vista(row);
}

const MIMI_FIRMA = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function caricaFirmatoPubblico(
  token: string,
  file: File
): Promise<{ ok: true } | { errore: string }> {
  const row = await carica(token);
  if ("errore" in row) return row;
  if (row.stato !== "pdf_pronto") {
    return { errore: "Il documento firmato si carica dopo aver scaricato il PDF." };
  }
  if (!MIMI_FIRMA.has(file.type) || file.size <= 0 || file.size > 20 * 1024 * 1024) {
    return { errore: "Carica il PDF, JPG o PNG firmato, entro 20 MB." };
  }
  const chi = owner(row);
  const estensione = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "pdf";
  const fileName = `Anagrafica-Aziendale-firmata.${estensione}`;
  const path = `${chi.id}/anagrafica-richiesta/${row.id}-firmato-${Date.now()}.${estensione}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const service = createServiceClient();
  const upload = await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) return { errore: "Caricamento non riuscito. Riprova." };
  const { error } = await service
    .from("anagrafica_richieste")
    .update({
      stato: "firmata",
      documento_stato: "chiuso",
      firmato_storage_path: path,
      firmato_file_name: fileName,
      firmata_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("stato", "pdf_pronto");
  if (error) return { errore: "Registrazione del documento non riuscita." };
  await archiviaPdfCliente(
    { ...row, versione: row.versione },
    path,
    fileName,
    bytes.length,
    "Anagrafica aziendale firmata",
    "chiuso",
    file.type
  );
  await audit(
    "anagrafica_richieste",
    row.id,
    "Documento anagrafica firmato archiviato.",
    { storage_path: path, file_name: fileName },
    null
  );
  return { ok: true };
}

const SELECT_SCHEDA =
  "ragione_sociale, partita_iva, codice_fiscale, sdi_code, pec, email, telefono, banca_appoggio, banca_filiale, banca_bic, banca_iban, legale_cognome, legale_nome, legale_tel, legale_email, resp_acquisti_nome, resp_acquisti_tel, resp_acquisti_email, resp_tecnico_nome, resp_tecnico_tel, resp_tecnico_email, titolare_cognome, titolare_nome, titolare_codice_fiscale, titolare_documento_tipo, titolare_documento_numero, sede_amm_nazione, sede_amm_provincia, sede_amm_localita, sede_amm_citta, sede_amm_cap, sede_amm_indirizzo, sede_mag_nazione, sede_mag_provincia, sede_mag_localita, sede_mag_citta, sede_mag_cap, sede_mag_indirizzo";

function sedeDaRiga(row: Record<string, unknown>, prefisso: string): SedeAnagraficaForm {
  return {
    nazione: String(row[`${prefisso}_nazione`] ?? "") || "Italia",
    provincia: String(row[`${prefisso}_provincia`] ?? ""),
    localita: String(row[`${prefisso}_localita`] ?? ""),
    citta: String(row[`${prefisso}_citta`] ?? ""),
    cap: String(row[`${prefisso}_cap`] ?? ""),
    indirizzo: String(row[`${prefisso}_indirizzo`] ?? ""),
    telefono: String(row.telefono_sede ?? ""),
  };
}

function stessaSede(a: SedeAnagraficaForm, b: SedeAnagraficaForm): boolean {
  return (
    a.indirizzo.trim().toLowerCase() === b.indirizzo.trim().toLowerCase() &&
    a.cap === b.cap &&
    a.citta.trim().toLowerCase() === b.citta.trim().toLowerCase() &&
    Boolean(a.indirizzo.trim())
  );
}

export async function precompilaDaScheda(
  kind: "cliente" | "cliente_possibile",
  id: string
): Promise<{ form: AnagraficaFormPayload; email: string; ragioneSociale: string } | { errore: string }> {
  const table = kind === "cliente" ? "clienti" : "clienti_possibili";
  const service = createServiceClient();
  const { data, error } = await service
    .from(table)
    .select(SELECT_SCHEDA)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { errore: "Azienda non trovata." };
  const row = data as Record<string, unknown>;
  const { data: sedi } = await service
    .from("anagrafica_sedi")
    .select("tipo, nazione, provincia, localita, citta, cap, indirizzo, telefono")
    .eq("owner_kind", kind)
    .eq("owner_id", id)
    .is("deleted_at", null);
  const daSede = (tipo: string, fallback: SedeAnagraficaForm): SedeAnagraficaForm => {
    const lista = (sedi ?? []) as Array<Record<string, unknown>>;
    const trovata = lista.find((item) => item.tipo === tipo);
    if (!trovata) return fallback;
    return {
      nazione: String(trovata.nazione ?? "") || "Italia",
      provincia: String(trovata.provincia ?? ""),
      localita: String(trovata.localita ?? ""),
      citta: String(trovata.citta ?? ""),
      cap: String(trovata.cap ?? ""),
      indirizzo: String(trovata.indirizzo ?? ""),
      telefono: String(trovata.telefono ?? ""),
    };
  };
  const legale = daSede("legale", sedeVuota());
  const amministrativa = daSede("amministrativa", sedeDaRiga(row, "sede_amm"));
  const magazzino = daSede("magazzino", sedeDaRiga(row, "sede_mag"));
  const form = formVuoto();
  form.ragioneSociale = String(row.ragione_sociale ?? "");
  form.partitaIva = String(row.partita_iva ?? "");
  form.codiceFiscale = String(row.codice_fiscale ?? "");
  form.sdiCode = String(row.sdi_code ?? "");
  form.pec = String(row.pec ?? "");
  form.email = String(row.email ?? "");
  form.telefono = String(row.telefono ?? "");
  form.bancaAppoggio = String(row.banca_appoggio ?? "");
  form.bancaFiliale = String(row.banca_filiale ?? "");
  form.bancaBic = String(row.banca_bic ?? "");
  form.bancaIban = String(row.banca_iban ?? "");
  form.legaleCognome = String(row.legale_cognome ?? "");
  form.legaleNome = String(row.legale_nome ?? "");
  form.legaleTel = String(row.legale_tel ?? "");
  form.legaleEmail = String(row.legale_email ?? "");
  form.respAcquistiNome = String(row.resp_acquisti_nome ?? "");
  form.respAcquistiTel = String(row.resp_acquisti_tel ?? "");
  form.respAcquistiEmail = String(row.resp_acquisti_email ?? "");
  form.respTecnicoNome = String(row.resp_tecnico_nome ?? "");
  form.respTecnicoTel = String(row.resp_tecnico_tel ?? "");
  form.respTecnicoEmail = String(row.resp_tecnico_email ?? "");
  form.titolareCognome = String(row.titolare_cognome ?? "");
  form.titolareNome = String(row.titolare_nome ?? "");
  form.titolareCf = String(row.titolare_codice_fiscale ?? "");
  form.titolareDocumentoTipo = String(row.titolare_documento_tipo ?? "");
  form.titolareDocumentoNumero = String(row.titolare_documento_numero ?? "");
  form.sedeLegale = legale;
  form.sedeAmministrativa = amministrativa;
  form.sedeMagazzino = magazzino;
  form.sedeAmmUgualeLegale = stessaSede(legale, amministrativa);
  form.sedeMagFonte = stessaSede(legale, magazzino)
    ? "legale"
    : (stessaSede(amministrativa, magazzino)
      ? "amministrativa"
      : (magazzino.indirizzo.trim() ? "altra" : ""));
  return {
    form: normalizzaForm(form),
    email: form.email,
    ragioneSociale: form.ragioneSociale,
  };
}

const TIPI_SEDE_TEST = ["legale", "amministrativa", "magazzino"] as const;

type SedeSnap = {
  id: string | null;
  tipo: (typeof TIPI_SEDE_TEST)[number];
  nazione: string;
  provincia: string;
  localita: string;
  citta: string;
  cap: string;
  indirizzo: string;
  telefono: string;
};

function colonnaOwner(kind: "cliente" | "cliente_possibile") {
  return kind === "cliente" ? "cliente_id" : "cliente_possibile_id";
}

async function assicuratiSnapshot(
  kind: "cliente" | "cliente_possibile",
  id: string,
  actorId: string
): Promise<string | null> {
  if (!FASE_TEST_ANAGRAFICA) return null;
  const service = createServiceClient();
  const colonna = colonnaOwner(kind);
  const { data: gia } = await service
    .from("anagrafica_test_ripristini")
    .select("id")
    .eq(colonna, id)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (gia && typeof gia === "object" && "id" in gia) return String((gia as { id: string }).id);
  const table = kind === "cliente" ? "clienti" : "clienti_possibili";
  const { data: scheda, error } = await service
    .from(table)
    .select(SELECT_SCHEDA)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !scheda) return null;
  const { data: sedi } = await service
    .from("anagrafica_sedi")
    .select("id, tipo, nazione, provincia, localita, citta, cap, indirizzo, telefono")
    .eq("owner_kind", kind)
    .eq("owner_id", id)
    .in("tipo", [...TIPI_SEDE_TEST])
    .is("deleted_at", null);
  const foto = ((sedi ?? []) as Array<Record<string, unknown>>).map((sede) => ({
    id: String(sede.id ?? ""),
    tipo: String(sede.tipo ?? ""),
    nazione: String(sede.nazione ?? ""),
    provincia: String(sede.provincia ?? ""),
    localita: String(sede.localita ?? ""),
    citta: String(sede.citta ?? ""),
    cap: String(sede.cap ?? ""),
    indirizzo: String(sede.indirizzo ?? ""),
    telefono: String(sede.telefono ?? ""),
  }));
  const { data: creata, error: insertErr } = await service
    .from("anagrafica_test_ripristini")
    .insert({
      cliente_id: kind === "cliente" ? id : null,
      cliente_possibile_id: kind === "cliente_possibile" ? id : null,
      scheda,
      sedi: foto,
      stato: "attivo",
      documento_stato: "bozza",
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id")
    .single();
  if (insertErr || !creata) return null;
  const snapId = String((creata as { id: string }).id);
  await audit(
    table,
    id,
    "Istantanea di test anagrafica registrata prima dell'invio.",
    { ripristino_id: snapId },
    actorId
  );
  return snapId;
}

export async function annullaTestAnagrafica(input: {
  kind: "cliente" | "cliente_possibile";
  id: string;
  actorId: string;
}): Promise<{ ok: true } | { errore: string }> {
  const service = createServiceClient();
  const colonna = colonnaOwner(input.kind);
  const { data: snap, error } = await service
    .from("anagrafica_test_ripristini")
    .select("id, scheda, sedi, created_at")
    .eq(colonna, input.id)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !snap) return { errore: "Non c'è una prova da annullare." };
  const foto = snap as { id: string; scheda: Record<string, unknown>; sedi: SedeSnap[] };
  const table = input.kind === "cliente" ? "clienti" : "clienti_possibili";
  const colonne: Record<string, unknown> = { ...foto.scheda, updated_by: input.actorId };
  delete colonne.id;
  const ripristino = await service.from(table).update(colonne).eq("id", input.id);
  if (ripristino.error) return { errore: "Ripristino della scheda non riuscito." };
  const sediFoto = Array.isArray(foto.sedi) ? foto.sedi : [];
  for (const tipo of TIPI_SEDE_TEST) {
    const precedente = sediFoto.find((sede) => sede.tipo === tipo);
    const { data: viva } = await service
      .from("anagrafica_sedi")
      .select("id")
      .eq("owner_kind", input.kind)
      .eq("owner_id", input.id)
      .eq("tipo", tipo)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const vivaId = viva && typeof viva === "object" && "id" in viva ? String((viva as { id: string }).id) : "";
    if (precedente?.id) {
      const sedeErr = await service
        .from("anagrafica_sedi")
        .update({
          nazione: precedente.nazione,
          provincia: precedente.provincia,
          localita: precedente.localita,
          citta: precedente.citta,
          cap: precedente.cap,
          indirizzo: precedente.indirizzo,
          telefono: precedente.telefono,
          deleted_at: null,
          updated_by: input.actorId,
        })
        .eq("id", precedente.id);
      if (sedeErr.error) return { errore: "Ripristino delle sedi non riuscito." };
      if (vivaId && vivaId !== precedente.id) {
        await service
          .from("anagrafica_sedi")
          .update({ deleted_at: new Date().toISOString(), deleted_by: input.actorId })
          .eq("id", vivaId);
      }
    } else if (vivaId) {
      await service
        .from("anagrafica_sedi")
        .update({ deleted_at: new Date().toISOString(), deleted_by: input.actorId })
        .eq("id", vivaId);
    }
  }
  const { data: richieste } = await service
    .from("anagrafica_richieste")
    .select("id, pdf_storage_path, firmato_storage_path")
    .eq(colonna, input.id)
    .eq("fase_test", true)
    .is("deleted_at", null);
  const prove = (richieste ?? []) as Array<{
    id: string;
    pdf_storage_path: string;
    firmato_storage_path: string;
  }>;
  const ora = new Date().toISOString();
  for (const prova of prove) {
    const cartella = `${input.id}/anagrafica-richiesta`;
    const elenco = await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).list(cartella);
    const percorsi = (elenco.data ?? [])
      .map((file) => String(file.name ?? ""))
      .filter((nome) => nome.includes(prova.id))
      .map((nome) => `${cartella}/${nome}`);
    for (const extra of [prova.pdf_storage_path, prova.firmato_storage_path]) {
      if (extra && !percorsi.includes(extra)) percorsi.push(extra);
    }
    if (percorsi.length) {
      await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).remove(percorsi);
    }
    if (input.kind === "cliente") {
      await service
        .from("anagrafica_documenti")
        .update({ deleted_at: ora, deleted_by: input.actorId })
        .eq("cliente_id", input.id)
        .eq("tipo", "anagrafica_aziendale")
        .like("storage_path", `%/anagrafica-richiesta/${prova.id}%`)
        .is("deleted_at", null);
    }
    await service
      .from("anagrafica_richieste")
      .update({
        stato: "annullata",
        documento_stato: "chiuso",
        deleted_at: ora,
        deleted_by: input.actorId,
      })
      .eq("id", prova.id);
    await service
      .from("otp_verifications")
      .update({
        stato: "annullato",
        deleted_at: ora,
        deleted_by: input.actorId,
      })
      .eq("richiesta_id", prova.id)
      .is("deleted_at", null);
  }
  await service
    .from("anagrafica_test_ripristini")
    .update({
      stato: "ripristinato",
      documento_stato: "chiuso",
      updated_by: input.actorId,
    })
    .eq("id", foto.id);
  await audit(
    table,
    input.id,
    "Test anagrafica annullato. Scheda ripristinata allo stato precedente l'invio.",
    { ripristino_id: foto.id, richieste: prove.length },
    input.actorId
  );
  return { ok: true };
}

export async function preparaInvioAnagrafica(input: {
  kind: "cliente" | "cliente_possibile";
  id: string;
  email: string;
  actorId: string;
  token: string;
}): Promise<{ ok: true; richiestaId: string } | { errore: string }> {
  const service = createServiceClient();
  const colonna = input.kind === "cliente" ? "cliente_id" : "cliente_possibile_id";
  const { data: aperte } = await service
    .from("anagrafica_richieste")
    .select("id, stato, scade_at, payload")
    .eq(colonna, input.id)
    .in("stato", ["compilazione", "pdf_pronto"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const aperta = ((aperte ?? []) as Array<Richiesta & { payload: unknown }>)[0];
  const ancoraAperta =
    aperta && new Date(aperta.scade_at).getTime() > Date.now();
  const precompilata = ancoraAperta
    ? { form: normalizzaForm(aperta.payload) }
    : await precompilaDaScheda(input.kind, input.id);
  if ("errore" in precompilata) return precompilata;
  const hash = hashToken(input.token);
  const scade = scadenza();
  const snapId = await assicuratiSnapshot(input.kind, input.id, input.actorId);
  if (FASE_TEST_ANAGRAFICA && !snapId) {
    return { errore: "Impossibile registrare lo stato precedente. Il link non è stato attivato." };
  }
  if (ancoraAperta && aperta) {
    const { error } = await service
      .from("anagrafica_richieste")
      .update({
        token_hash: hash,
        email_destinatario: input.email,
        scade_at: scade,
        updated_by: input.actorId,
        ...(FASE_TEST_ANAGRAFICA ? { fase_test: true } : {}),
      })
      .eq("id", aperta.id);
    if (error) return { errore: "Aggiornamento del link non riuscito." };
    await audit(
      "anagrafica_richieste",
      aperta.id,
      "Nuovo link anagrafica inviato. Il precedente non è più valido.",
      { stato: "compilazione" },
      input.actorId
    );
    return { ok: true, richiestaId: aperta.id };
  }
  const insert: Record<string, unknown> = {
    token_hash: hash,
    email_destinatario: input.email,
    stato: "compilazione",
    scade_at: scade,
    payload: precompilata.form,
    documento_stato: "bozza",
    created_by: input.actorId,
    updated_by: input.actorId,
    fase_test: FASE_TEST_ANAGRAFICA,
    cliente_id: input.kind === "cliente" ? input.id : null,
    cliente_possibile_id: input.kind === "cliente_possibile" ? input.id : null,
  };
  const { data, error } = await service
    .from("anagrafica_richieste")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) return { errore: error?.message ?? "Richiesta non creata." };
  const id = (data as { id: string }).id;
  if (snapId) {
    await service.from("anagrafica_test_ripristini").update({ richiesta_id: id }).eq("id", snapId);
  }
  await audit(
    "anagrafica_richieste",
    id,
    "Richiesta anagrafica inviata all'azienda.",
    { owner: input.kind },
    input.actorId
  );
  return { ok: true, richiestaId: id };
}

export async function riepilogoRichiesta(kind: "cliente" | "cliente_possibile", id: string) {
  const service = createServiceClient();
  const colonna = kind === "cliente" ? "cliente_id" : "cliente_possibile_id";
  const { data } = await service
    .from("anagrafica_richieste")
    .select("stato, scade_at, firmata_at, pdf_scaricato_at")
    .eq(colonna, id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: prova } = await service
    .from("anagrafica_test_ripristini")
    .select("id")
    .eq(colonna, id)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .maybeSingle();
  const scheda = await precompilaDaScheda(kind, id);
  if ("errore" in scheda) return { errore: scheda.errore };
  const row = (data ?? null) as {
    stato: StatoRichiestaPubblica;
    scade_at: string;
    firmata_at: string | null;
    pdf_scaricato_at: string | null;
  } | null;
  return {
    stato: row?.stato ?? null,
    scadeAt: row?.scade_at ?? null,
    firmataAt: row?.firmata_at ?? null,
    pdfScaricatoAt: row?.pdf_scaricato_at ?? null,
    form: scheda.form,
    email: scheda.email,
    faseTest: FASE_TEST_ANAGRAFICA,
    testAttivo: Boolean(prova),
  };
}

export async function caricaRichiestaToken(token: string) {
  return carica(token);
}

export { archiviaPdfCliente };
export type { Richiesta as RichiestaAnagrafica };
