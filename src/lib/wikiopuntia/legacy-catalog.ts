import catalog from "../../../data/wiki-legacy/scientific_research.json";
import type { WikiPaperCategory } from "@/types/database";

export type LegacyWikiPaper = {
  legacyId: number;
  title: string;
  abstract: string;
  plantParts: string[];
  sectors: string[];
  isMostSearched: boolean;
  isEvidence: boolean;
  publishedYear: number;
  publishedMonth: number;
  path: string;
  file: string;
  link: string;
  closed: boolean;
  category: WikiPaperCategory;
  slug: string;
};

export function listLegacyWikiPapers(): LegacyWikiPaper[] {
  return catalog as LegacyWikiPaper[];
}

export function legacyResearchRoot(): string {
  return (
    process.env.WIKI_LEGACY_RESEARCH_ROOT?.trim() ||
    "E:\\Progetti Cursor\\OpuntiaItaliaOld\\Img\\Research"
  );
}

export function legacyRemotePdfUrl(paper: LegacyWikiPaper): string {
  const base =
    process.env.WIKI_LEGACY_REMOTE_BASE?.trim() ||
    "https://www.opuntiaitalia.com/Img/Research";
  return `${base.replace(/\/$/, "")}/${paper.path}/${paper.file}`;
}
