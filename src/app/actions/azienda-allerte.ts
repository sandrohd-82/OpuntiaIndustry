"use server";

import {
  normalizeCanaleEmail,
  normalizeCanaleTelefono,
  parseCanaleEmailList,
} from "@/lib/amministrazione/contatto-canale-attenzione";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const tipoSchema = z.enum(["cliente", "cliente_possibile", "fornitore"]);

const inputSchema = z.object({
  aziende: z
    .array(z.object({ tipo: tipoSchema, id: z.string().uuid() }))
    .max(8)
    .optional()
    .default([]),
  emails: z.array(z.string().max(500)).max(12).optional().default([]),
  telefoni: z.array(z.string().max(80)).max(12).optional().default([]),
});

export type AziendaAllertaNota = { id: string; titolo: string; testo: string };
export type AziendaAllertaAvviso = {
  id: string;
  canale: string;
  valore: string;
  testo: string;
};
export type AziendaAllerta = {
  tipo: "cliente" | "cliente_possibile" | "fornitore";
  id: string;
  etichetta: string;
  note: AziendaAllertaNota[];
  avvisi: AziendaAllertaAvviso[];
};

type Chiave = `${AziendaAllerta["tipo"]}:${string}`;

type Scheda = {
  tipo: AziendaAllerta["tipo"];
  id: string;
  etichetta: string;
  emails: string[];
  telefoni: string[];
};

function chiave(tipo: AziendaAllerta["tipo"], id: string): Chiave {
  return `${tipo}:${id}`;
}

function etichettaDi(targa: string, nome: string): string {
  const codice = targa.trim();
  const ragione = nome.trim();
  if (codice && ragione) return `${codice} · ${ragione}`;
  return codice || ragione || "Azienda";
}

function aggiungiMail(dest: Set<string>, raw: string) {
  for (const mail of parseCanaleEmailList(raw)) dest.add(mail);
}

function aggiungiTel(dest: Set<string>, raw: string) {
  const tel = normalizeCanaleTelefono(raw);
  if (tel) dest.add(tel);
}

