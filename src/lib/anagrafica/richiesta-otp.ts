import { createHash, randomInt, timingSafeEqual } from "crypto";
import { ANAGRAFICA_DOCUMENTI_BUCKET } from "@/lib/amministrazione/anagrafica-documenti";
import {
  emailAnagraficaValida,
  emailRegistrateAnagrafica,
  erroriPdf,
  normalizzaForm,
} from "@/lib/anagrafica/richiesta-form";
import { pdfAnagraficaAziendale } from "@/lib/anagrafica/richiesta-pdf";
import {
  archiviaPdfCliente,
  caricaRichiestaToken,
  type RichiestaAnagrafica,
} from "@/lib/anagrafica/richiesta-db";
import { createServiceClient } from "@/lib/supabase/service";
import { sendMailViaAccount, type AccountRow } from "@/lib/webmail/sync";

const MINUTI = 5;
const TENTATIVI = 5;
const ATTESA_NUOVO_MS = 60_000;

function hashCodice(richiestaId: string, codice: string): string {
  return createHash("sha256").update(`${richiestaId}:${codice}`).digest("hex");
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

async function casellaInvio(): Promise<AccountRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("webmail_accounts")
    .select(
      "id, email_address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_encrypted"
    )
    .is("deleted_at", null)
    .limit(8);
  if (error) return null;
  return (
    ((data ?? []) as AccountRow[]).find(
      (riga) => riga.smtp_host && riga.password_encrypted
    ) ?? null
  );
}

function apribile(row: RichiestaAnagrafica): string | null {
  if (row.stato === "COMPLETED" || row.stato === "firmata") {
    return "Questa richiesta è già firmata.";
  }
  if (row.stato !== "compilazione" && row.stato !== "pdf_pronto") {
    return "Il link non è più valido.";
  }
  return null;
}

function emailScelta(row: RichiestaAnagrafica, email: string): string | null {
  const form = normalizzaForm(row.payload);
  const registrate = emailRegistrateAnagrafica(String(row.email_destinatario ?? ""), form);
  return (
    registrate.find((voce) => voce.toLowerCase() === email.trim().toLowerCase()) ?? null
  );
}

