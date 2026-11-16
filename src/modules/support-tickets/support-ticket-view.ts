import type {
  SupportTicketAuthorType,
  SupportTicketKind,
  SupportTicketStatus,
} from '@prisma/client';

export interface SupportTicketMessageView {
  id: string;
  authorType: SupportTicketAuthorType;
  body: string;
  createdAt: Date;
  author: { id: string; name: string } | null;
}

export interface SupportTicketView {
  id: string;
  kind: SupportTicketKind;
  /** Talebin ilk mesaji (yazismanin basi). */
  message: string;
  status: SupportTicketStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string; email: string } | null;
  /** Ilk mesajdan sonraki yazisma, eskiden yeniye. */
  messages: SupportTicketMessageView[];
}

export interface AdminSupportTicketView extends SupportTicketView {
  tenant: { id: string; name: string; slug: string };
}

/** Realtime: talep/yazisma degisince ilgili tenant'a gider. */
export const SUPPORT_TICKET_UPDATED_EVENT = 'support.ticket.updated';

/** Realtime: talep/yazisma degisince super admin oturumlarina gider. */
export const SUPPORT_TICKET_CREATED_EVENT = 'support.ticket.created';

export const SUPPORT_TICKET_SELECT = {
  id: true,
  kind: true,
  message: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
  messages: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      authorType: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  },
} as const;

export const ADMIN_SUPPORT_TICKET_SELECT = {
  ...SUPPORT_TICKET_SELECT,
  tenant: { select: { id: true, name: true, slug: true } },
} as const;
