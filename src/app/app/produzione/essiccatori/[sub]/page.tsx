import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";

type Props = {
  params: Promise<{ sub: string }>;
};

export default async function EssiccatoriSubRedirect({ params }: Props) {
  await requireAreaAccess("produzione");
  const { sub } = await params;
  if (sub === "gestione") {
    redirect("/app/produzione/gestione-aree/essiccatori");
  }
  redirect("/app/produzione/gestione-aree/essiccatori");
}
