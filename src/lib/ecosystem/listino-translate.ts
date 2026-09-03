import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { labelLingua } from "@/lib/ecosystem/geo-nazioni";
import type { createClient } from "@/lib/supabase/server";

/** Parole italiane riconoscibili → traduzione. Numeri, codici e targa restano. */
const IT_WORD_I18N: Record<string, Record<string, string>> = {
  en: {
    listino: "Price list",
    listini: "Price lists",
    prezzo: "Price",
    prezzi: "Prices",
    descrizione: "Description",
    prodotto: "Product",
    prodotti: "Products",
    confezione: "Pack",
    confezioni: "Packs",
    confezionamento: "Packaging",
    imballaggio: "Packaging",
    imballaggi: "Packaging",
    sconto: "Discount",
    sconti: "Discounts",
    tipo: "Type",
    movimentazione: "Handling",
    isolamento: "Liner",
    cartone: "Carton",
    cartoni: "Cartons",
    sacco: "Bag",
    sacchi: "Bags",
    bidone: "Drum",
    bidoni: "Drums",
    tanica: "Jerrycan",
    taniche: "Jerrycans",
    pallet: "Pallet",
    secchio: "Pail",
    secchi: "Pails",
    fusto: "Drum",
    fusti: "Drums",
    cassa: "Crate",
    casse: "Crates",
    bottiglia: "Bottle",
    bottiglie: "Bottles",
    barattolo: "Jar",
    barattoli: "Jars",
    disponibile: "available",
    produzione: "production",
  },
  de: {
    listino: "Preisliste",
    listini: "Preislisten",
    prezzo: "Preis",
    prezzi: "Preise",
    descrizione: "Beschreibung",
    prodotto: "Artikel",
    prodotti: "Artikel",
    confezione: "Gebinde",
    confezioni: "Gebinde",
    confezionamento: "Verpackung",
    imballaggio: "Verpackung",
    imballaggi: "Verpackungen",
    sconto: "Rabatt",
    sconti: "Rabatte",
    tipo: "Art",
    movimentazione: "Handling",
    isolamento: "Innenbeutel",
    cartone: "Karton",
    cartoni: "Kartons",
    sacco: "Sack",
    sacchi: "Säcke",
    bidone: "Fass",
    bidoni: "Fässer",
    tanica: "Kanister",
    taniche: "Kanister",
    pallet: "Palette",
    secchio: "Eimer",
    secchi: "Eimer",
    fusto: "Fass",
    fusti: "Fässer",
    cassa: "Kiste",
    casse: "Kisten",
    bottiglia: "Flasche",
    bottiglie: "Flaschen",
    barattolo: "Glas",
    barattoli: "Gläser",
    disponibile: "verfügbar",
    produzione: "Produktion",
  },
  fr: {
    listino: "Liste de prix",
    listini: "Listes de prix",
    prezzo: "Prix",
    prezzi: "Prix",
    descrizione: "Description",
    prodotto: "Produit",
    prodotti: "Produits",
    confezione: "Conditionnement",
    confezioni: "Conditionnements",
    confezionamento: "Emballage",
    imballaggio: "Emballage",
    imballaggi: "Emballages",
    sconto: "Remise",
    sconti: "Remises",
    tipo: "Type",
    cartone: "Carton",
    cartoni: "Cartons",
    sacco: "Sac",
    sacchi: "Sacs",
    bidone: "Fût",
    bidoni: "Fûts",
    tanica: "Bidon",
    taniche: "Bidons",
    disponibile: "disponible",
    produzione: "production",
  },
  es: {
    listino: "Lista de precios",
    listini: "Listas de precios",
    prezzo: "Precio",
    prezzi: "Precios",
    descrizione: "Descripción",
    prodotto: "Producto",
    prodotti: "Productos",
    confezione: "Envase",
    confezioni: "Envases",
    confezionamento: "Envasado",
    imballaggio: "Embalaje",
    imballaggi: "Embalajes",
    sconto: "Descuento",
    sconti: "Descuentos",
    tipo: "Tipo",
    cartone: "Cartón",
    cartoni: "Cartones",
    sacco: "Saco",
    sacchi: "Sacos",
    bidone: "Bidón",
    bidoni: "Bidones",
    tanica: "Garrafa",
    taniche: "Garrafas",
    disponibile: "disponible",
    produzione: "producción",
  },
  pt: {
    listino: "Lista de preços",
    listini: "Listas de preços",
    prezzo: "Preço",
    prezzi: "Preços",
    descrizione: "Descrição",
    prodotto: "Produto",
    prodotti: "Produtos",
    confezione: "Embalagem",
    confezioni: "Embalagens",
    sconto: "Desconto",
    sconti: "Descontos",
    tipo: "Tipo",
  },
  nl: {
    listino: "Prijslijst",
    listini: "Prijslijsten",
    prezzo: "Prijs",
    prezzi: "Prijzen",
    descrizione: "Beschrijving",
    prodotto: "Product",
    prodotti: "Producten",
    confezione: "Verpakking",
    confezioni: "Verpakkingen",
    sconto: "Korting",
    sconti: "Kortingen",
    tipo: "Type",
  },
  pl: {
    listino: "Cennik",
    listini: "Cenniki",
    prezzo: "Cena",
    prezzi: "Ceny",
    descrizione: "Opis",
    prodotto: "Produkt",
    prodotti: "Produkty",
    confezione: "Opakowanie",
    confezioni: "Opakowania",
    sconto: "Rabat",
    sconti: "Rabaty",
    tipo: "Typ",
  },
  ro: {
    listino: "Listă de prețuri",
    listini: "Liste de prețuri",
    prezzo: "Preț",
    prezzi: "Prețuri",
    descrizione: "Descriere",
    prodotto: "Produs",
    prodotti: "Produse",
    confezione: "Ambalaj",
    confezioni: "Ambalaje",
    sconto: "Reducere",
    sconti: "Reduceri",
    tipo: "Tip",
  },
};

