"use server";

import { z } from "zod";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { protocolloMacchinaProva } from "@/lib/produzione/ciclo-prova";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

type Errore = { success: false; error: string };

export type PrelievoCiclo = {
  movimentoId: string;
  lottoMp: string;
  quantita: number;
  unita: string;
  quando: string;
};

export type FoglioCiclo = {
  id: string;
  codice: string;
  prodotto: string;
  stato: string;
  startedAt: string;
  expectedEndAt: string;
  closedAt: string | null;
  lottoUscita: string | null;
  prelievi: PrelievoCiclo[];
  bilancio: {
    versati: number;
    ottenuti: number;
    nonConformi: number;
    esito: string;
  } | null;
};

export type MacchinaCiclo = {
  id: string;
  codice: string;
  nome: string;
  stato: string;
  nota: string;
  iot: boolean;
  deviceCode: string | null;
  deviceStato: string | null;
  telemetria: string | null;
  conferma: string | null;
};

export type AssociazioneProva = {
  id: string;
  foglioId: string;
  macchinarioId: string;
  protocollo: string;
};

export type ImpegnoCiclo = {
  id: string;
  giorno: string;
  etichetta: string;
  linea: string | null;
  foglioId: string | null;
};

export type CoefficienteResa = {
  linea: string;
  stagione: string;
  meseDa: number;
  meseA: number;
  minimo: number;
  massimo: number;
  media: number;
};

export type OperatoreRegistrato = {
  nome: string;
  azione: string;
  quando: string;
};

function oggiIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function listaCicloProduzioneAction(): Promise<
  | {
      success: true;
      fogli: FoglioCiclo[];
      macchine: MacchinaCiclo[];
      associazioni: AssociazioneProva[];
      impegni: ImpegnoCiclo[];
      operatori: OperatoreRegistrato[];
      coefficienti: CoefficienteResa[];
      mese: number;
    }
  | Errore
