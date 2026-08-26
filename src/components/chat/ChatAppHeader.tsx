"use client";

import { ChatHeaderTools } from "@/components/chat/ChatHeaderTools";
import { AppHeader } from "@/components/layout/AppHeader";

type Props = {
  title: string;
  subtitle?: string;
  userId: string;
};

/** Header area Chat con lente e export PDF a sinistra di Esci. */
export function ChatAppHeader({ title, subtitle, userId }: Props) {
  return (
    <AppHeader
      title={title}
      subtitle={subtitle}
      actions={<ChatHeaderTools userId={userId} />}
    />
  );
}
