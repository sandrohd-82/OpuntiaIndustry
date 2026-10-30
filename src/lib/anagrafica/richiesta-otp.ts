import { createHash, randomInt, timingSafeEqual } from "crypto";
import { ANAGRAFICA_DOCUMENTI_BUCKET } from "@/lib/amministrazione/anagrafica-documenti";
import {
  emailAnagraficaValida,
  emailRegistrateAnagrafica,
  erroriPdf,
  normalizzaForm,
  type AnagraficaFormPayload,
} from "@/lib/anagrafica/richiesta-form";
import { pdfAnagraficaAziendale } from "@/lib/anagrafica/richiesta-pdf";
import { pdfPresaVisione, type ConsensoMarketing } from "@/lib/anagrafica/presa-visione-pdf";
import {
  archiviaPdfCliente,
  caricaRichiestaToken,
  formAnagraficaPubblico,
  type RichiestaAnagrafica,
} from "@/lib/anagrafica/richiesta-db";
import {
  casellaInvioAnagrafica,
  ERRORE_CASELLA_ANAGRAFICA,
  inviaDaCasellaAnagrafica,
} from "@/lib/anagrafica/casella-invio";
import { createServiceClient } from "@/lib/supabase/service";

const MINUTI = 5;
const TENTATIVI = 5;
const MESSAGGIO_OTP_ANCORA_VALIDO = "Sei ancora in tempo per utilizzare lo stesso OTP";

export type DocumentoFirma = "anagrafica" | "privacy" | "condizioni";

function hashCodice(richiestaId: string, documento: DocumentoFirma, codice: string): string {
  return createHash("sha256").update(`${richiestaId}:${documento}:${codice}`).digest("hex");
}

export function documentoFirmaDi(value: unknown): DocumentoFirma {
  if (value === "privacy" || value === "condizioni") return value;
  return "anagrafica";
}

