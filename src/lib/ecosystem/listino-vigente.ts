import type { ListinoDisponibilita } from "@/lib/ecosystem/listini";

export type ListinoVoceVigente = {
  listinoId: string;
  prezzo: number;
  iva: number;
  disponibilita: ListinoDisponibilita;
  unitaMisura: "kg" | "lt";
};

export type ListinoContrattoEsito =
  | { esito: "ordinabile"; voce: ListinoVoceVigente }
  | { esito: "sospeso"; voce: ListinoVoceVigente }
  | { esito: "fuori_produzione"; voce: ListinoVoceVigente }
  | { esito: "senza_prezzo"; voce: ListinoVoceVigente | null };

export const LISTINO_CONTRATTO_MSG = {
  fuori_produzione:
    "Prodotto fuori produzione: non è possibile creare preventivi né ordini.",
  senza_prezzo:
    "Imposta prima il prezzo nel listino In Uso (Amministrazione → Listini B2B).",
  sospeso:
    "Al momento non disponibile: l’ordine è consentito con data presunta, resta sospeso e non entra in produzione.",
} as const;

export function valutaListinoPerContratto(
  voce: ListinoVoceVigente | null
): ListinoContrattoEsito {
  if (!voce) return { esito: "senza_prezzo", voce: null };
  if (voce.disponibilita === "fuori_produzione") {
    return { esito: "fuori_produzione", voce };
  }
  if (voce.prezzo <= 0) return { esito: "senza_prezzo", voce };
  if (voce.disponibilita === "non_disponibile") {
    return { esito: "sospeso", voce };
  }
  return { esito: "ordinabile", voce };
}

export function mapDisponibilitaVoce(
  raw: string | undefined
): ListinoDisponibilita {
  if (raw === "fuori_produzione" || raw === "non_disponibile") return raw;
  return "in_produzione";
}
