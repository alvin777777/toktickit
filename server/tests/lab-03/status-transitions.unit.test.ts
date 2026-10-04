import { describe, it, expect } from "vitest";
import { TICKET_STATUSES, allowedTransitions, canTransition, isCommentable, isTerminal } from "../../src/services/ticketWorkflow.js";

// UNIT-03 (BR-30) — every (from, to) pair against the specification table.
const EXPECTED: Record<string, string[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  CLOSED: ["REOPENED"],
  CANCELLED: [],
};

describe("status transition matrix", () => {
  it("covers all eight statuses", () => {
    expect(TICKET_STATUSES).toHaveLength(8);
    expect(Object.keys(EXPECTED).sort()).toEqual([...TICKET_STATUSES].sort());
  });

  it.each(TICKET_STATUSES)("%s permits exactly the specified targets", (from) => {
    expect(allowedTransitions(from)).toEqual(EXPECTED[from]);
    for (const to of TICKET_STATUSES) {
      expect(canTransition(from, to)).toBe(EXPECTED[from].includes(to));
    }
  });

  it("never allows a self-transition", () => {
    for (const s of TICKET_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("treats CLOSED and CANCELLED as terminal, and only those as non-commentable (BR-28/BR-38)", () => {
    for (const s of TICKET_STATUSES) {
      expect(isTerminal(s)).toBe(s === "CLOSED" || s === "CANCELLED");
      expect(isCommentable(s)).toBe(!(s === "CLOSED" || s === "CANCELLED"));
    }
  });
});
