export type LettureScheda = Record<string, Promise<unknown>>;

export function erroreControlloNext(errore: unknown): boolean {
  if (!errore || typeof errore !== "object" || !("digest" in errore)) return false;
  const digest = (errore as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

export function erroreSezione(errore: unknown): { success: false; error: string } {
  const testo = errore instanceof Error ? errore.message : "Lettura non disponibile.";
  return { success: false, error: testo || "Lettura non disponibile." };
}

export async function coordinaLettureScheda<T extends LettureScheda>(
  letture: { [K in keyof T]: T[K] }
): Promise<{ [K in keyof T]: Awaited<T[K]> | { success: false; error: string } }> {
  const chiavi = Object.keys(letture) as Array<keyof T>;
  const esiti = await Promise.allSettled(chiavi.map((chiave) => letture[chiave]));
  const risultato = {} as {
    [K in keyof T]: Awaited<T[K]> | { success: false; error: string };
  };
  for (let indice = 0; indice < esiti.length; indice += 1) {
    const esito = esiti[indice];
    const chiave = chiavi[indice];
    if (esito.status === "rejected") {
      if (erroreControlloNext(esito.reason)) throw esito.reason;
      risultato[chiave] = erroreSezione(esito.reason) as Awaited<T[typeof chiave]>;
      continue;
    }
    risultato[chiave] = esito.value as Awaited<T[typeof chiave]>;
  }
  return risultato;
}
