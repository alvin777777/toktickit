import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

let requesterA: number;
let requesterB: number;
let categoryId: number;
let relatedSystemId: number;

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function createTicket(requesterId: number, summary: string) {
  const res = await request(app)
    .post("/api/tickets")
    .set("X-Requester-Id", String(requesterId))
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", "MEDIUM");
  return res.body;
}

beforeAll(async () => {
  const prisma = getPrisma();
  const [reqA, reqB] = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    take: 2,
  });
  requesterA = reqA.id;
  requesterB = reqB.id;
  const category = await prisma.category.findFirstOrThrow();
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

describe("POST /api/tickets/:ticketNumber/attachments", () => {
  it("adds an attachment to an owned ticket (AC-14)", async () => {
    const ticket = await createTicket(requesterA, "Add attachment happy path");

    const res = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterA))
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.originalFilename).toBe("photo.png");
    expect(res.body.removedAt).toBeNull();
  });

  // Requested by review on PR #27 — api-spec.md §8 requires ticketId in metadata responses.
  it("includes ticketId in the attachment metadata response (api-spec.md §8)", async () => {
    const ticket = await createTicket(requesterA, "Attachment metadata shape test");
    const added = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterA))
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    const metadata = await request(app)
      .get(`/api/attachments/${added.body.id}`)
      .set("X-Requester-Id", String(requesterA));

    expect(metadata.status).toBe(200);
    expect(metadata.body.ticketId).toBe(ticket.id);
  });

  it("rejects adding a 6th active attachment (AC-06, BR-16)", async () => {
    const ticket = await createTicket(requesterA, "Five attachments already");
    for (let i = 0; i < 5; i++) {
      const add = await request(app)
        .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
        .set("X-Requester-Id", String(requesterA))
        .attach("file", TINY_PNG, { filename: `file-${i}.png`, contentType: "image/png" });
      expect(add.status).toBe(201);
    }

    const sixth = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterA))
      .attach("file", TINY_PNG, { filename: "file-5.png", contentType: "image/png" });

    expect(sixth.status).toBe(400);
    expect(sixth.body.fields).toHaveProperty("file");
  });

  it("rejects an oversized attachment (AC-07, BR-16)", async () => {
    const ticket = await createTicket(requesterA, "Oversized attachment test");
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1);

    const res = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterA))
      .attach("file", oversized, { filename: "too-big.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty("file");
  });

  it("returns 404 when adding to a ticket that isn't owned (BR-22)", async () => {
    const ticket = await createTicket(requesterA, "Owned by A, not B");

    const res = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterB))
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(404);
  });
});

describe("Attachment metadata, download, and removal", () => {
  it("soft-removes an attachment and blocks its download afterward (AC-15, AC-16, BR-18)", async () => {
    const ticket = await createTicket(requesterA, "Soft removal test");
    const added = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterA))
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    const downloadBefore = await request(app)
      .get(`/api/attachments/${added.body.id}/download`)
      .set("X-Requester-Id", String(requesterA));
    expect(downloadBefore.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/attachments/${added.body.id}`)
      .set("X-Requester-Id", String(requesterA))
      .send({ reason: "Uploaded the wrong file by mistake" });
    expect(removed.status).toBe(200);
    expect(removed.body.removedReason).toBe("Uploaded the wrong file by mistake");

    const downloadAfter = await request(app)
      .get(`/api/attachments/${added.body.id}/download`)
      .set("X-Requester-Id", String(requesterA));
    expect(downloadAfter.status).toBe(404); // removed attachment 404s exactly like a nonexistent one

    // still visible as metadata (BR-18)
    const metadata = await request(app)
      .get(`/api/attachments/${added.body.id}`)
      .set("X-Requester-Id", String(requesterA));
    expect(metadata.status).toBe(200);
    expect(metadata.body.removedAt).not.toBeNull();
  });

  it("requires a removal reason of 3-200 characters (BR-20)", async () => {
    const ticket = await createTicket(requesterA, "Removal reason validation");
    const added = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterA))
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    const res = await request(app)
      .delete(`/api/attachments/${added.body.id}`)
      .set("X-Requester-Id", String(requesterA))
      .send({ reason: "no" });

    expect(res.status).toBe(400);
  });

  it("rejects metadata/download/removal of an attachment owned by a different requester", async () => {
    const ticket = await createTicket(requesterA, "Attachment ownership test");
    const added = await request(app)
      .post(`/api/tickets/${ticket.ticketNumber}/attachments`)
      .set("X-Requester-Id", String(requesterA))
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    const metadata = await request(app)
      .get(`/api/attachments/${added.body.id}`)
      .set("X-Requester-Id", String(requesterB));
    expect(metadata.status).toBe(404);

    const download = await request(app)
      .get(`/api/attachments/${added.body.id}/download`)
      .set("X-Requester-Id", String(requesterB));
    expect(download.status).toBe(404);

    const removal = await request(app)
      .delete(`/api/attachments/${added.body.id}`)
      .set("X-Requester-Id", String(requesterB))
      .send({ reason: "Trying to remove someone else's file" });
    expect(removal.status).toBe(404);
  });
});
