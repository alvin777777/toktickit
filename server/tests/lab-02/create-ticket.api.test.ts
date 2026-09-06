import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

let requesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const requester = await prisma.requesterUser.findFirstOrThrow({ where: { isActive: true } });
  const category = await prisma.category.findFirstOrThrow();
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

describe("POST /api/tickets", () => {
  it("creates a ticket with valid data (AC-01)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(requesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Laptop battery drains quickly")
      .field("description", "The battery drains much faster than usual, even when idle.")
      .field("requestedPriority", "MEDIUM");

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.attachmentErrors).toEqual([]);
  });

  it("rejects missing summary (AC-04)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(requesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("description", "Valid description that is long enough to pass.")
      .field("requestedPriority", "LOW");

    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty("summary");
  });

  it("rejects missing description (AC-05)", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(requesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Valid summary here")
      .field("requestedPriority", "LOW");

    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty("description");
  });

  it("saves the ticket and reports a failed attachment while keeping the valid one (AC-21, BR-15)", async () => {
    const validImage = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // tiny fake PNG bytes
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1); // 6MB > 5MB limit

    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(requesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Mixed attachment test ticket")
      .field("description", "One attachment is valid, one is too large.")
      .field("requestedPriority", "HIGH")
      .attach("attachments", validImage, { filename: "ok.png", contentType: "image/png" })
      .attach("attachments", oversized, { filename: "too-big.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0].originalFilename).toBe("ok.png");
    expect(res.body.attachmentErrors).toHaveLength(1);
    expect(res.body.attachmentErrors[0].filename).toBe("too-big.png");
  });

  // Requested by review on PR #25 — Multer used to abort before this validation could run.
  it("rejects more than 5 attachments with a 400 field error, not a Multer crash (BR-16)", async () => {
    const tinyFile = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    let req = request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(requesterId))
      .field("categoryId", String(categoryId))
      .field("relatedSystemId", String(relatedSystemId))
      .field("summary", "Too many attachments")
      .field("description", "Sending six files should be a clean validation error.")
      .field("requestedPriority", "LOW");

    for (let i = 0; i < 6; i++) {
      req = req.attach("attachments", tinyFile, { filename: `file-${i}.png`, contentType: "image/png" });
    }
    const res = await req;

    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty("attachments");
  });
});
