import { describe, it, expect } from "vitest";
import type { ActionStatus, TicketStatus } from "@prisma/client";
import {
  ACTION_CREATE_STATUSES,
  ACTION_STATUSES,
  ActionFields,
  GateAction,
  canActionTransition,
  gatedTransitions,
  resolutionBlockers,
  validateAction,
} from "../../src/services/actions.js";
import { TICKET_STATUSES, allowedTransitions } from "../../src/services/ticketWorkflow.js";

// UNIT-01 (BR-08)
describe("action transition matrix", () => {
  const expected: Record<ActionStatus, ActionStatus[]> = {
    PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };
  it("permits exactly the BR-08 pairs", () => {
    for (const from of ACTION_STATUSES) {
      for (const to of ACTION_STATUSES) {
        expect(canActionTransition(from, to), `${from} -> ${to}`).toBe(expected[from].includes(to));
      }
    }
  });
  it("allows creation as Planned, In Progress, or Completed only", () => {
    expect(ACTION_CREATE_STATUSES).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED"]);
  });
});

// UNIT-02 (BR-04..BR-07)
describe("validateAction", () => {
  const now = new Date("2026-10-31T10:00:00Z");
  const ticketCreatedAt = new Date("2026-10-30T10:00:00Z");
  const base = { actionAt: "2026-10-31T09:00:00Z", description: "Checked it", result: "Works" };
  const run = (body: Record<string, unknown>, status: ActionStatus = "COMPLETED", existing?: ActionFields) =>
    validateAction(body, { status, existing, actorId: 7, ticketCreatedAt, now });

  it("accepts and normalises a valid create (trim, performer defaults to the actor, note cleared)", () => {
    const r = run({ ...base, description: "  Checked it  ", followUpNote: "ignored", attachmentNotes: "   " });
    expect(r.errors).toEqual({});
    expect(r.fields).toMatchObject({ description: "Checked it", performedById: 7, followUpRequired: false, followUpNote: null, attachmentNotes: null });
  });

  it("enforces description 5-1000", () => {
    expect(run({ ...base, description: "abcd" }).errors.description).toBeDefined();
    expect(run({ ...base, description: "abcde" }).errors.description).toBeUndefined();
    expect(run({ ...base, description: "x".repeat(1000) }).errors.description).toBeUndefined();
    expect(run({ ...base, description: "x".repeat(1001) }).errors.description).toBeDefined();
  });

  it("requires a result only to complete, and caps it at 2000", () => {
    expect(run({ ...base, result: "" }).errors.result).toBe("Result is required to complete an action.");
    expect(run({ ...base, result: "" }, "PLANNED").errors.result).toBeUndefined();
    expect(run({ ...base, result: "x".repeat(2001) }, "IN_PROGRESS").errors.result).toBeDefined();
  });

  it("requires a follow-up note only when follow-up is needed", () => {
    expect(run({ ...base, followUpRequired: true }).errors.followUpNote).toBe("Follow-up note is required when follow-up is needed.");
    expect(run({ ...base, followUpRequired: true, followUpNote: "Call back Monday" }).fields?.followUpNote).toBe("Call back Monday");
    expect(run({ ...base, followUpRequired: "yes" }).errors.followUpRequired).toBeDefined();
  });

  it("caps attachment notes at 500", () => {
    expect(run({ ...base, attachmentNotes: "x".repeat(500) }).errors.attachmentNotes).toBeUndefined();
    expect(run({ ...base, attachmentNotes: "x".repeat(501) }).errors.attachmentNotes).toBeDefined();
  });

  it("bounds actionAt by the ticket's creation (same minute allowed) and by status-dependent future limits", () => {
    expect(run({ ...base, actionAt: "not a date" }).errors.actionAt).toBe("Enter a valid date and time.");
    expect(run({ ...base, actionAt: undefined }).errors.actionAt).toBeDefined();
    expect(run({ ...base, actionAt: "2026-10-30T09:58:00Z" }).errors.actionAt).toBe("Action date cannot be before the ticket was created.");
    expect(run({ ...base, actionAt: "2026-10-30T09:59:30Z" }).errors.actionAt).toBeUndefined();
    expect(run({ ...base, actionAt: "2026-10-31T10:04:00Z" }).errors.actionAt).toBeUndefined(); // 5-minute skew
    expect(run({ ...base, actionAt: "2026-10-31T10:06:00Z" }).errors.actionAt).toBe("Action date cannot be in the future.");
    expect(run({ ...base, actionAt: "2026-11-15T10:00:00Z" }, "PLANNED").errors.actionAt).toBeUndefined();
    expect(run({ ...base, actionAt: "2027-03-01T10:00:00Z" }, "PLANNED").errors.actionAt).toBeDefined();
  });

  it("validates an edit against the merged stored values", () => {
    const existing: ActionFields = {
      actionAt: new Date("2026-10-31T09:00:00Z"), description: "Stored description", result: null, status: "PLANNED",
      performedById: 9, followUpRequired: false, followUpNote: null, attachmentNotes: null,
    };
    expect(run({}, "COMPLETED", existing).errors.result).toBeDefined(); // completing with no stored result
    const ok = run({ result: "Done" }, "COMPLETED", existing);
    expect(ok.fields).toMatchObject({ description: "Stored description", result: "Done", performedById: 9 });
    expect(run({ performedById: "abc" }, "PLANNED", existing).errors.performedById).toBeDefined();
  });
});

// UNIT-03 (BR-20)
describe("resolutionBlockers", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 31, h));
  const act = (id: number, status: ActionStatus, h: number, followUpRequired = false): GateAction => ({ id, status, actionAt: at(h), followUpRequired });

  it("reports every unmet requirement", () => {
    expect(resolutionBlockers({ ownerId: null }, [])).toEqual(["OWNER_REQUIRED", "NO_COMPLETED_ACTION"]);
    expect(resolutionBlockers({ ownerId: 1 }, [act(1, "CANCELLED", 1)])).toEqual(["NO_COMPLETED_ACTION"]);
    expect(resolutionBlockers({ ownerId: 1 }, [act(1, "COMPLETED", 1), act(2, "PLANNED", 2)])).toEqual(["OPEN_ACTIONS"]);
    expect(resolutionBlockers({ ownerId: 1 }, [act(1, "COMPLETED", 1), act(2, "COMPLETED", 2, true)])).toEqual(["FOLLOW_UP_PENDING"]);
  });

  it("ignores a follow-up that a later completed action superseded, and breaks actionAt ties by id", () => {
    expect(resolutionBlockers({ ownerId: 1 }, [act(1, "COMPLETED", 1, true), act(2, "COMPLETED", 2)])).toEqual([]);
    expect(resolutionBlockers({ ownerId: 1 }, [act(5, "COMPLETED", 3), act(4, "COMPLETED", 3, true)])).toEqual([]);
    expect(resolutionBlockers({ ownerId: 1 }, [act(4, "COMPLETED", 3), act(5, "COMPLETED", 3, true)])).toEqual(["FOLLOW_UP_PENDING"]);
  });
});

// UNIT-04 (BR-18, BR-21)
describe("gatedTransitions", () => {
  it("is the Lab 3 matrix when the gate holds and drops only RESOLVED when it does not", () => {
    for (const s of TICKET_STATUSES as TicketStatus[]) {
      expect(gatedTransitions(s, [])).toEqual(allowedTransitions(s));
      expect(gatedTransitions(s, ["OPEN_ACTIONS"])).toEqual(allowedTransitions(s).filter((t) => t !== "RESOLVED"));
    }
    expect(allowedTransitions("IN_PROGRESS")).toEqual(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
  });
});
