const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// -----------------------------------------------------------------------------
// Lab 3 — every call carries the session cookie (docs/lab-03/api-spec.md §0). The old
// X-Requester-Id header and requesterId parameters are gone (BR-13).
// -----------------------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  code?: string;
  fields: Record<string, string>;
  allowed?: string[];
  constructor(status: number, body: { error?: string; code?: string; fields?: Record<string, string>; allowed?: string[] } | null) {
    super(body?.error ?? "Request failed");
    this.status = status;
    this.code = body?.code;
    this.fields = body?.fields ?? {};
    this.allowed = body?.allowed;
  }
}

async function readBody(res: Response) {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// AC-30 — when a session is revoked or expires mid-use, the API answers 401. That is announced once
// here so AuthProvider can clear the user and RequireAuth can return to Login, instead of every
// screen showing a generic failure while looking signed in (review on PR #40). Login's own 401
// (wrong credentials) and the boot-time /me probe are not session loss and stay silent.
export const UNAUTHENTICATED_EVENT = "toktickit:unauthenticated";
const SILENT_401 = new Set(["/api/auth/login", "/api/auth/me"]);

export function announceUnauthenticated(path: string) {
  if (SILENT_401.has(path)) return;
  window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  if (res.status === 204) return undefined as T;
  const body = await readBody(res);
  if (res.status === 401) announceUnauthenticated(path.split("?")[0]);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 (Lab 1) — verify the backend is up, then load the categories.
export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) throw new Error("Unable to connect to TokTickIT API");

  const categoriesRes = await fetch(`${API_URL}/api/categories`);
  if (!categoriesRes.ok) throw new Error("Unable to connect to TokTickIT API");
  const categories: Category[] = await categoriesRes.json();

  return { online: true, categories };
}

// -----------------------------------------------------------------------------
// Lab 3 Issue 2 — authentication (api-spec.md §1)
// -----------------------------------------------------------------------------
export type Role = "REQUESTER" | "IT_STAFF" | "ADMIN";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const body = await apiFetch<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return body.user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/api/auth/logout", { method: "POST" });
}

// Returns null (instead of throwing) when there is no session, so the app can boot quietly.
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const body = await apiFetch<{ user: AuthUser }>("/api/auth/me");
    return body.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<AuthUser> {
  const body = await apiFetch<{ user: AuthUser }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.user;
}

// -----------------------------------------------------------------------------
// Lab 2 Issue 3 — Create Ticket (docs/lab-02/api-spec.md §2-4).
// -----------------------------------------------------------------------------
export interface RelatedSystem {
  id: number;
  name: string;
}

export async function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/api/categories");
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  return apiFetch<RelatedSystem[]>("/api/related-systems");
}

export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
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

export async function createTicket(input: CreateTicketInput): Promise<CreatedTicket> {
  const form = new FormData();
  form.set("categoryId", String(input.categoryId));
  form.set("relatedSystemId", String(input.relatedSystemId));
  form.set("summary", input.summary);
  form.set("description", input.description);
  form.set("requestedPriority", input.requestedPriority);
  for (const file of input.attachments) form.append("attachments", file);

  try {
    return await apiFetch<CreatedTicket>("/api/tickets", { method: "POST", body: form });
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) throw new TicketValidationError(err.fields);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Lab 2 Issue 4 — My Tickets (docs/lab-02/api-spec.md §5).
// -----------------------------------------------------------------------------
export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryId: number;
  requestedPriority: Priority;
  currentStatus: TicketStatus;
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

export function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

export async function getMyTickets(query: TicketListQuery): Promise<TicketListResult> {
  return apiFetch<TicketListResult>(`/api/tickets?${toQueryString(query as Record<string, unknown>)}`);
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
  requestedPriority: Priority;
  currentStatus: TicketStatus;
  attachments: AttachmentInfo[];
}

export async function getTicketDetail(ticketNumber: string): Promise<TicketDetail | null> {
  try {
    return await apiFetch<TicketDetail>(`/api/tickets/${encodeURIComponent(ticketNumber)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null; // BR-22 — not found and not-owned look identical
    throw err;
  }
}

// Thrown on 400 (attachment validation) so the UI can show what went wrong.
export class AttachmentValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super("Invalid attachment");
    this.fields = fields;
  }
}

export async function addAttachment(ticketNumber: string, file: File): Promise<AttachmentInfo> {
  const form = new FormData();
  form.append("file", file);
  try {
    return await apiFetch<AttachmentInfo>(`/api/tickets/${encodeURIComponent(ticketNumber)}/attachments`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) throw new AttachmentValidationError(err.fields);
    throw err;
  }
}

export async function removeAttachment(attachmentId: number, reason: string): Promise<AttachmentInfo> {
  return apiFetch<AttachmentInfo>(`/api/attachments/${attachmentId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

// Downloads happen via a credentialed fetch, then hand the browser a blob URL to save — same end
// result as a normal file download link, but the session cookie decides who may fetch it.
export async function downloadAttachment(attachment: AttachmentInfo): Promise<void> {
  const res = await fetch(`${API_URL}/api/attachments/${attachment.id}/download`, { credentials: "include" });
  if (res.status === 401) announceUnauthenticated("/api/attachments/download");
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
