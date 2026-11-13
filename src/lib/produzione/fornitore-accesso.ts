/**
 * Autorizzazione del portale fornitore e delle due viste Materiale in ingresso.
 * Non usa l'id inviato dal client come identità: il fornitore è solo quello collegato.
 */

export type MotivoNegatoAccesso =
  | "non_collegato"
  | "altro_fornitore"
  | "area_assente";

export type EsitoAccessoFornitore =
  | { esito: "interno" }
  | { esito: "fornitore"; fornitoreId: string }
  | { esito: "negato"; motivo: MotivoNegatoAccesso };

export type SoggettoAccessoFornitore = {
  superadmin: boolean;
  aree: readonly string[];
  fornitoreCollegatoId: string | null;
};

function haArea(soggetto: SoggettoAccessoFornitore, slug: string): boolean {
  return soggetto.aree.includes(slug);
}

export function eUtenteInternoHaccp(soggetto: SoggettoAccessoFornitore): boolean {
  return (
    soggetto.superadmin ||
    haArea(soggetto, "produzione") ||
    haArea(soggetto, "amministrazione")
  );
}

/** Solo Amministrazione e superadmin assegnano o revocano il collegamento. */
export function puoModificareCollegamentoFornitore(
  soggetto: SoggettoAccessoFornitore
): boolean {
  return soggetto.superadmin || haArea(soggetto, "amministrazione");
}

/**
 * fornitoreRichiestoId è l'id arrivato dalla richiesta.
 * Per un fornitore vale solo se coincide con il collegamento persistente.
 */
export function risolviAccessoMaterialeIngresso(
  soggetto: SoggettoAccessoFornitore,
  fornitoreRichiestoId: string | null
): EsitoAccessoFornitore {
  if (eUtenteInternoHaccp(soggetto)) {
    return { esito: "interno" };
  }

  const collegato = soggetto.fornitoreCollegatoId;
  if (haArea(soggetto, "area-fornitori") && collegato) {
    if (fornitoreRichiestoId == null || fornitoreRichiestoId === collegato) {
      return { esito: "fornitore", fornitoreId: collegato };
    }
    return { esito: "negato", motivo: "altro_fornitore" };
  }

  if (haArea(soggetto, "area-fornitori")) {
    return { esito: "negato", motivo: "non_collegato" };
  }

  return { esito: "negato", motivo: "area_assente" };
}
