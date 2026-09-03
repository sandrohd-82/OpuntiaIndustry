import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  mergeProduzioneNavWithAree,
  PRODUZIONE_SECTIONS,
  resolveProduzionePage,
} from "@/lib/areas/produzione";

/** Risolve label/descrizione anche per posti aggiunti a catalogo. */
export async function resolveProduzioneDynamic(segments: string[]) {
  const res = await listProduzioneAreeAction();
  const sections = res.success
    ? mergeProduzioneNavWithAree(res.items)
    : PRODUZIONE_SECTIONS;
  return resolveProduzionePage(segments, sections);
}