function dataRoma(data: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

function firmatarioOk(value: unknown): string | null {
  const nome = String(value ?? "").replace(/\s+/g, " ").trim();
  if (nome.length < 5 || !nome.includes(" ")) return null;
  return nome.slice(0, 120);
}

function testoOtp(documento: DocumentoFirma): { subject: string; cosa: string } {
  if (documento === "privacy") {
    return {
      subject: "Codice per firmare l'informativa privacy",
      cosa: "l'informativa privacy",
    };
  }
  if (documento === "condizioni") {
    return {
      subject: "Codice per firmare le condizioni generali di vendita",
      cosa: "le condizioni generali di vendita",
    };
  }
  return {
    subject: "Codice per firmare l'anagrafica aziendale",
    cosa: "l'anagrafica aziendale",
  };
}

function hashUguale(atteso: string, calcolato: string): boolean {
  const a = Buffer.from(atteso);
  const b = Buffer.from(calcolato);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function quandoRoma(data: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(data);
}

function apribile(row: RichiestaAnagrafica, documento: DocumentoFirma): string | null {
  if (row.stato === "annullata" || row.stato === "scaduta") {
    return "Il link non è più valido.";
  }
  if (row.passo === "completato" || row.stato === "COMPLETED") {
    return "Questa richiesta è già firmata.";
  }
  if (documento === "anagrafica") {
    if (row.passo && row.passo !== "anagrafica") return "L'anagrafica è già firmata.";
    if (row.stato !== "compilazione" && row.stato !== "pdf_pronto") {
      return "Il link non è più valido.";
    }
    return null;
  }
  if (documento === "privacy") {
    return row.passo === "privacy" ? null : "Questo documento non è ancora apribile.";
  }
  return row.passo === "condizioni" ? null : "Questo documento non è ancora apribile.";
}

function emailScelta(form: AnagraficaFormPayload, invio: string, email: string): string | null {
  const registrate = emailRegistrateAnagrafica(invio, form);
  return (
    registrate.find((voce) => voce.toLowerCase() === email.trim().toLowerCase()) ?? null
  );
}

export async function richiediOtpFirma(input: {
  token: string;
  email: string;
  ip: string;
  documento?: unknown;
}): Promise<{ scadeAt: string } | { errore: string }> {
  const documento = documentoFirmaDi(input.documento);
  if (!emailAnagraficaValida(input.email)) {
    return { errore: "Indica un'e-mail valida." };
  }
  const contesto = await formAnagraficaPubblico(input.token);
  if ("errore" in contesto) return contesto;
  const { row, form } = contesto;
  const blocco = apribile(row, documento);
  if (blocco) return { errore: blocco };
  if (documento === "anagrafica") {
    const mancanti = erroriPdf(form);
    if (mancanti.length) {
      return { errore: mancanti[0] ?? "Per firmare mancano dei dati." };
    }
  }
  const email = emailScelta(form, String(row.email_destinatario ?? ""), input.email);
  if (!email) {
    return {
      errore:
        "Il codice si invia solo all'e-mail del link oppure a un'e-mail già salvata in questa anagrafica.",
    };
  }
  const service = createServiceClient();
  const ora = Date.now();
  const { data: recente } = await service
    .from("otp_verifications")
    .select("id, scade_at, email")
    .eq("richiesta_id", row.id)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    recente &&
    Date.parse(String(recente.scade_at)) > ora &&
    String(recente.email ?? "").toLowerCase() === email.toLowerCase()
  ) {
    return {
      scadeAt: String(recente.scade_at),
      riusa: true,
      messaggio: MESSAGGIO_OTP_ANCORA_VALIDO,
    };
  }
  await service
    .from("otp_verifications")
    .update({ stato: "annullato", updated_at: new Date().toISOString() })
    .eq("richiesta_id", row.id)
    .eq("stato", "attivo")
    .is("deleted_at", null);

  const codice = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const avviso = testoOtp(documento);
  const scade = new Date(ora + MINUTI * 60_000);
  const { data: creato, error } = await service
    .from("otp_verifications")
    .insert({
      richiesta_id: row.id,
      documento,
      email,
      codice_hash: hashCodice(row.id, documento, codice),
      stato: "attivo",
      scade_at: scade.toISOString(),
      ip_richiesta: input.ip.slice(0, 80),
    })
    .select("id")
    .single();
  if (error || !creato) {
    return { errore: "Il codice non è stato preparato. Riprova." };
  }
  const account = await casellaInvioAnagrafica();
  if (!account) {
    await service
      .from("otp_verifications")
      .update({ stato: "annullato" })
      .eq("id", creato.id);
    return { errore: ERRORE_CASELLA_ANAGRAFICA };
  }
  const testo = [
    `Il codice per firmare ${avviso.cosa} è:`,
    "",
    codice,
    "",
    "Vale 5 minuti e si usa una sola volta.",
    "Se non avete chiesto voi il codice, ignorate questa mail.",
  ].join("\n");
  let motivo = "";
  for (let tentativo = 0; tentativo < 2; tentativo += 1) {
    try {
      await inviaDaCasellaAnagrafica({
        to: email,
        subject: avviso.subject,
        text: testo,
      });
      motivo = "";
      break;
    } catch (errore) {
      const grezzo = errore instanceof Error ? errore.message : "invio";
      motivo = grezzo
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .replace(/\s+/g, " ")
        .slice(0, 180);
      if (tentativo === 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }
  if (motivo) {
    console.error("[anagrafica otp]", motivo);
    await service
      .from("otp_verifications")
      .update({ stato: "annullato" })
      .eq("id", creato.id);
    await service.from("audit_log").insert({
      entity_type: "otp_verifications",
      entity_id: creato.id,
      action: "update",
      actor_id: null,
      summary: "Invio del codice OTP non riuscito.",
      payload: { motivo },
    });
    return {
      errore: "Invio del codice non riuscito. Attendi un minuto e riprova.",
    };
  }
  await service.from("audit_log").insert({
    entity_type: "otp_verifications",
    entity_id: creato.id,
    action: "create",
    actor_id: null,
    summary: "Codice OTP per la firma anagrafica inviato.",
    payload: { richiesta_id: row.id, scade_at: scade.toISOString() },
  });
  return { scadeAt: scade.toISOString() };
}

export async function verificaOtpFirma(input: {
  token: string;
  email: string;
  codice: string;
  ip: string;
  documento?: unknown;
  firmatario?: unknown;
  accettoInformativa?: unknown;
  consensoMarketing?: unknown;
  accettoCondizioni?: unknown;
}): Promise<{ fileName: string; passo: "privacy" | "condizioni" | "completato" } | { errore: string }> {
  const documento = documentoFirmaDi(input.documento);
  if (!/^\d{6}$/.test(input.codice)) {
    return { errore: "Il codice è di 6 cifre." };
  }
  const contesto = await formAnagraficaPubblico(input.token);
  if ("errore" in contesto) return contesto;
  const { row, form } = contesto;
  const blocco = apribile(row, documento);
  if (blocco) return { errore: blocco };
  const email = emailScelta(form, String(row.email_destinatario ?? ""), input.email);
  if (!email) {
    return { errore: "Questa e-mail non è registrata per la firma." };
  }
  if (documento === "anagrafica") {
    const mancanti = erroriPdf(form);
    if (mancanti.length) return { errore: mancanti[0] ?? "Per firmare mancano dei dati." };
  }

  const service = createServiceClient();
  const { data: otpData } = await service
    .from("otp_verifications")
    .select("id, codice_hash, scade_at, tentativi, stato, email, documento")
    .eq("richiesta_id", row.id)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const otp = otpData as {
    id: string;
    codice_hash: string;
    scade_at: string;
    tentativi: number;
    email: string;
    documento: string;
  } | null;
  if (!otp) return { errore: "Richiedi un nuovo codice." };
  if (otp.email.toLowerCase() !== email.toLowerCase()) {
    return { errore: "Il codice è stato inviato a un'altra e-mail registrata." };
  }
  if (Date.parse(otp.scade_at) <= Date.now()) {
    await service.from("otp_verifications").update({ stato: "scaduto" }).eq("id", otp.id);
    return { errore: "Il codice è scaduto. Richiedine uno nuovo." };
  }
  if (!hashUguale(otp.codice_hash, hashCodice(row.id, documentoFirmaDi(otp.documento), input.codice))) {
    const tentativi = Number(otp.tentativi) + 1;
    await service
      .from("otp_verifications")
      .update({
        tentativi,
        stato: tentativi >= TENTATIVI ? "annullato" : "attivo",
      })
      .eq("id", otp.id);
    return {
      errore:
        tentativi >= TENTATIVI
          ? "Troppi tentativi. Richiedi un nuovo codice."
          : "Codice non valido.",
    };
  }

  const nomeFirma = firmatarioOk(input.firmatario);
  const marketing =
    input.consensoMarketing === "presto" || input.consensoMarketing === "nego"
      ? input.consensoMarketing
      : null;
  if (documento === "privacy") {
    if (!nomeFirma) return { errore: "Indica nome e cognome di chi firma." };
    if (input.accettoInformativa !== true) {
      return { errore: "Per firmare serve accettare l'informativa privacy." };
    }
    if (!marketing) return { errore: "Scegli se prestare o negare il consenso." };
  }
  if (documento === "condizioni") {
    if (!nomeFirma) return { errore: "Indica nome e cognome di chi firma." };
    if (input.accettoCondizioni !== true) {
      return { errore: "Per firmare serve accettare le condizioni generali di vendita." };
    }
  }

  const firmataIl = new Date();
  const ip = input.ip.slice(0, 80) || "sconosciuto";
  const transazione = createHash("sha256")
    .update(`${row.id}|${documento}|${email}|${firmataIl.toISOString()}|${ip}|${otp.id}`)
    .digest("hex");
  const quando = quandoRoma(firmataIl);
  const timbro = `Firmato digitalmente via OTP | Mail: ${email} | Data e Ora: ${quando} | IP: ${ip} | Codice Transazione: ${transazione}`;
  const versione = row.versione + 1;
  const chiId = row.cliente_id || row.cliente_possibile_id || row.id;
  const fileName =
    documento === "privacy"
      ? "Informativa-Privacy-firmata.pdf"
      : (documento === "condizioni"
          ? "Condizioni-generali-di-vendita-firmate.pdf"
          : "Anagrafica-Aziendale-firmata.pdf");
  const suffisso =
    documento === "privacy" ? "privacy-otp" : (documento === "condizioni" ? "condizioni-otp" : "otp");
  const path = `${chiId}/anagrafica-richiesta/${row.id}-${suffisso}-${versione}.pdf`;
  const bytes =
    documento === "anagrafica"
      ? pdfAnagraficaAziendale(form, quando, timbro)
      : pdfPresaVisione({
          tipo: documento,
          dataFirma: dataRoma(firmataIl),
          firmatario: nomeFirma ?? "",
          consensoMarketing: (marketing ?? undefined) as ConsensoMarketing | undefined,
          timbro,
        });
  const upload = await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error) return { errore: "Archivio del PDF firmato non riuscito. Riprova." };

  const passo =
    documento === "anagrafica" ? "privacy" : (documento === "privacy" ? "condizioni" : "completato");
  const aggiornamento =
    documento === "anagrafica"
      ? {
          stato: "pdf_pronto",
          documento_stato: "approvato",
          passo,
          payload: form,
          firmato_storage_path: path,
          firmato_file_name: fileName,
          firmata_at: firmataIl.toISOString(),
          firma_email: email,
          firma_ip: ip,
          firma_hash: transazione,
          versione,
        }
      : (documento === "privacy"
        ? {
            passo,
            documento_stato: "approvato",
            privacy_firmatario: nomeFirma ?? "",
            privacy_accetto: true,
            privacy_consenso_marketing: marketing,
            privacy_firmata_at: firmataIl.toISOString(),
            privacy_firma_email: email,
            privacy_firma_ip: ip,
            privacy_firma_hash: transazione,
            privacy_storage_path: path,
            privacy_file_name: fileName,
            versione,
          }
        : {
            stato: "COMPLETED",
            documento_stato: "chiuso",
            passo,
            condizioni_firmatario: nomeFirma ?? "",
            condizioni_accetto: true,
            condizioni_firmata_at: firmataIl.toISOString(),
            condizioni_firma_email: email,
            condizioni_firma_ip: ip,
            condizioni_firma_hash: transazione,
            condizioni_storage_path: path,
            condizioni_file_name: fileName,
            versione,
          });
  const { data: chiusa, error } = await service
    .from("anagrafica_richieste")
    .update(aggiornamento)
    .eq("id", row.id)
    .eq("passo", documento === "anagrafica" ? "anagrafica" : documento)
    .select("id");
  if (error || !chiusa?.length) {
    return { errore: "La firma non è stata registrata. Riprova." };
  }

  await service
    .from("otp_verifications")
    .update({
      stato: documento === "condizioni" ? "usato" : "attivo",
      verificata_at: firmataIl.toISOString(),
      ip_richiesta: ip,
    })
    .eq("id", otp.id);
  await archiviaPdfCliente(
    { ...row, versione },
    path,
    fileName,
    bytes.length,
    documento === "privacy"
      ? "Informativa privacy firmata via OTP"
      : (documento === "condizioni"
          ? "Condizioni generali di vendita firmate via OTP"
          : "Anagrafica aziendale firmata via OTP"),
    "chiuso",
    "application/pdf",
    documento === "privacy"
      ? "informativa_privacy"
      : (documento === "condizioni" ? "condizioni_vendita" : "anagrafica_aziendale")
  );
  await service.from("audit_log").insert({
    entity_type: "anagrafica_richieste",
    entity_id: row.id,
    action: "status_change",
    actor_id: null,
    summary:
      documento === "anagrafica"
        ? "Anagrafica firmata via OTP. Si passa all'informativa privacy."
        : (documento === "privacy"
            ? "Informativa privacy firmata via OTP. Si passa alle condizioni di vendita."
            : "Condizioni di vendita firmate via OTP. Procedura chiusa."),
    payload: {
      otp_id: otp.id,
      documento,
      passo,
      firma_hash: transazione,
      storage_path: path,
    },
  });
  return { fileName, passo };
}

async function copiaPresaVisione(
  row: RichiestaAnagrafica,
  documento: "privacy" | "condizioni"
): Promise<{ bytes: Buffer; fileName: string; mime: string } | { errore: string }> {
  const path = String(
    documento === "privacy" ? row.privacy_storage_path : row.condizioni_storage_path
  );
  const quandoIso =
    documento === "privacy" ? row.privacy_firmata_at : row.condizioni_firmata_at;
  const emailFirma = String(
    documento === "privacy" ? row.privacy_firma_email : row.condizioni_firma_email
  );
  const hash = String(
    documento === "privacy" ? row.privacy_firma_hash : row.condizioni_firma_hash
  );
  const nome = String(
    documento === "privacy" ? row.privacy_firmatario : row.condizioni_firmatario
  );
  const fileName =
    documento === "privacy"
      ? "Informativa-Privacy-firmata.pdf"
      : "Condizioni-generali-di-vendita-firmate.pdf";
  if (!path || !quandoIso || !emailFirma || !hash || !nome) {
    return { errore: "La copia firmata non è ancora disponibile." };
  }
  const quandoData = new Date(quandoIso);
  const ip =
    String(documento === "privacy" ? row.privacy_firma_ip : row.condizioni_firma_ip) ||
    "sconosciuto";
  const timbro = `Firmato digitalmente via OTP | Mail: ${emailFirma} | Data e Ora: ${quandoRoma(quandoData)} | IP: ${ip} | Codice Transazione: ${hash}`;
  const marketing = row.privacy_consenso_marketing === "nego" ? "nego" : "presto";
  const bytes = pdfPresaVisione({
    tipo: documento,
    dataFirma: dataRoma(quandoData),
    firmatario: nome,
    consensoMarketing: documento === "privacy" ? marketing : undefined,
    timbro,
  });
  const service = createServiceClient();
  await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  return { bytes, fileName, mime: "application/pdf" };
}

export async function leggiCopiaFirmata(
  token: string,
  documentoGrezzo?: string | null
): Promise<{ bytes: Buffer; fileName: string; mime: string } | { errore: string }> {
  const documento = documentoFirmaDi(documentoGrezzo);
  const row = await caricaRichiestaToken(token);
  if ("errore" in row) return row;
  if (documento === "privacy" || documento === "condizioni") {
    return copiaPresaVisione(row, documento);
  }
  if (!row.firmato_storage_path) {
    return { errore: "La copia firmata non è ancora disponibile." };
  }
  const path = String(row.firmato_storage_path ?? "");
  if (!path) return { errore: "La copia firmata non è ancora disponibile." };
  const service = createServiceClient();
  const fileName = String(row.firmato_file_name ?? "Anagrafica-Aziendale-firmata.pdf");
  const hash = String(row.firma_hash ?? "");
  const emailFirma = String(row.firma_email ?? "");
  if (path.includes("-otp-") && hash && emailFirma && row.firmata_at) {
    const quando = quandoRoma(new Date(row.firmata_at));
    const ip = String(row.firma_ip ?? "") || "sconosciuto";
    const timbro = `Firmato digitalmente via OTP | Mail: ${emailFirma} | Data e Ora: ${quando} | IP: ${ip} | Codice Transazione: ${hash}`;
    const bytes = pdfAnagraficaAziendale(normalizzaForm(row.payload), quando, timbro);
    await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    return { bytes, fileName: "Anagrafica-Aziendale-firmata.pdf", mime: "application/pdf" };
  }
  const scaricato = await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).download(path);
  if (scaricato.error || !scaricato.data) {
    return { errore: "Copia firmata non leggibile. Riprova." };
  }
  const bytes = Buffer.from(await scaricato.data.arrayBuffer());
  const mime = fileName.endsWith(".png")
    ? "image/png"
    : (fileName.endsWith(".jpg") ? "image/jpeg" : "application/pdf");
  return { bytes, fileName, mime };
}
