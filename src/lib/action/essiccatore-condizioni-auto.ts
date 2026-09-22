/**
 * Condizioni di Avvio rilevate, non digitate.
 * Clima: ultima lettura TEMP-AMB / UMID-AMB (storico in DB).
 * Kg: somma effetti essiccatore.carica_cestone eseguiti sul foglio.
 */

import { createServiceClient } from "@/lib/supabase/server";

export type FonteKgAvvio = "foglio" | "foglio_assente";
export type FonteClimaAvvio = "sonda" | "assente";

export type CondizioniAvvioAuto = {
  essiccatoreId: string;
  kgProdotto: number;
  kgFonte: FonteKgAvvio;
  kgNota: string;
  tempAmbienteC: number;
  umiditaAmbientePct: number;
  climaFonte: FonteClimaAvvio;
  climaLettoAt: string | null;
  climaNota: string;
};

export async function kgDaFoglioLavorazione(essiccatoreId: string): Promise<{
  kg: number;
  fonte: FonteKgAvvio;
  nota: string;
}> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("produzione_foglio_processo_effetti")
      .select("qty_effettiva")
      .eq("tipo", "essiccatore.carica_cestone")
      .eq("essiccatore_id", essiccatoreId)
      .eq("esito", "eseguito")
      .is("deleted_at", null);
    if (error) {
      return {
        kg: 0,
        fonte: "foglio_assente",
        nota: "Storico carichi cestone non disponibile. Scarico libero 0 kg.",
      };
    }
    const rows = (data ?? []) as Array<{ qty_effettiva: number | string | null }>;
    if (rows.length === 0) {
      return {
        kg: 0,
        fonte: "foglio_assente",
        nota: "Nessun carico cestone registrato sul foglio. Scarico libero 0 kg.",
      };
    }
    const kg = rows.reduce(
      (sum, row) => sum + (Number(row.qty_effettiva) || 0),
      0
    );
    return {
      kg,
      fonte: "foglio",
      nota: `Somma carichi cestone dal foglio: ${kg.toLocaleString("it-IT")} kg.`,
    };
  } catch {
    return {
      kg: 0,
      fonte: "foglio_assente",
      nota: "Il foglio di lavoro (carichi nel cestone) non è ancora collegato. Scarico libero 0 kg.",
    };
  }
}

export function formatCondizioniAuto(c: CondizioniAvvioAuto): string {
  const kg =
    c.kgFonte === "foglio"
      ? `${c.kgProdotto.toLocaleString("it-IT")} kg dal foglio`
      : "0 kg · foglio non collegato";
  const clima =
    c.climaFonte === "sonda"
      ? `${c.tempAmbienteC}°C / ${c.umiditaAmbientePct}% UR (sonda)`
      : "clima sonda non ancora ricevuto";
  return `${kg} · ${clima}`;
}
