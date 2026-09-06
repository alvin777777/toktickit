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
