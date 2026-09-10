export type AnagraficaOrdineFonte = "cliente" | "possibile";

export function parseAnagraficaOrdineFromRaw(raw: unknown): {
  fonte: AnagraficaOrdineFonte;
  clienteId: string | null;
  possibileClienteId: string | null;
} {
  const o =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const clienteId =
    typeof o.clienteId === "string" && o.clienteId.length > 0
      ? o.clienteId
      : null;
  const possibileClienteId =
    typeof o.possibileClienteId === "string" && o.possibileClienteId.length > 0
      ? o.possibileClienteId
      : null;
  const fonte: AnagraficaOrdineFonte =
    o.anagraficaFonte === "possibile" || (!clienteId && Boolean(possibileClienteId))
      ? "possibile"
      : "cliente";
  return { fonte, clienteId, possibileClienteId };
}