export async function richiediOtpFirma(input: {
  token: string;
  email: string;
  ip: string;
}): Promise<{ scadeAt: string } | { errore: string }> {
  if (!emailAnagraficaValida(input.email)) {
    return { errore: "Indica un'e-mail valida." };
  }
  const row = await caricaRichiestaToken(input.token);
  if ("errore" in row) return row;
  const blocco = apribile(row);
  if (blocco) return { errore: blocco };
  const form = normalizzaForm(row.payload);
  const mancanti = erroriPdf(form);
  if (mancanti.length) {
    return { errore: mancanti[0] ?? "Per firmare mancano dei dati." };
  }
  const email = emailScelta(row, input.email);
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
    .select("id, scade_at, created_at, stato")
    .eq("richiesta_id", row.id)
    .eq("stato", "attivo")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recente?.created_at) {
    const nato = Date.parse(String(recente.created_at));
    if (Number.isFinite(nato) && ora - nato < ATTESA_NUOVO_MS && Date.parse(String(recente.scade_at)) > ora) {
      return { scadeAt: String(recente.scade_at) };
    }
  }
  await service
    .from("otp_verifications")
    .update({ stato: "annullato", updated_at: new Date().toISOString() })
    .eq("richiesta_id", row.id)
    .eq("stato", "attivo")
    .is("deleted_at", null);

  const codice = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const scade = new Date(ora + MINUTI * 60_000);
  const { data: creato, error } = await service
    .from("otp_verifications")
    .insert({
      richiesta_id: row.id,
      email,
      codice_hash: hashCodice(row.id, codice),
      stato: "attivo",
      scade_at: scade.toISOString(),
      ip_richiesta: input.ip.slice(0, 80),
    })
    .select("id")
    .single();
  if (error || !creato) {
    return { errore: "Il codice non è stato preparato. Riprova." };
  }
  const account = await casellaInvio();
  if (!account) {
    await service
      .from("otp_verifications")
      .update({ stato: "annullato" })
      .eq("id", creato.id);
    return { errore: "Nessuna casella con SMTP. Il codice non è stato inviato." };
  }
  try {
    await sendMailViaAccount({
      account,
      to: email,
      subject: "Codice per firmare l'anagrafica aziendale",
      text: [
        "Il codice per firmare l'anagrafica aziendale è:",
        "",
        codice,
        "",
        "Vale 5 minuti e si usa una sola volta.",
        "Se non avete chiesto voi il codice, ignorate questa mail.",
      ].join("\n"),
    });
  } catch {
    await service
      .from("otp_verifications")
      .update({ stato: "annullato" })
      .eq("id", creato.id);
    return { errore: "Invio del codice non riuscito. Riprova." };
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
}): Promise<{ fileName: string } | { errore: string }> {
  if (!/^\d{6}$/.test(input.codice)) {
    return { errore: "Il codice è di 6 cifre." };
  }
  const row = await caricaRichiestaToken(input.token);
  if ("errore" in row) return row;
  const blocco = apribile(row);
  if (blocco) return { errore: blocco };
  const email = emailScelta(row, input.email);
  if (!email) {
    return { errore: "Questa e-mail non è registrata per la firma." };
  }
  const form = normalizzaForm(row.payload);
  const mancanti = erroriPdf(form);
  if (mancanti.length) return { errore: mancanti[0] ?? "Per firmare mancano dei dati." };

  const service = createServiceClient();
  const { data: otpData } = await service
    .from("otp_verifications")
    .select("id, codice_hash, scade_at, tentativi, stato, email")
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
  } | null;
  if (!otp) return { errore: "Richiedi un nuovo codice." };
  if (otp.email.toLowerCase() !== email.toLowerCase()) {
    return { errore: "Il codice è stato inviato a un'altra e-mail registrata." };
  }
  if (Date.parse(otp.scade_at) <= Date.now()) {
    await service.from("otp_verifications").update({ stato: "scaduto" }).eq("id", otp.id);
    return { errore: "Il codice è scaduto. Richiedine uno nuovo." };
  }
  if (!hashUguale(otp.codice_hash, hashCodice(row.id, input.codice))) {
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

  const firmataIl = new Date();
  const ip = input.ip.slice(0, 80) || "sconosciuto";
  const transazione = createHash("sha256")
    .update(`${row.id}|${email}|${firmataIl.toISOString()}|${ip}|${otp.id}`)
    .digest("hex");
  const timbro = `Firmato digitalmente via OTP | Mail: ${email} | Data e Ora: ${quandoRoma(firmataIl)} | IP: ${ip} | Codice Transazione: ${transazione}`;
  const bytes = pdfAnagraficaAziendale(form, quandoRoma(firmataIl), timbro);
  const versione = row.versione + 1;
  const chiId = row.cliente_id || row.cliente_possibile_id || row.id;
  const fileName = "Anagrafica-Aziendale-firmata.pdf";
  const path = `${chiId}/anagrafica-richiesta/${row.id}-otp-${versione}.pdf`;
  const upload = await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error) return { errore: "Archivio del PDF firmato non riuscito. Riprova." };

  const { data: chiusa, error } = await service
    .from("anagrafica_richieste")
    .update({
      stato: "COMPLETED",
      documento_stato: "chiuso",
      payload: form,
      firmato_storage_path: path,
      firmato_file_name: fileName,
      firmata_at: firmataIl.toISOString(),
      firma_email: email,
      firma_ip: ip,
      firma_hash: transazione,
      versione,
    })
    .eq("id", row.id)
    .in("stato", ["compilazione", "pdf_pronto"])
    .select("id");
  if (error || !chiusa?.length) {
    return { errore: "La firma non è stata registrata. Riprova." };
  }

  await service
    .from("otp_verifications")
    .update({
      stato: "usato",
      verificata_at: firmataIl.toISOString(),
      ip_richiesta: ip,
    })
    .eq("id", otp.id);
  await archiviaPdfCliente(
    { ...row, versione },
    path,
    fileName,
    bytes.length,
    "Anagrafica aziendale firmata via OTP",
    "chiuso",
    "application/pdf"
  );
  await service.from("audit_log").insert({
    entity_type: "anagrafica_richieste",
    entity_id: row.id,
    action: "status_change",
    actor_id: null,
    summary: "Anagrafica firmata via OTP. Stato COMPLETED.",
    payload: {
      otp_id: otp.id,
      firma_hash: transazione,
      storage_path: path,
    },
  });
  return { fileName };
}

export async function leggiCopiaFirmata(
  token: string
): Promise<{ bytes: Buffer; fileName: string; mime: string } | { errore: string }> {
  const row = await caricaRichiestaToken(token);
  if ("errore" in row) return row;
  if (row.stato !== "COMPLETED" && row.stato !== "firmata") {
    return { errore: "La copia firmata non è ancora disponibile." };
  }
  const path = String(row.firmato_storage_path ?? "");
  if (!path) return { errore: "La copia firmata non è ancora disponibile." };
  const service = createServiceClient();
  const scaricato = await service.storage.from(ANAGRAFICA_DOCUMENTI_BUCKET).download(path);
  if (scaricato.error || !scaricato.data) {
    return { errore: "Copia firmata non leggibile. Riprova." };
  }
  const bytes = Buffer.from(await scaricato.data.arrayBuffer());
  const fileName = String(row.firmato_file_name ?? "Anagrafica-Aziendale-firmata.pdf");
  const mime = fileName.endsWith(".png")
    ? "image/png"
    : (fileName.endsWith(".jpg") ? "image/jpeg" : "application/pdf");
  return { bytes, fileName, mime };
}
