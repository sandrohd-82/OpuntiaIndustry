import { notFound } from "next/navigation";
import { getDecodificaLottoPubblicoAction } from "@/app/actions/lotti-esterni";
import { DecodificaView } from "@/components/produzione/LottoEsternoDecoderBoard";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Tracciabilità lotto",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ token: string }>;
};

export default async function PublicLottoPage({ params }: Props) {
  const { token } = await params;
  const res = await getDecodificaLottoPubblicoAction(token);
  if (!res.success) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-white px-5 py-10 text-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
        Opuntia · tracciabilità prodotto
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Storia pubblica del lotto in uscita. Alcuni passaggi possono essere
        nascosti dal produttore.
      </p>
      <div className="mt-6">
        <DecodificaView data={res.data} />
      </div>
    </main>
  );
}
