import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrdiniStoricoBoard } from "@/components/amministrazione/OrdiniStoricoBoard";
import { RegistroAccessiBoard } from "@/components/amministrazione/RegistroAccessiBoard";
import { DocumentazioniBoard } from "@/components/amministrazione/DocumentazioniBoard";
import { TicketBoard } from "@/components/strumenti/TicketBoard";
import { ContrattiFiscaliBoard } from "@/components/amministrazione/ContrattiFiscaliBoard";
import { CatalogoOffertaBoard } from "@/components/amministrazione/CatalogoOffertaBoard";
import { ChatArgomentiStoricoBoard } from "@/components/chat/ChatArgomentiStoricoBoard";
import { ChatDiretteEliminateBoard } from "@/components/chat/ChatDiretteEliminateBoard";
import { FogliLavorazioneBoard } from "@/components/produzione/FogliLavorazioneBoard";
import { SchedeOrdiniBoard } from "@/components/produzione/SchedeOrdiniBoard";
import { ScalettaProduzioneBoard } from "@/components/produzione/ScalettaProduzioneBoard";
import { Suspense } from "react";
import { FogliIngressoMpBoard } from "@/components/produzione/FogliIngressoMpBoard";
import { ProcessiStoricoBoard } from "@/components/produzione/ProcessiStoricoBoard";
import { ProcessiAttivitaStoricoBoard } from "@/components/produzione/ProcessiAttivitaStoricoBoard";
import { RsRicercheBoard } from "@/components/ricerca-sviluppo/RsRicercheBoard";
import { MagazzinoProdottiBoard } from "@/components/magazzino/MagazzinoProdottiBoard";
import { NoteAcquistoBoard } from "@/components/magazzino/NoteAcquistoBoard";
import { WebmailBoard } from "@/components/commerciale/WebmailBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  ArchivioIotFunzionamentoBoard,
  ArchivioIotLeggendaMexBoard,
} from "@/components/archivio/ArchivioIotLeggendaMexBoard";
import { ArchivioIotWikiBoard } from "@/components/archivio/ArchivioIotWikiBoard";
import { ArchivioTutorialBoard } from "@/components/archivio/ArchivioTutorialBoard";
import { AreaPlaceholder } from "@/components/areas/AreaPlaceholder";
import {
  requireArchivioSource,
  requireAreaAccess,
  requireSuperadmin,
} from "@/lib/areas/guard";
import {
  filterArchivioNavByAccess,
  getFirstArchivioPath,
  mergeArchivioWebmailCaselle,
  resolveArchivioPage,
} from "@/lib/areas/archivio";
import { firstLeafPath, findNavItem, isNavBranch } from "@/lib/areas/nav-tree";
import { listWebmailAccountsAction } from "@/app/actions/webmail";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ segments?: string[] }>;
};

function sourceOf(segment: string | undefined) {
  if (
    segment === "amministrazione" ||
    segment === "ricerca-sviluppo" ||
    segment === "produzione" ||
    segment === "chat" ||
    segment === "webmail" ||
    segment === "magazzino" ||
    segment === "strumenti" ||
    segment === "area-fiscale"
  ) {
    return segment;
  }
  return null;
}