const ITALIAN_WORD_RE =
  /\b(listino|listini|prezzo|prezzi|descrizione|prodotto|prodotti|confezione|confezioni|confezionamento|imballaggio|imballaggi|sconto|sconti|movimentazione|isolamento|cartone|cartoni|sacco|sacchi|bidone|bidoni|tanica|taniche|secchio|secchi|fusto|fusti|cassa|casse|bottiglia|bottiglie|barattolo|barattoli)\b/i;

export function isCodiceOTarga(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^\d{4,}$/.test(t)) return true;
  if (/^[A-Z0-9]{6,12}$/i.test(t) && /\d/.test(t) && !/[aeiou]{2}/i.test(t)) {
    return true;
  }
  if (/^(B2B|C&I|CNF|ISO|MOV|SKU)[-_]/i.test(t)) return true;
  if (/^[A-Z]{1,4}[-_]?[A-Z0-9]{2,}$/i.test(t) && /\d/.test(t) && t.length <= 24) {
    return true;
  }
  return false;
}

function matchCase(source: string, translated: string): string {
  if (source === source.toUpperCase()) return translated.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated;
}

/** Traduce parole italiane riconoscibili; lascia numeri, codici e targa. */
export function forceTranslateRecognizableText(
  text: string,
  locale: string
): string {
  const loc = (locale || "it").trim().toLowerCase().slice(0, 2);
  if (!text.trim() || loc === "it" || isCodiceOTarga(text)) return text;
  const dict = IT_WORD_I18N[loc] ?? IT_WORD_I18N.en;
  return text.replace(/[A-Za-zÀ-ÿ]+/g, (word) => {
    if (isCodiceOTarga(word)) return word;
    const hit = dict[word.toLowerCase()];
    return hit ? matchCase(word, hit) : word;
  });
}

