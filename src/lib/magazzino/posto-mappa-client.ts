import type { MappaMagazzino } from "@/lib/magazzino/mappa";
import type { PostoFotoPrincipale } from "@/lib/magazzino/posto-foto";
import type { RiepilogoElencoPosto } from "@/lib/magazzino/posto-occupazione";

export type MappaLateralePosto = {
  mappa: MappaMagazzino;
  postoCodice: string;
  postoNome: string;
  fotoPrincipali: Record<string, PostoFotoPrincipale>;
  riepilogoPosti: Record<string, RiepilogoElencoPosto>;
};

export async function fetchMappaLateralePosto(
  ubicazioneId: string
): Promise<
  | { success: true; data: MappaLateralePosto }
  | { success: false; error: string }
> {
  if (!ubicazioneId) {
    return { success: false, error: "Posto non indicato." };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const q = new URLSearchParams({ ubicazioneId });
    const res = await fetch(`/api/magazzino/posto-mappa?${q}`, {
      credentials: "include",
      cache: "no-store",
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | ({ success: true } & MappaLateralePosto)
      | { success: false; error?: string }
      | null;
    if (!data || !data.success) {
      return {
        success: false,
        error:
          data && "error" in data && data.error
            ? data.error
            : "Mappa non disponibile.",
      };
    }
    return {
      success: true,
      data: {
        mappa: data.mappa,
        postoCodice: data.postoCodice,
        postoNome: data.postoNome,
        fotoPrincipali: data.fotoPrincipali ?? {},
        riepilogoPosti: data.riepilogoPosti ?? {},
      },
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      success: false,
      error: aborted
        ? "Lettura mappa troppo lenta. Riprova."
        : "Mappa non disponibile.",
    };
  } finally {
    clearTimeout(timer);
  }
}
