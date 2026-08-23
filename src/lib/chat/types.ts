export type MessageStatus = "sent" | "delivered" | "read";
export type PeerKind = "customer" | "producer";
export type ChatStatus = "available" | "away" | "offline";

export type Conversation = {
  id: string;
  customerId: string;
  producerId: string;
  listingId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  status: MessageStatus;
  audioUrl: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileName: string | null;
};

export type ChatContact = {
  id: string;
  ownerId: string;
  peerId: string;
  peerKind: PeerKind;
  lastInteractionAt: string;
  peerName?: string;
  peerEmail?: string;
  peerChatStatus?: ChatStatus;
};

export type ConversationListItem = Conversation & {
  peerId: string;
  peerName: string;
  peerEmail: string;
  peerChatStatus: ChatStatus;
  lastMessage: string | null;
  unreadCount: number;
};

export function mapConversation(row: {
  id: string;
  customer_id: string;
  producer_id: string;
  listing_id: string | null;
  created_at: string;
  updated_at: string;
}): Conversation {
  return {
    id: row.id,
    customerId: row.customer_id,
    producerId: row.producer_id,
    listingId: row.listing_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  status: MessageStatus;
  audio_url: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
}): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content ?? "",
    createdAt: row.created_at,
    isRead: Boolean(row.is_read),
    status: row.status,
    audioUrl: row.audio_url,
    fileUrl: row.file_url,
    fileType: row.file_type,
    fileName: row.file_name,
  };
}

export function peerIdOf(c: Conversation, viewerId: string): string {
  return c.customerId === viewerId ? c.producerId : c.customerId;
}
