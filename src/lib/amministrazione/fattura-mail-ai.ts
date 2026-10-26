import { testoMailFatturaCortesia } from "@/lib/amministrazione/ordine-mail-bozza";

export async function generaTestoMailFattura(input: {
  cliente: string;
  numeroFattura: string;
  dataDocumento: string;
  ordineNumero: string;
  prodotti: string;
  totaleEuro: string;
}): Promise<{ subject: string; bodyText: string; model: string }> {
  const numero = input.numeroFattura.trim() || "fattura";
  const data = input.dataDocumento.trim();
  const fallback = templateMailFattura({
    numero,
    data,
    ordine: input.ordineNumero.trim(),
    prodotti: input.prodotti.trim() || "indicate in fattura",
  });
  return { ...fallback, model: "template" };
}

function templateMailFattura(input: {
  numero: string;
  data: string;
  ordine: string;
  prodotti: string;
}): { subject: string; bodyText: string } {
  const dataRiga = input.data
    ? ` del ${input.data.split("-").reverse().join("/")}`
    : "";
  const cortesia = testoMailFatturaCortesia({
    numeroOrdine: input.ordine,
    prodotti: input.prodotti,
  });
  return {
    subject: `Fattura ${input.numero}${dataRiga}`,
    bodyText: cortesia.bodyText,
  };
}
