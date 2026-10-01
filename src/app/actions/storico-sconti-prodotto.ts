"use server";

import { z } from "zod";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  aziendaTipo: z.enum(["cliente", "cliente_possibile"]),
  aziendaId: z.string().uuid(),
  prodottoCodice: z.string().trim().min(1),
  escludiPreventivoId: z.string().uuid().nullable().optional(),
});

export type StoricoScontoVoce = {
  id: string;
  origine: "preventivo" | "ordine";
  numero: string;
  data: string;
  stato: string;
  scontoListinoPct: number;
  scontoExtraPct: number;
  prezzoUnitario: number;
  unitaMisura: string;
};

const STATO_PREVENTIVO: Record<string, string> = {
  creato: "Bozza",
  in_attesa_spedizione: "In attesa spedizione",
  inviato: "Inviato",
  accettato: "Accettato",
  respinto: "Respinto",
};

const STATO_ORDINE: Record<string, string> = {
  in_attesa: "In attesa",
  sospeso: "Sospeso",
  in_scaletta: "In scaletta",
  pronto_spedizione: "Pronto spedizione",
  inviato: "Inviato",
  storico: "Storico",
  ricevuto: "Ricevuto",
  evaso: "Evaso",
};

function haSconto(listino: number, extra: number) {
  return listino > 0.0001 || extra > 0.0001;
}

export async function listStoricoScontiProdottoAction(
  raw: unknown
): Promise<
  { success: true; voci: StoricoScontoVoce[] } | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const { aziendaTipo, aziendaId, prodottoCodice, escludiPreventivoId } =
    parsed.data;
  const supabase = await createClient();

  const clienti = new Set<string>();
  const possibili = new Set<string>();
  if (aziendaTipo === "cliente") {
    clienti.add(aziendaId);
    const { data } = await supabase
      .from("clienti_possibili")
      .select("id")
      .eq("cliente_id", aziendaId)
      .is("deleted_at", null);
    for (const row of data ?? []) possibili.add(String(row.id));
  } else {
    possibili.add(aziendaId);
    const { data } = await supabase
      .from("clienti_possibili")
      .select("cliente_id")
      .eq("id", aziendaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data?.cliente_id) clienti.add(String(data.cliente_id));
  }

  const orParti = [
    clienti.size ? `cliente_id.in.(${[...clienti].join(",")})` : "",
    possibili.size
      ? `cliente_possibile_id.in.(${[...possibili].join(",")})`
      : "",
  ].filter(Boolean);
  if (!orParti.length) return { success: true, voci: [] };
  const filtroAzienda = orParti.join(",");

  const { data: preventivi, error: prevErr } = await supabase
    .from("preventivi")
    .select("id, numero_interno, data_preventivo, stato")
    .or(filtroAzienda)
    .is("deleted_at", null)
    .order("data_preventivo", { ascending: false })
    .limit(40);
  if (prevErr) return { success: false, error: prevErr.message };

  const prevIds = (preventivi ?? [])
    .map((row) => String(row.id))
    .filter((id) => id !== escludiPreventivoId);
  const prevById = new Map(
    (preventivi ?? []).map((row) => [String(row.id), row])
  );

  const { data: ordini, error: ordErr } = await supabase
    .from("ordini")
    .select(
      "id, numero_interno, data_ordine, stato, tipo, sconto_extra_pct, prezzo_listino_unitario"
    )
    .or(filtroAzienda)
    .is("deleted_at", null)
    .order("data_ordine", { ascending: false })
    .limit(40);
  if (ordErr) return { success: false, error: ordErr.message };

  const ordiniVendita = (ordini ?? []).filter(
    (row) => String(row.tipo ?? "vendita") !== "campionatura"
  );
  const ordById = new Map(ordiniVendita.map((row) => [String(row.id), row]));

  const voci: StoricoScontoVoce[] = [];

  if (prevIds.length) {
    const { data: righe, error } = await supabase
      .from("preventivi_righe")
      .select(
        "id, preventivo_id, sconto_listino_pct, sconto_extra_pct, prezzo_unitario, unita_misura, prodotto_codice"
      )
      .in("preventivo_id", prevIds)
      .eq("prodotto_codice", prodottoCodice);
    if (error) return { success: false, error: error.message };
    for (const riga of righe ?? []) {
      const header = prevById.get(String(riga.preventivo_id));
      if (!header) continue;
      const listino = Number(riga.sconto_listino_pct ?? 0);
      const extra = Number(riga.sconto_extra_pct ?? 0);
      if (!haSconto(listino, extra)) continue;
      const stato = String(header.stato ?? "");
      voci.push({
        id: `preventivo:${riga.id}`,
        origine: "preventivo",
        numero: String(header.numero_interno ?? ""),
        data: String(header.data_preventivo ?? ""),
        stato: STATO_PREVENTIVO[stato] ?? stato,
        scontoListinoPct: listino,
        scontoExtraPct: extra,
        prezzoUnitario: Number(riga.prezzo_unitario ?? 0),
        unitaMisura: String(riga.unita_misura ?? "kg"),
      });
    }
  }

  const ordIds = [...ordById.keys()];
  if (ordIds.length) {
    const { data: righe, error } = await supabase
      .from("ordini_righe")
      .select("id, ordine_id, prezzo_unitario, unita_misura, prodotto_codice")
      .in("ordine_id", ordIds)
      .eq("prodotto_codice", prodottoCodice);
    if (error) return { success: false, error: error.message };
    for (const riga of righe ?? []) {
      const header = ordById.get(String(riga.ordine_id));
      if (!header) continue;
      const extra = Number(header.sconto_extra_pct ?? 0);
      if (!haSconto(0, extra)) continue;
      const stato = String(header.stato ?? "");
      voci.push({
        id: `ordine:${riga.id}`,
        origine: "ordine",
        numero: String(header.numero_interno ?? ""),
        data: String(header.data_ordine ?? ""),
        stato: STATO_ORDINE[stato] ?? stato,
        scontoListinoPct: 0,
        scontoExtraPct: extra,
        prezzoUnitario: Number(
          header.prezzo_listino_unitario ?? riga.prezzo_unitario ?? 0
        ),
        unitaMisura: String(riga.unita_misura ?? "kg"),
      });
    }
  }

  voci.sort((a, b) => b.data.localeCompare(a.data));
  return { success: true, voci: voci.slice(0, 12) };
}
