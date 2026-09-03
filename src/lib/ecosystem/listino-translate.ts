import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { labelLingua } from "@/lib/ecosystem/geo-nazioni";
import type { createClient } from "@/lib/supabase/server";

export type ListinoTraduzioneKind = "listino_nome" | "prodotto" | "imballaggio";

export type ListinoTraduzioneMaps = {
  listinoNome: string | null;
  prodotti: Map<string, string>;
  imballaggi: Map<string, string>;
};

type Phrase = {
  kind: ListinoTraduzioneKind;
  sourceId: string | null;
  origine: string;
};

const batchSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
    })
  ),
});

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function phraseKey(p: Phrase): string {
  return `${p.kind}:${p.sourceId ?? "nome"}`;
}

async function translatePhrasesWithGemini(
  locale: string,
  phrases: Phrase[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!phrases.length) return out;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return out;

  const modelName =
    process.env.GEMINI_MODEL?.trim() ||
    process.env.INVOICE_AI_GEMINI_MODEL?.trim() ||
    "gemini-3.6-flash";
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const target = labelLingua(locale);
  const payload = phrases.map((p) => ({
    key: phraseKey(p),
    text: p.origine,
  }));

  const prompt = `Sei un traduttore commerciale per listini B2B agroalimentari.
Traduci ogni testo in ${target} (codice ${locale}).
Regole:
- Traduci descrizioni prodotto e tipi di confezione/imballaggio.
- Non tradurre marchi, nomi propri, codici, SKU, unità (kg, lt).
- Mantieni lo stesso significato commerciale.
- Rispondi SOLO JSON: {"items":[{"key":"...","text":"..."}]}
- Conserva tutte le key ricevute.

INPUT:
${JSON.stringify({ items: payload })}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const raw = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(raw));
  } catch {
    return out;
  }
  const validated = batchSchema.safeParse(parsed);
  if (!validated.success) return out;
  for (const item of validated.data.items) {
    const text = item.text.trim();
    if (item.key && text) out.set(item.key, text);
  }
  return out;
}

export function emptyTraduzioneMaps(): ListinoTraduzioneMaps {
  return { listinoNome: null, prodotti: new Map(), imballaggi: new Map() };
}

export async function ensureListinoTraduzioni(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  listinoId: string;
  locale: string;
  listinoNome: string;
  prodotti: Array<{ id: string; nome: string }>;
  imballaggi: Array<{ id: string; nome: string }>;
  userId: string;
}): Promise<ListinoTraduzioneMaps> {
  const maps = emptyTraduzioneMaps();
  const locale = input.locale.trim().toLowerCase().slice(0, 2);
  if (!locale || locale === "it") {
    maps.listinoNome = input.listinoNome;
    return maps;
  }

  const { data } = await input.supabase
    .from("listini_traduzioni")
    .select("kind, source_id, testo_origine, testo_tradotto")
    .eq("listino_id", input.listinoId)
    .eq("locale", locale)
    .is("deleted_at", null);

  type Row = {
    kind: ListinoTraduzioneKind;
    source_id: string | null;
    testo_origine: string;
    testo_tradotto: string;
  };
  const existing = new Map<string, Row>();
  for (const raw of (data ?? []) as Row[]) {
    const k = `${raw.kind}:${raw.source_id ?? "nome"}`;
    existing.set(k, raw);
    if (raw.kind === "listino_nome" && raw.testo_tradotto) {
      maps.listinoNome = raw.testo_tradotto;
    } else if (raw.kind === "prodotto" && raw.source_id && raw.testo_tradotto) {
      maps.prodotti.set(raw.source_id, raw.testo_tradotto);
    } else if (raw.kind === "imballaggio" && raw.source_id && raw.testo_tradotto) {
      maps.imballaggi.set(raw.source_id, raw.testo_tradotto);
    }
  }

  const needed: Phrase[] = [];
  const nomeOrig = input.listinoNome.replace(/\s*\([^)]+\)\s*$/, "").trim();
  const nomeRow = existing.get("listino_nome:nome");
  if (!nomeRow || nomeRow.testo_origine !== nomeOrig || !nomeRow.testo_tradotto) {
    needed.push({ kind: "listino_nome", sourceId: null, origine: nomeOrig });
  }
  for (const p of input.prodotti) {
    const nome = p.nome.trim();
    if (!nome) continue;
    const row = existing.get(`prodotto:${p.id}`);
    if (!row || row.testo_origine !== nome || !row.testo_tradotto) {
      needed.push({ kind: "prodotto", sourceId: p.id, origine: nome });
    }
  }
  for (const i of input.imballaggi) {
    const nome = i.nome.trim();
    if (!nome) continue;
    const row = existing.get(`imballaggio:${i.id}`);
    if (!row || row.testo_origine !== nome || !row.testo_tradotto) {
      needed.push({ kind: "imballaggio", sourceId: i.id, origine: nome });
    }
  }

  if (!needed.length) return maps;

  let translated = new Map<string, string>();
  try {
    translated = await translatePhrasesWithGemini(locale, needed);
  } catch (e) {
    console.error("[listino-translate] gemini", e);
  }

  for (const p of needed) {
    const key = phraseKey(p);
    const testo = translated.get(key) || p.origine;
    if (p.kind === "listino_nome") maps.listinoNome = testo;
    if (p.kind === "prodotto" && p.sourceId) maps.prodotti.set(p.sourceId, testo);
    if (p.kind === "imballaggio" && p.sourceId) {
      maps.imballaggi.set(p.sourceId, testo);
    }
    let q = input.supabase
      .from("listini_traduzioni")
      .update({
        testo_origine: p.origine,
        testo_tradotto: testo,
        updated_by: input.userId,
        deleted_at: null,
        deleted_by: null,
      })
      .eq("listino_id", input.listinoId)
      .eq("kind", p.kind)
      .eq("locale", locale)
      .is("deleted_at", null);
    q = p.sourceId ? q.eq("source_id", p.sourceId) : q.is("source_id", null);
    const upd = await q.select("id").maybeSingle();
    if (!upd.data) {
      await input.supabase.from("listini_traduzioni").insert({
        listino_id: input.listinoId,
        kind: p.kind,
        source_id: p.sourceId,
        testo_origine: p.origine,
        testo_tradotto: testo,
        locale,
        created_by: input.userId,
        updated_by: input.userId,
      });
    }
  }

  if (maps.listinoNome) {
    await input.supabase
      .from("listini")
      .update({
        nome: maps.listinoNome,
        updated_by: input.userId,
      })
      .eq("id", input.listinoId);
  }

  return maps;
}

export function applyTraduzioniToNome(
  originale: string,
  maps: ListinoTraduzioneMaps
): string {
  return maps.listinoNome?.trim() || originale;
}

export function applyTraduzioniToRighe<
  T extends {
    prodottoId: string;
    prodottoNome?: string;
    condizioni: Array<{
      imballaggioVoceId: string;
      imballaggioNome?: string;
      imballaggioNomeCommerciale?: string;
    }>;
  },
>(righe: T[], maps: ListinoTraduzioneMaps): T[] {
  return righe.map((r) => {
    const nome = maps.prodotti.get(r.prodottoId);
    return {
      ...r,
      prodottoNome: nome || r.prodottoNome,
      condizioni: r.condizioni.map((c) => {
        const pack = maps.imballaggi.get(c.imballaggioVoceId);
        if (!pack) return c;
        return {
          ...c,
          imballaggioNomeCommerciale: pack,
          imballaggioNome: pack,
        };
      }),
    };
  });
}