export async function listAllerteAziendaAction(raw: unknown): Promise<
  { success: true; aziende: AziendaAllerta[] } | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.userId || !auth.isSecondFactorVerified) {
    return { success: true, aziende: [] };
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { success: true, aziende: [] };

  const emails = [
    ...new Set(
      parsed.data.emails.flatMap((value) => parseCanaleEmailList(value))
    ),
  ];
  const telefoni = [
    ...new Set(
      parsed.data.telefoni
        .map((value) => normalizeCanaleTelefono(value))
        .filter(Boolean)
    ),
  ];
  if (
    parsed.data.aziende.length === 0 &&
    emails.length === 0 &&
    telefoni.length === 0
  ) {
    return { success: true, aziende: [] };
  }

  const supabase = await createClient();
  const schede = new Map<Chiave, Scheda>();

  function ricorda(
    tipo: AziendaAllerta["tipo"],
    id: string,
    targa: string,
    nome: string
  ) {
    const key = chiave(tipo, id);
    if (schede.has(key)) return;
    schede.set(key, {
      tipo,
      id,
      etichetta: etichettaDi(targa, nome),
      emails: [],
      telefoni: [],
    });
  }

  const rpc = await supabase.rpc("allerte_schede_anagrafica", {
    p_aziende: parsed.data.aziende,
    p_emails: emails,
  });
  const daFunzione = !rpc.error && Array.isArray(rpc.data);
  if (daFunzione) {
    for (const row of rpc.data as Array<Record<string, unknown>>) {
      const tipo = tipoSchema.safeParse(row.tipo);
      const id = String(row.id ?? "");
      if (!tipo.success || !id) continue;
      ricorda(
        tipo.data,
        id,
        String(row.codice_targa ?? ""),
        String(row.ragione_sociale ?? "")
      );
      const scheda = schede.get(chiave(tipo.data, id));
      if (!scheda) continue;
      const mailSet = new Set<string>();
      const mailGrezze = Array.isArray(row.emails) ? row.emails : [];
      for (const mail of mailGrezze) aggiungiMail(mailSet, String(mail));
      scheda.emails = [...mailSet];
      const telSet = new Set<string>();
      const telGrezzi = Array.isArray(row.telefoni) ? row.telefoni : [];
      for (const tel of telGrezzi) aggiungiTel(telSet, String(tel));
      scheda.telefoni = [...telSet];
      const interna = String(row.note_interne ?? "").trim();
      if (interna) {
        (scheda as Scheda & { interna?: string }).interna = interna;
      }
    }
  }

  if (schede.size === 0) return { success: true, aziende: [] };

  const ids = [...schede.values()].map((s) => s.id);
  const { data: noteRows } = await supabase
    .from("pn_note")
    .select("id, titolo, body, entity_type, entity_id")
    .in("entity_id", ids)
    .eq("stato", "attiva")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const notePer = new Map<Chiave, AziendaAllertaNota[]>();
  for (const row of noteRows ?? []) {
    const tipo = tipoSchema.safeParse(row.entity_type);
    if (!tipo.success || !row.entity_id) continue;
    const key = chiave(tipo.data, String(row.entity_id));
    if (!schede.has(key)) continue;
    const lista = notePer.get(key) ?? [];
    lista.push({
      id: String(row.id),
      titolo: (String(row.titolo ?? "").trim()) || "Nota",
      testo: String(row.body ?? "").trim(),
    });
    notePer.set(key, lista);
  }

  const tutteMail = [...new Set([...schede.values()].flatMap((s) => s.emails))];
  const tuttiTel = [...new Set([...schede.values()].flatMap((s) => s.telefoni))];
  const avvisi: AziendaAllertaAvviso[] = [];
  if (tutteMail.length > 0) {
    const { data } = await supabase
      .from("contatto_canale_attenzioni")
      .select("id, canale, valore_normalizzato, valore_display, clausola")
      .eq("canale", "email")
      .in("valore_normalizzato", tutteMail)
      .is("deleted_at", null);
    for (const row of data ?? []) {
      avvisi.push({
        id: String(row.id),
        canale: "Mail",
        valore: String(row.valore_display || row.valore_normalizzato),
        testo: String(row.clausola ?? ""),
      });
    }
  }
  if (tuttiTel.length > 0) {
    const { data } = await supabase
      .from("contatto_canale_attenzioni")
      .select("id, canale, valore_normalizzato, valore_display, clausola")
      .eq("canale", "telefono")
      .in("valore_normalizzato", tuttiTel)
      .is("deleted_at", null);
    for (const row of data ?? []) {
      avvisi.push({
        id: String(row.id),
        canale: "Telefono",
        valore: String(row.valore_display || row.valore_normalizzato),
        testo: String(row.clausola ?? ""),
      });
    }
  }

  const aziende: AziendaAllerta[] = [];
  for (const scheda of schede.values()) {
    const key = chiave(scheda.tipo, scheda.id);
    const note = notePer.get(key) ?? [];
    const interna = (scheda as Scheda & { interna?: string }).interna;
    if (interna) {
      note.unshift({ id: `interna-${scheda.id}`, titolo: "Note interne", testo: interna });
    }
    if (note.length === 0) continue;
    const mail = new Set(scheda.emails);
    const tel = new Set(scheda.telefoni);
    aziende.push({
      tipo: scheda.tipo,
      id: scheda.id,
      etichetta: scheda.etichetta,
      note,
      avvisi: avvisi.filter((avviso) => {
        const valore = avviso.canale === "Mail"
          ? normalizeCanaleEmail(avviso.valore)
          : normalizeCanaleTelefono(avviso.valore);
        return avviso.canale === "Mail" ? mail.has(valore) : tel.has(valore);
      }),
    });
  }

  return { success: true, aziende };
}
