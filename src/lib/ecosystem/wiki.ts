import { z } from "zod";
import type {
  WikiIngestStatus,
  WikiPaperCategory,
  WikiResearchStatus,
  WikiScientificResearchRow,
} from "@/types/database";

export const WIKI_PAPER_CATEGORIES = [
  "Agronomia",
  "Nutrizione",
  "Cosmetica",
  "Usi Industriali",
] as const;

export const WIKI_PLANT_PARTS = ["cladodes", "fruits", "flowers"] as const;
/** Applicazioni (ex flag MySQL, multi-valore). */
export const WIKI_APPLICAZIONI = [
  "nutrace",
  "pharma",
  "food",
  "cosmetic",
  "veterina",
  "technical",
  "other",
] as const;
export const WIKI_SECTORS = WIKI_APPLICAZIONI;

export const WIKI_PLANT_PART_LABELS: Record<(typeof WIKI_PLANT_PARTS)[number], string> = {
  cladodes: "Cladodi",
  fruits: "Frutti",
  flowers: "Fiori",
};

export const WIKI_APPLICAZIONE_LABELS: Record<
  (typeof WIKI_APPLICAZIONI)[number],
  string
> = {
  nutrace: "Nutraceutico",
  pharma: "Farmaceutico",
  food: "Alimentare",
  cosmetic: "Cosmetico",
  veterina: "Veterinario",
  technical: "Tecnico / industriale",
  other: "Altro",
};

export const wikiResearchStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

export const createWikiResearchSchema = z.object({
  title: z.string().trim().min(1, "Titolo obbligatorio").max(500),
  abstract: z.string().trim().max(20000).optional().default(""),
  slug: z
    .string()
    .trim()
    .min(2, "Slug obbligatorio")
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: solo minuscole, numeri e -"),
  publishedYear: z.number().int().min(1900).max(2100),
  publishedMonth: z.number().int().min(1).max(12),
  plantParts: z.array(z.enum(WIKI_PLANT_PARTS)).default([]),
  sectors: z.array(z.enum(WIKI_APPLICAZIONI)).default([]),
  isPublic: z.boolean({
    error:
      "Indica se il PDF è pubblico (download libero) o non pubblico (login + richiesta, invio via email)",
  }),
  sendToWiki: z.boolean().optional().default(false),
  isMostSearched: z.boolean().optional().default(false),
  isEvidence: z.boolean().optional().default(false),
  externalLink: z.string().trim().max(2000).optional().default(""),
  authors: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  keywords: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  category: z
    .enum(["", "Agronomia", "Nutrizione", "Cosmetica", "Usi Industriali"])
    .optional()
    .default(""),
  aiSummary: z.string().trim().max(8000).optional().default(""),
  publicUrl: z.string().trim().max(2000).optional().default(""),
  storagePath: z.string().trim().max(500).optional().default(""),
})
  .refine((d) => d.plantParts.length >= 1, {
    message:
      "Seleziona almeno una categoria di riferimento (cladodi, frutti o fiori)",
    path: ["plantParts"],
  })
  .refine((d) => d.sectors.length >= 1, {
    message:
      "Seleziona almeno un'applicazione (nutraceutico, farmaceutico, alimentare, …)",
    path: ["sectors"],
  });

export type CreateWikiResearchInput = z.infer<typeof createWikiResearchSchema>;

export type WikiResearch = {
  id: string;
  title: string;
  abstract: string;
  slug: string;
  plantParts: string[];
  sectors: string[];
  isPublic: boolean;
  isMostSearched: boolean;
  isEvidence: boolean;
  publishedYear: number;
  publishedMonth: number;
  publishedAt: string;
  externalLink: string;
  pdfAvailable: boolean;
  publicUrl: string;
  authors: string[];
  keywords: string[];
  category: WikiPaperCategory;
  aiSummary: string;
  status: WikiResearchStatus;
  ingestStatus: WikiIngestStatus;
  ingestError: string;
  versione: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
};

export function labelsForPlantParts(parts: string[]): string {
  return parts
    .map((p) =>
      p in WIKI_PLANT_PART_LABELS
        ? WIKI_PLANT_PART_LABELS[p as keyof typeof WIKI_PLANT_PART_LABELS]
        : p
    )
    .join(", ");
}

export function labelsForApplicazioni(sectors: string[]): string {
  return sectors
    .map((s) =>
      s in WIKI_APPLICAZIONE_LABELS
        ? WIKI_APPLICAZIONE_LABELS[s as keyof typeof WIKI_APPLICAZIONE_LABELS]
        : s
    )
    .join(", ");
}

export function slugFromTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export function mapWikiResearch(
  row: WikiScientificResearchRow,
  chunkCount?: number
): WikiResearch {
  return {
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    slug: row.slug,
    plantParts: row.plant_parts ?? [],
    sectors: row.sectors ?? [],
    isPublic: Boolean(row.is_public),
    isMostSearched: Boolean(row.is_most_searched),
    isEvidence: Boolean(row.is_evidence),
    publishedYear: row.published_year,
    publishedMonth: row.published_month,
    publishedAt: row.published_at,
    externalLink: row.external_link ?? "",
    pdfAvailable: Boolean(row.pdf_available),
    publicUrl: row.public_url ?? "",
    authors: row.authors ?? [],
    keywords: row.keywords ?? [],
    category: (row.category as WikiPaperCategory) ?? "",
    aiSummary: row.ai_summary ?? "",
    status: row.status,
    ingestStatus: row.ingest_status,
    ingestError: row.ingest_error ?? "",
    versione: row.versione ?? 1,
    chunkCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
