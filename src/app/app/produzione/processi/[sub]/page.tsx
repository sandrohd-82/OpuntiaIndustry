import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ sub: string }>;
};

/** Compatibilità path /processi/* → processi-e-attivita/* */
export default async function ProcessiSubRedirect({ params }: Props) {
  await requireAreaAccess("produzione");
  const { sub } = await params;
  if (sub === "elenco") {
    redirect("/app/produzione/processi-e-attivita/elenco-processi");
  }
  if (sub === "attivita") {
    redirect("/app/produzione/processi-e-attivita/elenco-attivita");
  }
  redirect("/app/produzione/processi-e-attivita");
}
