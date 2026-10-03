"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  caricaFattureNote,
  intervalloAnnoMailFatture,
  scanFattureMailDopoSync,
} from "@/lib/amministrazione/fatture-mail-coda";
import {
  caselleFattureMancanti,
  trovaFatturaGiaPresente,
} from "@/lib/amministrazione/fatture-mail-scan";
import { type TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export type FatturaMailCandidato = {
  id: string;
  casellaEmail: string;
  oggetto: string;
  dataMail: string;
  mittente: string;
  numeroDocumento: string;
  dataDocumento: string;
  fornitoreRagione: string;
  fornitorePiva: string;
  fornitoreId: string | null;
  totale: number | null;
  fileName: string;
  anno: number;
  trimestre: TrimestreNumero;
};

const idSchema = z.object({ id: z.string().uuid() });

async function requireSuperadmin() {
  const auth = await getAuthContext();
  if (!auth || auth.impersonating || !isSuperadminProfile(auth.profile)) {
    return null;
  }
  return auth;
}

type CandidatoRow = {
  id: string;
  casella_email: string;
  oggetto: string;
  data_mail: string | null;
  mittente_nome: string;
  mittente_email: string;
  numero_documento: string;
  data_documento: string | null;
  fornitore_ragione: string;
  fornitore_piva: string;
  totale: number | null;
  file_name: string;
  anno: number;
  trimestre: number;
  chiave_fattura: string;
};

async function segnaGemelle(
  chiave: string,
  tranneId: string,
  patch: Record<string, unknown>
) {
  if (!chiave) return;
  const supabase = createServiceClient();
  await supabase
    .from("fatture_mail_candidati")
    .update(patch)
    .eq("chiave_fattura", chiave)
    .neq("id", tranneId)
    .eq("stato", "da_valutare")
    .is("deleted_at", null);
}

export async function listFattureMailDaValutareAction(): Promise<
  | {
      success: true;
      candidati: FatturaMailCandidato[];
      caselleMancanti: string[];
      periodo: string;
      restano: boolean;
      controllati: number;
    }
  | { success: false; error: string }
> {
  const auth = await requireSuperadmin();
  if (!auth) {
    return {
      success: true,
      candidati: [],
      caselleMancanti: [],
      periodo: "",
      restano: false,
      controllati: 0,
    };
  }

  const annoMail = intervalloAnnoMailFatture();
  const supabase = createServiceClient();
  const scan = await scanFattureMailDopoSync(supabase, {
    backlog: true,
    dal: annoMail.dal,
    al: annoMail.al,
    limite: 40,
    maxAllegati: 8,
  });

  const { data: accounts, error: accErr } = await supabase
    .from("webmail_accounts")
    .select("email_address")
    .is("deleted_at", null);
  if (accErr) return { success: false, error: accErr.message };

  const { data, error } = await supabase
    .from("fatture_mail_candidati")
    .select(
      "id, casella_email, oggetto, data_mail, mittente_nome, mittente_email, numero_documento, data_documento, fornitore_ragione, fornitore_piva, totale, file_name, anno, trimestre, chiave_fattura"
    )
    .eq("anno", annoMail.anno)
    .eq("stato", "da_valutare")
    .is("copia_di", null)
    .is("deleted_at", null)
    .order("data_mail", { ascending: false });
  if (error) {
    if (/fatture_mail_candidati|schema cache|does not exist/i.test(error.message)) {
      return {
        success: true,
        candidati: [],
        caselleMancanti: [],
        periodo: String(annoMail.anno),
        restano: false,
        controllati: 0,
      };
    }
    return { success: false, error: error.message };
  }

  const rows = (data ?? []) as CandidatoRow[];
  const note = await caricaFattureNote(supabase, annoMail.dal, annoMail.al);
  const ancora: CandidatoRow[] = [];
  for (const row of rows) {
    const gia = trovaFatturaGiaPresente(
      {
        numero: row.numero_documento,
        piva: row.fornitore_piva,
        totale: row.totale == null ? null : Number(row.totale),
        data: String(row.data_documento ?? "").slice(0, 10),
      },
      note
    );
    if (!gia) {
      ancora.push(row);
      continue;
    }
    const motivo =
      gia.fonte === "sdi" ? "Già presente nello SDI" : "Già registrata";
    const patch = {
      stato: "gia_presente",
      documento_stato: "Chiuso",
      motivo_match: motivo,
      fattura_ricevuta_id: gia.fonte === "registrata" ? gia.id : null,
      decided_at: new Date().toISOString(),
      updated_by: auth.userId,
    };
    await supabase.from("fatture_mail_candidati").update(patch).eq("id", row.id);
    await segnaGemelle(row.chiave_fattura, row.id, {
      ...patch,
      motivo_match: "Copia cortesia della stessa fattura",
      copia_di: row.id,
    });
  }

  const pive = [
    ...new Set(ancora.map((r) => r.fornitore_piva.trim()).filter(Boolean)),
  ];
  const fornitori = pive.length
    ? await supabase
        .from("fornitori")
        .select("id, partita_iva, ragione_sociale")
        .is("deleted_at", null)
        .in("partita_iva", pive)
    : { data: [] };
  const fornitoreDi = new Map(
    (
      (fornitori.data ?? []) as {
        id: string;
        partita_iva: string;
        ragione_sociale: string;
      }[]
    ).map((f) => [f.partita_iva.trim().toUpperCase(), f])
  );

  return {
    success: true,
    periodo: String(annoMail.anno),
    restano: scan.restano,
    controllati: scan.controllati,
    caselleMancanti: caselleFattureMancanti(
      ((accounts ?? []) as { email_address: string }[]).map(
        (a) => a.email_address
      )
    ),
    candidati: ancora.map((row) => {
      const fornitore = fornitoreDi.get(row.fornitore_piva.trim().toUpperCase());
      return {
        id: row.id,
        casellaEmail: row.casella_email,
        oggetto: row.oggetto,
        dataMail: row.data_mail ? row.data_mail.slice(0, 10) : "",
        mittente: row.mittente_nome || row.mittente_email,
        numeroDocumento: row.numero_documento,
        dataDocumento: String(row.data_documento ?? "").slice(0, 10),
        fornitoreRagione: row.fornitore_ragione || fornitore?.ragione_sociale || "",
        fornitorePiva: row.fornitore_piva,
        fornitoreId: fornitore?.id ?? null,
        totale: row.totale == null ? null : Number(row.totale),
        fileName: row.file_name,
        anno: row.anno,
        trimestre: row.trimestre as TrimestreNumero,
      };
    }),
  };
}

export async function decidiFatturaMailAction(raw: {
  id: string;
  esito: "ignorata" | "gia_presente" | "registrata";
  fatturaRicevutaId?: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireSuperadmin();
  if (!auth) {
    return { success: false, error: "Solo il superAdmin può decidere queste fatture." };
  }
  const parsed = idSchema.safeParse({ id: raw.id });
  if (!parsed.success || !["ignorata", "gia_presente", "registrata"].includes(raw.esito)) {
    return { success: false, error: "Decisione non valida." };
  }
  if (raw.esito === "registrata" && !raw.fatturaRicevutaId) {
    return { success: false, error: "Manca la fattura registrata." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fatture_mail_candidati")
    .select("id, chiave_fattura, numero_documento, stato")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Fattura da mail non trovata." };
  }
  const row = data as {
    id: string;
    chiave_fattura: string;
    numero_documento: string;
    stato: string;
  };
  if (row.stato !== "da_valutare") {
    return { success: true };
  }

  const now = new Date().toISOString();
  const stato = raw.esito === "registrata" ? "registrata" : raw.esito;
  const patch = {
    stato,
    documento_stato: stato === "registrata" ? "Approvato" : "Chiuso",
    motivo_match:
      stato === "ignorata"
        ? "Il superAdmin ha scelto di non registrarla"
        : (stato === "gia_presente"
          ? "Il superAdmin ha confermato che è già nel sistema"
          : "Registrata dal superAdmin"),
    fattura_ricevuta_id: raw.fatturaRicevutaId ?? null,
    decided_by: auth.userId,
    decided_at: now,
    updated_by: auth.userId,
    versione: 2,
  };
  const { error: updErr } = await supabase
    .from("fatture_mail_candidati")
    .update(patch)
    .eq("id", row.id)
    .eq("stato", "da_valutare");
  if (updErr) return { success: false, error: updErr.message };

  await segnaGemelle(row.chiave_fattura, row.id, {
    stato: stato === "registrata" ? "gia_presente" : stato,
    documento_stato: "Chiuso",
    motivo_match: "Copia cortesia della stessa fattura",
    fattura_ricevuta_id: raw.fatturaRicevutaId ?? null,
    copia_di: row.id,
    decided_by: auth.userId,
    decided_at: now,
    updated_by: auth.userId,
  });

  await writeAuditLog({
    entity_type: "fatture_mail_candidati",
    entity_id: row.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Fattura da mail ${row.numero_documento || "senza numero"}: ${stato}`,
    payload: { stato, fattura_ricevuta_id: raw.fatturaRicevutaId ?? null },
  });
  return { success: true };
}
