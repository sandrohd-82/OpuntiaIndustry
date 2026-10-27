export type RitiroMezzo = "personalmente" | "corriere_cliente";
export type AvvisoMerceCanale = "tel" | "mail";

export type ContattoRitiro = {
  valore: string;
  etichetta: string;
};

export function labelRitiroMezzo(mezzo: string | null | undefined): string {
  if (mezzo === "personalmente") return "Personalmente";
  if (mezzo === "corriere_cliente") return "A mezzo corriere del cliente";
  return "Non indicato";
}