> {
  await requireAnyAreaAccess(["produzione", "magazzino"]);
  const supabase = await createClient();
  const { data: righe, error } = await supabase
    .from("produzione_foglio_ciclo")
    .select(
      "foglio_id, foglio_codice, foglio_stato, prodotto, started_at, expected_end_at, closed_at, lotto_uscita_codice, movimento_id, quantita_prelevata, unita_prelievo, prelevato_at, lotto_mp_codice"
    )
    .eq("foglio_stato", "aperto")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) return { success: false, error: "Il ciclo di produzione non è disponibile." };

  const fogliMap = new Map<string, FoglioCiclo>();
  for (const row of righe ?? []) {
    const id = String(row.foglio_id);
    const foglio = fogliMap.get(id) ?? {
      id,
      codice: String(row.foglio_codice),
      prodotto: String(row.prodotto ?? ""),
      stato: String(row.foglio_stato),
      startedAt: String(row.started_at),
      expectedEndAt: String(row.expected_end_at),
      closedAt: row.closed_at ? String(row.closed_at) : null,
      lottoUscita: row.lotto_uscita_codice ? String(row.lotto_uscita_codice) : null,
      prelievi: [],
      bilancio: null,
    };
    if (row.movimento_id && row.lotto_mp_codice) {
      foglio.prelievi.push({
        movimentoId: String(row.movimento_id),
        lottoMp: String(row.lotto_mp_codice),
        quantita: Number(row.quantita_prelevata ?? 0),
        unita: String(row.unita_prelievo ?? ""),
        quando: String(row.prelevato_at ?? ""),
      });
    }
    fogliMap.set(id, foglio);
  }
  const foglioIds = [...fogliMap.keys()];

  const [
    { data: conteggi },
    { data: associazioni },
    { data: macchine },
    { data: impegni },
    { data: attivita },
    { data: baseline },
  ] =
    await Promise.all([
      foglioIds.length
        ? supabase
            .from("produzione_foglio_conteggi")
            .select("foglio_id, kg_versati, kg_essiccatori, kg_non_conformi, esito_bilancio")
            .in("foglio_id", foglioIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      foglioIds.length
        ? supabase
            .from("produzione_foglio_macchine")
            .select("id, foglio_id, macchinario_id, protocollo")
            .in("foglio_id", foglioIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      supabase
        .from("produzione_macchinari")
        .select("id, codice, nome, stato_iot, stato_note, iot_collegato")
        .eq("attivo", true)
        .is("deleted_at", null)
        .order("codice")
        .limit(80),
      supabase
        .from("produzione_calendario_impegni")
        .select("id, data_giorno, etichetta, linea_codice, foglio_lavorazione_id")
        .is("deleted_at", null)
        .gte("data_giorno", oggiIso())
        .order("data_giorno")
        .limit(40),
      foglioIds.length
        ? supabase
            .from("produzione_macchinario_attivita")
            .select("actor_nome, azione, created_at")
            .in("foglio_id", foglioIds)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
      supabase
        .from("produzione_resa_baseline")
        .select(
          "linea_codice, stagione, mese_da, mese_a, resa_percentuale_min, resa_percentuale_max, resa_percentuale_media"
        )
        .is("deleted_at", null),
    ]);

  for (const row of conteggi ?? []) {
    const foglio = fogliMap.get(String(row.foglio_id));
    if (!foglio || foglio.bilancio) continue;
    foglio.bilancio = {
      versati: Number(row.kg_versati ?? 0),
      ottenuti: Number(row.kg_essiccatori ?? 0),
      nonConformi: Number(row.kg_non_conformi ?? 0),
      esito: String(row.esito_bilancio ?? ""),
    };
  }

  const macchinaIds = (macchine ?? []).map((row) => String(row.id));
  const { data: devices } = macchinaIds.length
    ? await supabase
        .from("iot_devices")
        .select("id, macchinario_id, device_code, status")
        .in("macchinario_id", macchinaIds)
        .is("deleted_at", null)
    : { data: [] };
  const deviceIds = (devices ?? []).map((row) => String(row.id));
  const [{ data: telemetrie }, { data: comandi }] = await Promise.all([
    deviceIds.length
      ? supabase
          .from("iot_telemetry")
          .select("device_id, data, created_at")
          .in("device_id", deviceIds)
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] }),
    deviceIds.length
      ? supabase
          .from("iot_commands")
          .select("device_id, command, executed, executed_at")
          .in("device_id", deviceIds)
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] }),
  ]);

  const devicePerMacchina = new Map(
    (devices ?? []).map((row) => [String(row.macchinario_id), row])
  );
  const telemetriaPerDevice = new Map<string, string>();
  for (const row of telemetrie ?? []) {
    const id = String(row.device_id);
    if (!telemetriaPerDevice.has(id)) telemetriaPerDevice.set(id, JSON.stringify(row.data));
  }
  const confermaPerDevice = new Map<string, string>();
  for (const row of comandi ?? []) {
    const id = String(row.device_id);
    if (confermaPerDevice.has(id) || !row.executed) continue;
    confermaPerDevice.set(id, `${row.command} ${row.executed_at ?? ""}`.trim());
  }

  return {
    success: true,
    fogli: [...fogliMap.values()],
    macchine: (macchine ?? []).map((row) => {
      const device = devicePerMacchina.get(String(row.id));
      const deviceId = device ? String(device.id) : null;
      return {
        id: String(row.id),
        codice: String(row.codice),
        nome: String(row.nome),
        stato: String(row.stato_iot),
        nota: String(row.stato_note ?? ""),
        iot: Boolean(row.iot_collegato),
        deviceCode: device ? String(device.device_code) : null,
        deviceStato: device ? String(device.status) : null,
        telemetria: deviceId ? (telemetriaPerDevice.get(deviceId) ?? null) : null,
        conferma: deviceId ? (confermaPerDevice.get(deviceId) ?? null) : null,
      };
    }),
    associazioni: (associazioni ?? []).map((row) => ({
      id: String(row.id),
      foglioId: String(row.foglio_id),
      macchinarioId: String(row.macchinario_id),
      protocollo: String(row.protocollo ?? ""),
    })),
    impegni: (impegni ?? []).map((row) => ({
      id: String(row.id),
      giorno: String(row.data_giorno),
      etichetta: String(row.etichetta ?? ""),
      linea: row.linea_codice ? String(row.linea_codice) : null,
      foglioId: row.foglio_lavorazione_id ? String(row.foglio_lavorazione_id) : null,
    })),
    operatori: (attivita ?? [])
      .filter((row) => String(row.actor_nome ?? "").trim().length > 0)
      .map((row) => ({
        nome: String(row.actor_nome),
        azione: String(row.azione),
        quando: String(row.created_at),
      })),
    coefficienti: (baseline ?? []).map((row) => ({
      linea: String(row.linea_codice),
      stagione: String(row.stagione),
      meseDa: Number(row.mese_da),
      meseA: Number(row.mese_a),
      minimo: Number(row.resa_percentuale_min),
      massimo: Number(row.resa_percentuale_max),
      media: Number(row.resa_percentuale_media),
    })),
    mese: new Date().getMonth() + 1,
  };
}