export default async function ArchivioCatchAllPage({ params }: Props) {
  const { segments = [] } = await params;
  const source = sourceOf(segments[0]);

  if (segments.length === 0) {
    const { auth } = await requireAreaAccess("archivio");
    const nav = filterArchivioNavByAccess(auth.areas);
    redirect(getFirstArchivioPath(nav));
  }

  if (segments[0] === "tutorial") {
    await requireAreaAccess("archivio");
    if (segments.length > 1) notFound();
    return (
      <>
        <AppHeader
          title="Tutorial"
          subtitle="Guida di ogni area, funzione, lotto e processo — cerca e apri le schede qui dentro"
        />
        <div className="p-6">
          <ArchivioTutorialBoard />
        </div>
      </>
    );
  }

  if (segments[0] === "iot") {
    await requireAreaAccess("archivio");
    if (segments.length === 1) {
      return (
        <>
          <AppHeader
            title="IoT"
            subtitle="Funzionamento dei messaggi Mex fra gestionale e dispositivi"
          />
          <div className="p-6">
            <ArchivioIotFunzionamentoBoard />
          </div>
        </>
      );
    }
    if (segments[1] === "leggenda-mex" && !segments[2]) {
      return (
        <>
          <AppHeader
            title="Leggenda Mex"
            subtitle="Codifica, significato e checksum dei messaggi inviati e ricevuti"
          />
          <div className="p-6">
            <ArchivioIotLeggendaMexBoard />
          </div>
        </>
      );
    }
    if (segments[1] === "wiki" && !segments[2]) {
      return (
        <>
          <AppHeader
            title="Wiki IoT"
            subtitle="Protocollo Mex, sicurezza, apprendimento A+ e riferimento API — cerca le schede"
          />
          <div className="p-6">
            <ArchivioIotWikiBoard />
          </div>
        </>
      );
    }
    notFound();
  }

  if (!source) notFound();
  const { auth } = await requireArchivioSource(source);

  if (
    segments[0] === "webmail" &&
    segments[1] === "caselle" &&
    segments[2] &&
    UUID_RE.test(segments[2])
  ) {
    const accountId = segments[2];
    if (!segments[3]) {
      redirect(`/app/archivio/webmail/caselle/${accountId}/archiviate`);
    }
    if (segments[3] !== "archiviate" || segments[4]) notFound();

    const supabase = await createClient();
    const { data: account, error } = await supabase
      .from("webmail_accounts")
      .select("id, label, email_address")
      .eq("id", accountId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !account) notFound();

    return (
      <>
        <AppHeader
          title={`${account.label} · Archiviate`}
          subtitle={`${account.email_address} · mail archiviate (non cestino)`}
        />
        <div className="p-6">
          <WebmailBoard
            initialAccountId={account.id}
            view="archiviate"
            hideTopFilters
          />
        </div>
      </>
    );
  }

  if (segments[0] === "webmail" && segments[1] === "caselle" && !segments[2]) {
    const accRes = await listWebmailAccountsAction();
    const accounts = accRes.success ? accRes.accounts : [];
    return (
      <>
        <AppHeader
          title="Caselle Mail"
          subtitle="Scegli la casella per vedere le mail archiviate"
        />
        <div className="p-6">
          {accounts.length === 0 ? (
            <AreaPlaceholder
              title="Nessuna casella"
              description="Non risultano caselle WebMail visibili."
            />
          ) : (
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/app/archivio/webmail/caselle/${a.id}/archiviate`}
                    className="block rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className="ml-2 text-[var(--muted)]">
                      {a.emailAddress}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  const page = resolveArchivioPage(segments);
  const navItem = findNavItem(
    mergeArchivioWebmailCaselle(filterArchivioNavByAccess(auth.areas), []),
    segments
  );
  if (navItem && isNavBranch(navItem) && navItem.children.length > 0) {
    redirect(firstLeafPath(navItem));
  }
  if (!page) notFound();

  const key = segments.join("/");

  if (key === "amministrazione/ordini/storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <OrdiniStoricoBoard />
        </div>
      </>
    );
  }

  if (key === "amministrazione/registro-accessi") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <RegistroAccessiBoard />
        </div>
      </>
    );
  }

  if (key === "strumenti/ticket") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <Suspense fallback={<p className="text-sm text-slate-600">Apro i ticket…</p>}>
            <TicketBoard mode="archivio" />
          </Suspense>
        </div>
      </>
    );
  }

  if (key === "amministrazione/documentazioni") {
    await requireSuperadmin();
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <DocumentazioniBoard mode="archivio" />
        </div>
      </>
    );
  }

  if (key === "ricerca-sviluppo/ricerche-scientifiche") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <RsRicercheBoard tipo={null} mode="archivio" />
        </div>
      </>
    );
  }

  if (key === "produzione/foglio-ingresso-mp/storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliIngressoMpBoard storico />
        </div>
      </>
    );
  }

  if (key === "produzione/ordini/schede") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <Suspense fallback={<p className="text-sm text-slate-500">Caricamento schede…</p>}>
            <SchedeOrdiniBoard archivio />
          </Suspense>
        </div>
      </>
    );
  }

  if (key === "produzione/ordini/scaletta") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ScalettaProduzioneBoard archivio />
        </div>
      </>
    );
  }

  if (key === "produzione/fogli-lavorazione/storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <FogliLavorazioneBoard initialFilter="chiusi" />
        </div>
      </>
    );
  }

  if (key === "produzione/processi-e-attivita/storico-processi") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiStoricoBoard />
        </div>
      </>
    );
  }

  if (key === "produzione/processi-e-attivita/storico-attivita") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ProcessiAttivitaStoricoBoard />
        </div>
      </>
    );
  }

  if (key === "chat/argomenti/storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ChatArgomentiStoricoBoard />
        </div>
      </>
    );
  }

  if (key === "chat/dirette/eliminate") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ChatDiretteEliminateBoard userId={auth.userId} />
        </div>
      </>
    );
  }

  if (key === "magazzino/materia-prima/storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <MagazzinoProdottiBoard catalogKind="materia_prima" />
        </div>
      </>
    );
  }

  if (key === "magazzino/prodotti-di-consumo/eliminati-obsoleti") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <CatalogoOffertaBoard kind="prodotto" onlyDeleted />
        </div>
      </>
    );
  }

  if (key === "magazzino/note-di-acquisto/storico") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <NoteAcquistoBoard mode="storico" />
        </div>
      </>
    );
  }

  if (key === "area-fiscale/contratti/archivio") {
    return (
      <>
        <AppHeader title={page.label} subtitle={page.description} />
        <div className="p-6">
          <ContrattiFiscaliBoard mode="archivio" />
        </div>
      </>
    );
  }

  return (
    <AreaPlaceholder title={page.label} description={page.description} />
  );
}
