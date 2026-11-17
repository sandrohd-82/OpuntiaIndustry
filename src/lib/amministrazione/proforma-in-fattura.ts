export type IntestatarioDocumento = {
  clienteId: string | null;
  possibileClienteId: string | null;
};

function idPresente(value: string | null | undefined): string | null {
  const testo = String(value ?? "").trim();
  if (!testo) return null;
  return testo;
}

export function intestatarioDocumento(row: {
  cliente_id?: string | null;
  cliente_possibile_id?: string | null;
} | null | undefined): IntestatarioDocumento | null {
  if (!row) return null;
  const clienteId = idPresente(row.cliente_id);
  const possibileClienteId = idPresente(row.cliente_possibile_id);
  if (!clienteId && !possibileClienteId) return null;
  return { clienteId, possibileClienteId };
}

export type DecisioneConversioneProforma =
  | {
      azione: "riusa";
      fatturaId: string;
      completaIntestatario: IntestatarioDocumento | null;
    }
  | { azione: "crea"; intestatario: IntestatarioDocumento }
  | { azione: "rifiuta"; motivo: string };

/** La proforma non genera una seconda fattura se l'ordine ne ha già una. */
export function decisioneConversioneProforma(input: {
  proforma: {
    cliente_id?: string | null;
    cliente_possibile_id?: string | null;
  };
  ordine?: {
    cliente_id?: string | null;
    cliente_possibile_id?: string | null;
  } | null;
  fatturaEsistente?: {
    id: string;
    cliente_id?: string | null;
    cliente_possibile_id?: string | null;
  } | null;
}): DecisioneConversioneProforma {
  const dallaProforma = intestatarioDocumento(input.proforma);
  const dallOrdine = intestatarioDocumento(input.ordine);
  const intestatario = dallaProforma ?? dallOrdine;
  const esistente = input.fatturaEsistente?.id
    ? input.fatturaEsistente
    : null;
  if (esistente) {
    const gia = intestatarioDocumento(esistente);
    if (gia) {
      return {
        azione: "riusa",
        fatturaId: esistente.id,
        completaIntestatario: null,
      };
    }
    if (!intestatario) {
      return {
        azione: "rifiuta",
        motivo:
          "Manca l'intestatario della fattura già presente. Nessun nuovo documento è stato creato.",
      };
    }
    return {
      azione: "riusa",
      fatturaId: esistente.id,
      completaIntestatario: intestatario,
    };
  }
  if (!intestatario) {
    return {
      azione: "rifiuta",
      motivo:
        "Manca l'intestatario della proforma. Nessuna fattura è stata creata.",
    };
  }
  return { azione: "crea", intestatario };
}