export async function associaMacchinaProvaAction(input: {
  foglioId: string;
  macchinarioId: string;
}): Promise<{ success: true } | Errore> {
  const auth = await requireAnyAreaAccess(["produzione"]);
  const parsed = z
    .object({ foglioId: uuidSchema, macchinarioId: uuidSchema })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const supabase = await createClient();
  const { data: macchina, error: lettura } = await supabase
    .from("produzione_macchinari")
    .select("iot_collegato")
    .eq("id", parsed.data.macchinarioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (lettura || !macchina) return { success: false, error: "Macchina non disponibile." };
  const { data: foglio, error: foglioErr } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("stato")
    .eq("id", parsed.data.foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (foglioErr || !foglio || foglio.stato !== "aperto") {
    return { success: false, error: "Il foglio di lavorazione non è aperto." };
  }
  const { error } = await supabase.from("produzione_foglio_macchine").insert({
    foglio_id: parsed.data.foglioId,
    macchinario_id: parsed.data.macchinarioId,
    modalita: "prova",
    protocollo: protocolloMacchinaProva(Boolean(macchina.iot_collegato)),
    created_by: auth.auth.userId,
    updated_by: auth.auth.userId,
  });
  if (error) return { success: false, error: "Associazione non registrata." };
  return { success: true };
}

export async function scollegaMacchinaProvaAction(id: string): Promise<{ success: true } | Errore> {
  const auth = await requireAnyAreaAccess(["produzione"]);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("produzione_foglio_macchine")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.auth.userId,
      updated_by: auth.auth.userId,
    })
    .eq("id", parsed.data)
    .is("deleted_at", null);
  if (error) return { success: false, error: "Associazione non chiusa." };
  return { success: true };
}

export async function collegaImpegnoFoglioAction(input: {
  impegnoId: string;
  foglioId: string | null;
}): Promise<{ success: true } | Errore> {
  await requireAnyAreaAccess(["produzione"]);
  const parsed = z
    .object({ impegnoId: uuidSchema, foglioId: uuidSchema.nullable() })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("produzione_collega_impegno_foglio", {
    p_impegno_id: parsed.data.impegnoId,
    p_foglio_id: parsed.data.foglioId,
  });
  if (error) {
    const testo = (error.message ?? "").split("\n")[0] ?? "";
    if (testo.includes("aperto") || testo.includes("autorizzato") || testo.includes("Impegno")) {
      return { success: false, error: testo.replace(/^ERROR:\s*/, "") };
    }
    return { success: false, error: "Collegamento non registrato." };
  }
  return { success: true };
}
