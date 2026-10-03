import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { api, asAdmin, asRequester, asRequesterB, asStaff } from "../helpers/auth.js";

let requester: string;
let requesterB: string;
let staff: string;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  requester = await asRequester();
  requesterB = await asRequesterB();
  staff = await asStaff();
  const prisma = getPrisma();
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
});

async function newTicket(summary: string): Promise<string> {
  const res = await api()
    .post("/api/tickets")
    .set("Cookie", requester)
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", "LOW");
  return res.body.ticketNumber as string;
}

const comments = (tn: string, cookie: string) => api().get(`/api/tickets/${tn}/comments`).set("Cookie", cookie);
const postComment = (tn: string, cookie: string, body: unknown) =>
  api().post(`/api/tickets/${tn}/comments`).set("Cookie", cookie).send({ body });
const notes = (tn: string, cookie: string) => api().get(`/api/staff/tickets/${tn}/internal-notes`).set("Cookie", cookie);
const postNote = (tn: string, cookie: string, body: unknown) =>
  api().post(`/api/staff/tickets/${tn}/internal-notes`).set("Cookie", cookie).send({ body });

// API-20 (AC-11, BR-35, BR-39)
describe("Public Comments", () => {
  it("are shared between the requester and IT Staff, oldest first, with author name and role", async () => {
    const tn = await newTicket("Comment thread");
    const first = await postComment(tn, requester, "Any update on this?");
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: "Any update on this?", author: { name: "Jennifer Anderson", role: "REQUESTER" } });
    expect(first.body.createdAt).toEqual(expect.any(String));

    const reply = await postComment(tn, staff, "We are on it.");
    expect(reply.status).toBe(201);
    expect(reply.body.author.role).toBe("IT_STAFF");

    const seenByStaff = await comments(tn, staff);
    expect(seenByStaff.body.map((c: { body: string }) => c.body)).toEqual(["Any update on this?", "We are on it."]);
    const seenByRequester = await comments(tn, requester);
    expect(seenByRequester.body).toEqual(seenByStaff.body);
    const seenByAdmin = await comments(tn, await asAdmin());
    expect(seenByAdmin.status).toBe(200);
  });

  // API-21 (AC-21, BR-37)
  it.each([["", "empty"], ["   ", "whitespace"], ["x".repeat(2001), "too long"]])(
    "rejects invalid content (%s %s) with 400 and stores nothing",
    async (body) => {
      const tn = await newTicket("Invalid comment content");
      const res = await postComment(tn, requester, body);
      expect(res.status).toBe(400);
      expect(res.body.fields).toHaveProperty("body");
      expect((await comments(tn, requester)).body).toEqual([]);
      const note = await postNote(tn, staff, body);
      expect(note.status).toBe(400);
    }
  );

  // API-22 (BR-38)
  it("are closed on a CLOSED ticket while Internal Notes stay open", async () => {
    const tn = await newTicket("Closed thread");
    await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff);
    for (const status of ["IN_PROGRESS", "RESOLVED", "CLOSED"]) {
      await api().patch(`/api/staff/tickets/${tn}/status`).set("Cookie", staff).send({ status });
    }
    const closed = await postComment(tn, requester, "Still broken?");
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe("TICKET_NOT_COMMENTABLE");
    const note = await postNote(tn, staff, "Closed after confirmation call.");
    expect(note.status).toBe(201);
  });

  // API-24 (BR-17)
  it("404 for another requester's ticket, on read and on post", async () => {
    const tn = await newTicket("Owned by A");
    expect((await comments(tn, requesterB)).status).toBe(404);
    expect((await postComment(tn, requesterB, "sneaky")).status).toBe(404);
  });
});

// API-23 (AC-20, BR-35) + SEC-02 (AC-04, BR-18)
describe("Internal Notes", () => {
  it("are listed for staff and never reach the requester through any endpoint", async () => {
    const tn = await newTicket("Private notes");
    const secret = `SECRET-NOTE-${Date.now()}`;
    const created = await postNote(tn, staff, secret);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ body: secret, author: { name: "Emily Davis", role: "IT_STAFF" } });

    const forStaff = await notes(tn, staff);
    expect(forStaff.body.map((n: { body: string }) => n.body)).toContain(secret);
    expect((await notes(tn, await asAdmin())).status).toBe(200);

    // Requester-facing responses: detail, comments, my tickets — none may carry the note text.
    const detail = await api().get(`/api/tickets/${tn}`).set("Cookie", requester);
    const list = await api().get(`/api/tickets?search=Private%20notes`).set("Cookie", requester);
    const thread = await comments(tn, requester);
    for (const res of [detail, list, thread]) expect(JSON.stringify(res.body)).not.toContain(secret);

    // Direct calls by the requester are refused before any lookup, with no content.
    const read = await notes(tn, requester);
    expect(read.status).toBe(403);
    expect(JSON.stringify(read.body)).not.toContain(secret);
    expect(read.body.code).toBe("FORBIDDEN");
    const write = await postNote(tn, requester, "trying to write");
    expect(write.status).toBe(403);
    // Even for a ticket that does not exist, a requester sees 403 not 404 (no existence leak).
    expect((await notes("TKT-1999-000000", requester)).status).toBe(403);
  });
});

// API-25 (AC-12, BR-32)
describe("POST /api/tickets/:ticketNumber/requester-resolved", () => {
  it("records the indication once, never changes status, and is visible to staff", async () => {
    const tn = await newTicket("Appears resolved");
    const res = await api().post(`/api/tickets/${tn}/requester-resolved`).set("Cookie", requester);
    expect(res.status).toBe(200);
    expect(res.body.requesterResolvedAt).toEqual(expect.any(String));
    expect(res.body.currentStatus).toBe("NEW");

    const again = await api().post(`/api/tickets/${tn}/requester-resolved`).set("Cookie", requester);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_INDICATED");

    const staffView = await api().get(`/api/staff/tickets/${tn}`).set("Cookie", staff);
    expect(staffView.body.requesterResolvedAt).toEqual(res.body.requesterResolvedAt);
    const queue = await api().get(`/api/staff/tickets?search=${tn}`).set("Cookie", staff);
    expect(queue.body.items[0].requesterResolvedAt).toEqual(res.body.requesterResolvedAt);

    expect((await api().post(`/api/tickets/${tn}/requester-resolved`).set("Cookie", requesterB)).status).toBe(404);
    expect((await api().post(`/api/tickets/${tn}/requester-resolved`).set("Cookie", staff)).status).toBe(403);
  });

  it("is refused on a resolved / closed / cancelled ticket", async () => {
    const tn = await newTicket("Already cancelled");
    await api().patch(`/api/staff/tickets/${tn}/status`).set("Cookie", staff).send({ status: "CANCELLED" });
    const res = await api().post(`/api/tickets/${tn}/requester-resolved`).set("Cookie", requester);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_TERMINAL");
  });
});
