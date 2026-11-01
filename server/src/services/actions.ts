import type { ActionStatus, Prisma, TicketStatus } from "@prisma/client";
import { allowedTransitions } from "./ticketWorkflow.js";

// Lab 4 — Actions Taken rules (docs/lab-04/specification.md BR-01..BR-16, BR-20). Everything here is
// pure so the unit tests can cover every boundary without a database.

export const ACTION_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

// BR-08 — creation targets and transitions. COMPLETED / CANCELLED are final (BR-09).
export const ACTION_CREATE_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];
const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedActionTransitions(from: ActionStatus): ActionStatus[] {
  return [...ACTION_TRANSITIONS[from]];
}

export function canActionTransition(from: ActionStatus, to: ActionStatus): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

export function isActionFinal(status: ActionStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function isActionOpen(status: ActionStatus): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS";
}

export function isActionStatus(value: unknown): value is ActionStatus {
  return typeof value === "string" && (ACTION_STATUSES as string[]).includes(value);
}

// BR-10 — the Ticket statuses on which work may still be recorded. Also the BR-27 "Active" set.
export const WORKABLE_STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
export function isWorkable(status: TicketStatus): boolean {
  return WORKABLE_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Field validation (BR-04..BR-07). The result is validated as a whole: on an edit the stored values
// are merged with the supplied changes first, so e.g. completing an action whose stored result is
// empty fails on `result` even though the request never mentioned it (api-spec.md §1.3).
// ---------------------------------------------------------------------------
export const LIMITS = { descriptionMin: 5, descriptionMax: 1000, result: 2000, followUpNote: 1000, attachmentNotes: 500 };
const MINUTE = 60 * 1000;
const FUTURE_SKEW_MS = 5 * MINUTE;
const PLANNED_HORIZON_MS = 90 * 24 * 60 * MINUTE;

export interface ActionFields {
  actionAt: Date;
  description: string;
  result: string | null;
  status: ActionStatus;
  performedById: number;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
}

type Raw = Record<string, unknown>;

function optionalText(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t === "" ? null : t;
}

/**
 * Validates a create (`existing` undefined) or an edit (`existing` = stored fields). `status` is the
 * status the action will have afterwards — transitions themselves are checked by the caller (409,
 * not 400). Returns the normalised fields to store, or field errors.
 */
export function validateAction(
  body: Raw,
  opts: { existing?: ActionFields; status: ActionStatus; actorId: number; ticketCreatedAt: Date; now: Date }
): { fields?: ActionFields; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const base = opts.existing;

  // actionAt — required on create (BR-04)
  let actionAt = base?.actionAt;
  if (body.actionAt !== undefined || !base) {
    const parsed = typeof body.actionAt === "string" ? new Date(body.actionAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) errors.actionAt = "Enter a valid date and time.";
    else actionAt = parsed;
  }
  if (actionAt && !errors.actionAt) {
    // A datetime-local control has minute precision, so the comparison with the ticket's creation
    // allows the same minute (an action recorded right after creating the ticket must be valid).
    if (actionAt.getTime() < opts.ticketCreatedAt.getTime() - MINUTE) {
      errors.actionAt = "Action date cannot be before the ticket was created.";
    } else {
      const limit = opts.status === "PLANNED" ? PLANNED_HORIZON_MS : FUTURE_SKEW_MS;
      if (actionAt.getTime() > opts.now.getTime() + limit) {
        errors.actionAt = opts.status === "PLANNED" ? "A planned action can be at most 90 days ahead." : "Action date cannot be in the future.";
      }
    }
  }

  // description — required, 5–1000 (BR-05)
  let description = base?.description ?? "";
  if (body.description !== undefined || !base) {
    description = typeof body.description === "string" ? body.description.trim() : "";
  }
  if (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax) {
    errors.description = `Description must be ${LIMITS.descriptionMin}-${LIMITS.descriptionMax} characters.`;
  }

  // result — optional while open, required to complete (BR-05)
  let result = base?.result ?? null;
  if (body.result !== undefined) {
    const r = optionalText(body.result);
    if (r === undefined) errors.result = "Result must be text.";
    else result = r;
  }
  if (!errors.result) {
    if (result && result.length > LIMITS.result) errors.result = `Result must be at most ${LIMITS.result} characters.`;
    else if (opts.status === "COMPLETED" && !result) errors.result = "Result is required to complete an action.";
  }

  // performer — defaults to the actor; existence/role/activity is checked by the caller (BR-03)
  let performedById = base?.performedById ?? opts.actorId;
  if (body.performedById !== undefined && body.performedById !== null) {
    const n = Number(body.performedById);
    if (!Number.isInteger(n) || n <= 0 || typeof body.performedById === "boolean") {
      errors.performedById = "Select an active IT Staff or Administrator.";
    } else performedById = n;
  }

  // follow-up (BR-06)
  let followUpRequired = base?.followUpRequired ?? false;
  if (body.followUpRequired !== undefined) {
    if (typeof body.followUpRequired !== "boolean") errors.followUpRequired = "Must be true or false.";
    else followUpRequired = body.followUpRequired;
  }
  let followUpNote = base?.followUpNote ?? null;
  if (body.followUpNote !== undefined) {
    const n = optionalText(body.followUpNote);
    if (n === undefined) errors.followUpNote = "Follow-up note must be text.";
    else followUpNote = n;
  }
  if (!followUpRequired) followUpNote = null;
  else if (!errors.followUpNote) {
    if (!followUpNote) errors.followUpNote = "Follow-up note is required when follow-up is needed.";
    else if (followUpNote.length > LIMITS.followUpNote) errors.followUpNote = `Follow-up note must be at most ${LIMITS.followUpNote} characters.`;
  }

  // attachment notes (BR-07)
  let attachmentNotes = base?.attachmentNotes ?? null;
  if (body.attachmentNotes !== undefined) {
    const a = optionalText(body.attachmentNotes);
    if (a === undefined) errors.attachmentNotes = "Attachment notes must be text.";
    else attachmentNotes = a;
  }
  if (attachmentNotes && attachmentNotes.length > LIMITS.attachmentNotes) {
    errors.attachmentNotes = `Attachment notes must be at most ${LIMITS.attachmentNotes} characters.`;
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    fields: { actionAt: actionAt!, description, result, status: opts.status, performedById, followUpRequired, followUpNote, attachmentNotes },
  };
}

// ---------------------------------------------------------------------------
// BR-20 — resolution gate. Returns every unmet requirement; [] means RESOLVED is allowed.
// ---------------------------------------------------------------------------
export type ResolutionBlocker = "OWNER_REQUIRED" | "NO_COMPLETED_ACTION" | "OPEN_ACTIONS" | "FOLLOW_UP_PENDING";

export interface GateAction {
  id: number;
  status: ActionStatus;
  actionAt: Date;
  followUpRequired: boolean;
}

export function compareActions(a: { actionAt: Date; id: number }, b: { actionAt: Date; id: number }): number {
  return a.actionAt.getTime() - b.actionAt.getTime() || a.id - b.id; // BR-16
}

export function resolutionBlockers(ticket: { ownerId: number | null }, actions: GateAction[]): ResolutionBlocker[] {
  const blockers: ResolutionBlocker[] = [];
  if (!ticket.ownerId) blockers.push("OWNER_REQUIRED");
  const completed = actions.filter((a) => a.status === "COMPLETED").sort(compareActions);
  if (completed.length === 0) blockers.push("NO_COMPLETED_ACTION");
  if (actions.some((a) => isActionOpen(a.status))) blockers.push("OPEN_ACTIONS");
  if (completed.length > 0 && completed[completed.length - 1].followUpRequired) blockers.push("FOLLOW_UP_PENDING");
  return blockers;
}

// BR-21 — the transitions offered to the UI: the BR-18 matrix minus RESOLVED while the gate fails.
export function gatedTransitions(from: TicketStatus, blockers: ResolutionBlocker[]): TicketStatus[] {
  const all = allowedTransitions(from);
  return blockers.length === 0 ? all : all.filter((s) => s !== "RESOLVED");
}

// ---------------------------------------------------------------------------
// Response shape (api-spec.md §0 "Action Taken object") — explicit field list, names only.
// ---------------------------------------------------------------------------
const personSelect = { select: { id: true, name: true, role: true } } satisfies Prisma.UserDefaultArgs;
export const actionInclude = { performedBy: personSelect, createdBy: personSelect } satisfies Prisma.ActionTakenInclude;
type ActionRow = Prisma.ActionTakenGetPayload<{ include: typeof actionInclude }>;

export function serializeAction(a: ActionRow) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    actionAt: a.actionAt,
    description: a.description,
    result: a.result,
    status: a.status,
    performedBy: a.performedBy,
    createdBy: a.createdBy,
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    version: a.version,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    completedAt: a.completedAt,
    cancelledAt: a.cancelledAt,
  };
}

export const actionOrder = [{ actionAt: "asc" }, { id: "asc" }] satisfies Prisma.ActionTakenOrderByWithRelationInput[];
