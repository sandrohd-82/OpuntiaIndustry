import type { FatturaKind } from "@/lib/amministrazione/fatture";

/** Helper puri (client-safe): nessun import server / next/headers. */

export function toFicKind(kind: FatturaKind): "issued" | "received" {
  return kind === "ricevuta" ? "received" : "issued";
}

export function parseFicKindParam(kindParam: string): FatturaKind | null {
  if (kindParam === "emesse" || kindParam === "emessa") return "emessa";
  if (kindParam === "ricevute" || kindParam === "ricevuta") return "ricevuta";
  if (
    kindParam === "note-credito" ||
    kindParam === "note_credito" ||
    kindParam === "nota_credito" ||
    kindParam === "nota-credito"
  ) {
    return "nota_credito";
  }
  return null;
}

export function ficDocumentPath(
  kind: FatturaKind,
  ficId: number,
  mode: "foglio" | "xml"
): string {
  const seg =
    kind === "ricevuta"
      ? "ricevute"
      : kind === "nota_credito"
        ? "note-credito"
        : "emesse";
  const base = `/app/amministrazione/documenti-fic/${seg}/${ficId}`;
  return mode === "xml" ? `${base}/xml` : base;
}
