import { AnagraficaPubblicaForm } from "@/components/anagrafica/AnagraficaPubblicaForm";
import { leggiRichiestaPubblica } from "@/lib/anagrafica/richiesta-db";

export const dynamic = "force-dynamic";

export default async function RequestDataPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const iniziale = await leggiRichiestaPubblica(token);
  return <AnagraficaPubblicaForm token={token} iniziale={iniziale} />;
}
