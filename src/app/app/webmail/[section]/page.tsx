import { notFound, redirect } from "next/navigation";
import { WebmailBoard } from "@/components/commerciale/WebmailBoard";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireWebmailAccess } from "@/lib/areas/guard";
import {
  WEBMAIL_SECTIONS,
  resolveWebmailPage,
} from "@/lib/areas/webmail";
import { isNavBranch } from "@/lib/areas/nav-tree";

type Props = {
  params: Promise<{ section: string }>;
};

export default async function WebmailSectionPage({ params }: Props) {
  await requireWebmailAccess();

  const { section } = await params;
  const item = WEBMAIL_SECTIONS.find((s) => s.slug === section);
  if (!item) notFound();

  if (isNavBranch(item)) {
    const first = item.children[0];
    if (!first) notFound();
    redirect(first.path);
  }

  const page = resolveWebmailPage([section]);
  if (!page) notFound();

  return (
    <>
      <AppHeader title="WebMail" subtitle={page.description} />
      <div className="p-6">
        <WebmailBoard />
      </div>
    </>
  );
}