export function looksUntranslated(
  origine: string,
  tradotto: string,
  locale: string
): boolean {
  const loc = (locale || "it").trim().toLowerCase().slice(0, 2);
  if (loc === "it" || isCodiceOTarga(origine)) return false;
  const a = origine.replace(/\s*\([^)]+\)\s*$/, "").trim().toLowerCase();
  const b = (tradotto || "").trim().toLowerCase();
  if (!b) return true;
  if (b === a && ITALIAN_WORD_RE.test(origine)) return true;
  if (ITALIAN_WORD_RE.test(tradotto)) return true;
  return false;
}

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
Traduci OGNI testo in ${target} (codice ${locale}). È OBBLIGATORIO: non lasciare italiano.
Regole:
- Traduci ogni parola di senso compiuto, incluso il titolo documento (es. "Listino 2026" → inglese "Price list 2026", tedesco "Preisliste 2026").
- Traduci descrizioni prodotto e tipi di confezione/imballaggio.
- NON tradurre: codici, targa, SKU, numeri, unità (kg, lt), marchi (Agrinsicilia, Opuntia).
- Non copiare l'italiano. Se il testo contiene "Listino", "prodotto", "confezione", "sconto", traducilo.
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
      maps.listinoNome = forceTranslateRecognizableText(
        raw.testo_tradotto,
        locale
      );
    } else if (raw.kind === "prodotto" && raw.source_id && raw.testo_tradotto) {
      maps.prodotti.set(
        raw.source_id,
        forceTranslateRecognizableText(raw.testo_tradotto, locale)
      );
    } else if (raw.kind === "imballaggio" && raw.source_id && raw.testo_tradotto) {
      maps.imballaggi.set(
        raw.source_id,
        forceTranslateRecognizableText(raw.testo_tradotto, locale)
      );
    }
  }

  const needed: Phrase[] = [];
  const nomeOrig = input.listinoNome.replace(/\s*\([^)]+\)\s*$/, "").trim();
  const nomeRow = existing.get("listino_nome:nome");
  if (
    !nomeRow ||
    nomeRow.testo_origine !== nomeOrig ||
    !nomeRow.testo_tradotto ||
    looksUntranslated(nomeOrig, nomeRow.testo_tradotto, locale)
  ) {
    needed.push({ kind: "listino_nome", sourceId: null, origine: nomeOrig });
  }
  for (const p of input.prodotti) {
    const nome = p.nome.trim();
    if (!nome || isCodiceOTarga(nome)) continue;
    const row = existing.get(`prodotto:${p.id}`);
    if (
      !row ||
      row.testo_origine !== nome ||
      !row.testo_tradotto ||
      looksUntranslated(nome, row.testo_tradotto, locale)
    ) {
      needed.push({ kind: "prodotto", sourceId: p.id, origine: nome });
    }
  }
  for (const i of input.imballaggi) {
    const nome = i.nome.trim();
    if (!nome || isCodiceOTarga(nome)) continue;
    const row = existing.get(`imballaggio:${i.id}`);
    if (
      !row ||
      row.testo_origine !== nome ||
      !row.testo_tradotto ||
      looksUntranslated(nome, row.testo_tradotto, locale)
    ) {
      needed.push({ kind: "imballaggio", sourceId: i.id, origine: nome });
    }
  }

  maps.listinoNome = forceTranslateRecognizableText(
    maps.listinoNome || nomeOrig,
    locale
  );

  if (!needed.length) {
    if (maps.listinoNome && maps.listinoNome !== input.listinoNome) {
      await input.supabase
        .from("listini")
        .update({ nome: maps.listinoNome, updated_by: input.userId })
        .eq("id", input.listinoId);
    }
    return maps;
  }

  let translated = new Map<string, string>();
  try {
    translated = await translatePhrasesWithGemini(locale, needed);
  } catch (e) {
    console.error("[listino-translate] gemini", e);
  }

  for (const p of needed) {
    const key = phraseKey(p);
    const fromAi = (translated.get(key) || "").trim();
    const forced = forceTranslateRecognizableText(fromAi || p.origine, locale);
    const testo =
      looksUntranslated(p.origine, forced, locale) && fromAi
        ? forceTranslateRecognizableText(p.origine, locale)
        : forced;
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
>(righe: T[], maps: ListinoTraduzioneMaps, locale = "it"): T[] {
  return righe.map((r) => {
    const nome = maps.prodotti.get(r.prodottoId) || r.prodottoNome;
    return {
      ...r,
      prodottoNome: forceTranslateRecognizableText(nome || "", locale),
      condizioni: r.condizioni.map((c) => {
        const pack =
          maps.imballaggi.get(c.imballaggioVoceId) ||
          c.imballaggioNomeCommerciale ||
          c.imballaggioNome ||
          "";
        return {
          ...c,
          imballaggioNomeCommerciale: forceTranslateRecognizableText(pack, locale),
          imballaggioNome: forceTranslateRecognizableText(
            maps.imballaggi.get(c.imballaggioVoceId) || c.imballaggioNome || "",
            locale
          ),
        };
      }),
    };
  });
}
