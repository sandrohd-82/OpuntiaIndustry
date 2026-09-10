"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniProcessatiBoard() {
  return (
    <OrdiniBoard
      stato={["in_attesa", "ricevuto", "in_scaletta", "evaso"]}
      description="Coda in attesa di processazione e ordini già inseriti in scaletta. Processa assegna i giorni di produzione e firma l’operazione."
      createLabel="Crea ordine"
      emptyTitle="Nessun ordine in coda o in scaletta"
      emptyHint="Gli ordini creati restano in attesa finché amministrazione o produzione non li processano."
      loadingLabel="Caricamento ordini processati…"
      processMode
    />
  );
}
