const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — verify the backend is up, then load the categories.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) throw new Error("Unable to connect to TokTickIT API");

  const categoriesRes = await fetch(`${API_URL}/api/categories`);
  if (!categoriesRes.ok) throw new Error("Unable to connect to TokTickIT API");
  const categories: Category[] = await categoriesRes.json();

  return { online: true, categories };
}

// -----------------------------------------------------------------------------
// Lab 2 Issue 2 — Development Requester context (docs/lab-02/api-spec.md §1).
// This is a testing mechanism, not authentication (BR-03/BR-09).
// -----------------------------------------------------------------------------
export interface Requester {
  id: number;
  name: string;
  email: string;
}

export async function getActiveRequesters(): Promise<Requester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) throw new Error("Unable to load development requesters");
  return res.json();
}

// -----------------------------------------------------------------------------
// Lab 2 Issue 3 — Create Ticket (docs/lab-02/api-spec.md §2-4).
// -----------------------------------------------------------------------------
export interface RelatedSystem {
  id: number;
  name: string;
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories`);
  if (!res.ok) throw new Error("Unable to load categories");
  return res.json();
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_URL}/api/related-systems`);
  if (!res.ok) throw new Error("Unable to load related systems");
  return res.json();
}

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  attachments: File[];
}

export interface AttachmentError {
  filename: string;
  reason: string;
}

export interface CreatedTicket {
  id: number;
  ticketNumber: string;
  attachments: { id: number; originalFilename: string; sizeBytes: number }[];
  attachmentErrors: AttachmentError[];
}

// Thrown on 400 (validation) so the UI can show field-level messages (AC-04/AC-05).
export class TicketValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super("Invalid ticket data");
    this.fields = fields;
  }
}

export async function createTicket(requesterId: number, input: CreateTicketInput): Promise<CreatedTicket> {
  const form = new FormData();
  form.set("categoryId", String(input.categoryId));
  form.set("relatedSystemId", String(input.relatedSystemId));
  form.set("summary", input.summary);
  form.set("description", input.description);
  form.set("requestedPriority", input.requestedPriority);
  for (const file of input.attachments) form.append("attachments", file);

  const res = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: { "X-Requester-Id": String(requesterId) },
    body: form,
  });

  if (res.status === 400) {
    const body = await res.json();
    throw new TicketValidationError(body.fields ?? {});
  }
  if (!res.ok) throw new Error("Unable to create ticket");
  return res.json();
}

// -----------------------------------------------------------------------------
// Lab 2 Issue 4 — My Tickets (docs/lab-02/api-spec.md §5).
// -----------------------------------------------------------------------------
export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryId: number;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  currentStatus: "NEW";
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResult {
  items: TicketListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketListQuery {
  search?: string;
  categoryId?: number;
  requestedPriority?: string;
  currentStatus?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function getMyTickets(requesterId: number, query: TicketListQuery): Promise<TicketListResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const res = await fetch(`${API_URL}/api/tickets?${params.toString()}`, {
    headers: { "X-Requester-Id": String(requesterId) },
  });
  if (!res.ok) throw new Error("Unable to load tickets");
  return res.json();
}

// -----------------------------------------------------------------------------
// Lab 2 Issue 5 — Requester Ticket Detail and Attachments (api-spec.md §6-10).
// -----------------------------------------------------------------------------
export interface AttachmentInfo {
  id: number;
  ticketId: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  removedAt: string | null;
  removedReason: string | null;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  currentStatus: "NEW";
  attachments: AttachmentInfo[];
}

export async function getTicketDetail(requesterId: number, ticketNumber: string): Promise<TicketDetail | null> {
  const res = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(ticketNumber)}`, {
    headers: { "X-Requester-Id": String(requesterId) },
  });
  if (res.status === 404) return null; // BR-22 — not found and not-owned look identical
  if (!res.ok) throw new Error("Unable to load ticket");
  return res.json();
}

// Thrown on 400 (attachment validation) so the UI can show what went wrong.
export class AttachmentValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super("Invalid attachment");
    this.fields = fields;
  }
}

export async function addAttachment(requesterId: number, ticketNumber: string, file: File): Promise<AttachmentInfo> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(ticketNumber)}/attachments`, {
    method: "POST",
    headers: { "X-Requester-Id": String(requesterId) },
    body: form,
  });
  if (res.status === 400) {
    const body = await res.json();
    throw new AttachmentValidationError(body.fields ?? {});
  }
  if (!res.ok) throw new Error("Unable to add attachment");
  return res.json();
}

export async function removeAttachment(
  requesterId: number,
  attachmentId: number,
  reason: string
): Promise<AttachmentInfo> {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: { "X-Requester-Id": String(requesterId), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error("Unable to remove attachment");
  return res.json();
}

// Downloads happen via header-authenticated fetch (a plain <a href> can't set X-Requester-Id),
// then hands the browser a blob URL to save — same end result as a normal file download link.
export async function downloadAttachment(requesterId: number, attachment: AttachmentInfo): Promise<void> {
  const res = await fetch(`${API_URL}/api/attachments/${attachment.id}/download`, {
    headers: { "X-Requester-Id": String(requesterId) },
  });
  if (!res.ok) throw new Error("Unable to download attachment");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.originalFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
