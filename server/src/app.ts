import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPrisma } from "./prisma.js";
import { requireRequester } from "./middleware/requireRequester.js";
import { generateTicketNumber } from "./services/ticketNumber.js";

// docs/lab-02/specification.md BR-16 — fixed attachment rules.
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ATTACHMENTS_PER_TICKET = 5;
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// Files are held in memory only long enough to validate + write the good ones under a generated
// name (BR-17). Both limits here are deliberately looser than the real rules (5 MB / 5 files) —
// Multer aborts the request with its own error the instant a hard limit is hit, before our handler
// runs, which would bypass the documented 400 validation response (BR-15/BR-16). We enforce the
// real limits ourselves below so every rejection goes through the same response shape.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
});

// Converts a Multer error (e.g. pathologically many parts) into the same 400 shape as our own
// validation errors, instead of falling through to Express's default error handler.
function handleUploadError(err: unknown, _req: Request, res: Response, next: (err?: unknown) => void) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: "Invalid attachment upload", fields: { attachments: err.message } });
  }
  next(err);
}

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list
// ---------------------------------------------------------------------------
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: "Unable to load categories" });
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 2 — Development Requester context (docs/lab-02/api-spec.md §1)
// Testing mechanism only, not authentication — see specification.md BR-03/BR-09.
// ---------------------------------------------------------------------------
app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requesterUser.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true, email: true },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({ error: "Unable to load development requesters" });
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 3 — Related Systems (docs/lab-02/api-spec.md §3)
// ---------------------------------------------------------------------------
app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(relatedSystems);
  } catch {
    res.status(500).json({ error: "Unable to load related systems" });
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 3 — Create Ticket (docs/lab-02/api-spec.md §4)
// ---------------------------------------------------------------------------
app.post(
  "/api/tickets",
  requireRequester,
  upload.array("attachments"),
  handleUploadError,
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const fieldErrors: Record<string, string> = {};
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // BR-16 — enforced here (not just via Multer's own limit) so exceeding it returns the same
    // documented 400 validation shape as every other field error, rather than a Multer error.
    if (files.length > MAX_ATTACHMENTS_PER_TICKET) {
      fieldErrors.attachments = `You can attach at most ${MAX_ATTACHMENTS_PER_TICKET} files.`;
    }

    const summary = String(req.body.summary ?? "").trim();
    const description = String(req.body.description ?? "").trim();
    const requestedPriority = String(req.body.requestedPriority ?? "");
    const categoryId = Number(req.body.categoryId);
    const relatedSystemId = Number(req.body.relatedSystemId);

    // BR-06 / BR-07 — required, trimmed, length-bounded.
    if (summary.length < 5 || summary.length > 150) {
      fieldErrors.summary = "Summary is required and must be 5-150 characters.";
    }
    if (description.length < 10 || description.length > 2000) {
      fieldErrors.description = "Description is required and must be 10-2000 characters.";
    }
    // BR-08
    if (!["LOW", "MEDIUM", "HIGH"].includes(requestedPriority)) {
      fieldErrors.requestedPriority = "Requested priority must be LOW, MEDIUM, or HIGH.";
    }

    // BR-05 — Category / Related System must reference existing, usable records.
    const [category, relatedSystem] = await Promise.all([
      Number.isInteger(categoryId) ? prisma.category.findUnique({ where: { id: categoryId } }) : null,
      Number.isInteger(relatedSystemId)
        ? prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } })
        : null,
    ]);
    if (!category) fieldErrors.categoryId = "Select a valid category.";
    if (!relatedSystem || !relatedSystem.isActive) {
      fieldErrors.relatedSystemId = "Select a valid, active related system.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      // BR-14 — nothing is persisted on validation failure.
      return res.status(400).json({ error: "Invalid ticket data", fields: fieldErrors });
    }

    try {
      const ticketNumber = await generateTicketNumber(prisma);
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber,
          requesterId: req.requesterId!,
          categoryId,
          relatedSystemId,
          summary,
          description,
          requestedPriority: requestedPriority as "LOW" | "MEDIUM" | "HIGH",
        },
      });

      // BR-15 — one bad file must not lose the Ticket or the other valid files.
      const attachmentErrors: { filename: string; reason: string }[] = [];
      const savedAttachments = [];

      if (files.length > 0) await mkdir(UPLOAD_DIR, { recursive: true });

      for (const file of files) {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          attachmentErrors.push({ filename: file.originalname, reason: "Unsupported file type." });
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          attachmentErrors.push({ filename: file.originalname, reason: "Exceeds 5 MB limit." });
          continue;
        }
        // BR-17 — generated, non-guessable storage name; original name kept as metadata only.
        const storedFilename = `${randomUUID()}${path.extname(file.originalname)}`;
        try {
          await writeFile(path.join(UPLOAD_DIR, storedFilename), file.buffer);
          const attachment = await prisma.attachment.create({
            data: {
              ticketId: ticket.id,
              originalFilename: file.originalname,
              storedFilename,
              mimeType: file.mimetype,
              sizeBytes: file.size,
            },
          });
          savedAttachments.push(attachment);
        } catch {
          attachmentErrors.push({ filename: file.originalname, reason: "Upload failed, please retry." });
        }
      }

      res.status(201).json({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticketDate: ticket.createdAt,
        requesterId: ticket.requesterId,
        categoryId: ticket.categoryId,
        relatedSystemId: ticket.relatedSystemId,
        summary: ticket.summary,
        description: ticket.description,
        requestedPriority: ticket.requestedPriority,
        currentStatus: ticket.currentStatus,
        attachments: savedAttachments.map((a) => ({
          id: a.id,
          originalFilename: a.originalFilename,
          sizeBytes: a.sizeBytes,
        })),
        attachmentErrors,
      });
    } catch {
      res.status(500).json({ error: "Unable to create ticket" });
    }
  }
);

// ---------------------------------------------------------------------------
// Lab 2 Issue 4 — My Tickets (docs/lab-02/api-spec.md §5)
// ---------------------------------------------------------------------------
const SORTABLE_FIELDS = new Set(["createdAt", "requestedPriority", "currentStatus"]);
const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
const VALID_STATUSES = new Set(["NEW"]);
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// `parseInt` silently accepts partially-numeric strings ("2abc" -> 2), so a malformed query
// param would still drive pagination instead of falling back (BR-13). `Number()` rejects the
// whole string as NaN unless every character is part of a valid number.
function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

app.get("/api/tickets", requireRequester, async (req: Request, res: Response) => {
  const prisma = getPrisma();

  // BR-13 — invalid page/pageSize fall back to defaults rather than erroring.
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  const sortByParam = String(req.query.sortBy ?? "createdAt");
  const sortBy = SORTABLE_FIELDS.has(sortByParam) ? sortByParam : "createdAt";
  const sortDir = req.query.sortDir === "asc" ? "asc" : "desc";

  // BR-11 — requesterId scoping is enforced here, server-side, never left to the UI alone.
  const where: Record<string, unknown> = { requesterId: req.requesterId };

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    where.OR = [
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }

  const categoryId = Number(req.query.categoryId);
  if (Number.isInteger(categoryId)) where.categoryId = categoryId;

  const requestedPriority = String(req.query.requestedPriority ?? "");
  if (VALID_PRIORITIES.has(requestedPriority)) where.requestedPriority = requestedPriority;

  const currentStatus = String(req.query.currentStatus ?? "");
  if (VALID_STATUSES.has(currentStatus)) where.currentStatus = currentStatus;

  try {
    const [items, totalItems] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          categoryId: true,
          requestedPriority: true,
          currentStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.status(200).json({
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    });
  } catch {
    res.status(500).json({ error: "Unable to load tickets" });
  }
});

function serializeAttachment(a: {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: Date;
  removedAt: Date | null;
  removedReason: string | null;
}) {
  return {
    id: a.id,
    originalFilename: a.originalFilename,
    sizeBytes: a.sizeBytes,
    mimeType: a.mimeType,
    uploadedAt: a.uploadedAt,
    removedAt: a.removedAt,
    removedReason: a.removedReason,
  };
}

// ---------------------------------------------------------------------------
// Lab 2 Issue 5 — Requester Ticket Detail (docs/lab-02/api-spec.md §6)
// ---------------------------------------------------------------------------
app.get("/api/tickets/:ticketNumber", requireRequester, async (req: Request, res: Response) => {
  try {
    // BR-22/AC-03 — "doesn't exist" and "not yours" return the identical 404.
    const ticket = await getPrisma().ticket.findFirst({
      where: { ticketNumber: req.params.ticketNumber, requesterId: req.requesterId },
      include: { attachments: { orderBy: { uploadedAt: "asc" } } },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketDate: ticket.createdAt,
      requesterId: ticket.requesterId,
      categoryId: ticket.categoryId,
      relatedSystemId: ticket.relatedSystemId,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.requestedPriority,
      currentStatus: ticket.currentStatus,
      attachments: ticket.attachments.map(serializeAttachment),
    });
  } catch {
    res.status(500).json({ error: "Unable to load ticket" });
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 5 — Add an Attachment to an existing owned Ticket (api-spec.md §7)
// ---------------------------------------------------------------------------
app.post(
  "/api/tickets/:ticketNumber/attachments",
  requireRequester,
  upload.single("file"),
  handleUploadError,
  async (req: Request, res: Response) => {
    try {
      const ticket = await getPrisma().ticket.findFirst({
        where: { ticketNumber: req.params.ticketNumber, requesterId: req.requesterId },
      });
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ error: "Invalid attachment", fields: { file: "A file is required." } });
      }

      // BR-16 — enforced against the ticket's current active count, not a client-sent count.
      const activeCount = await getPrisma().attachment.count({
        where: { ticketId: ticket.id, removedAt: null },
      });
      if (activeCount >= MAX_ATTACHMENTS_PER_TICKET) {
        return res.status(400).json({
          error: "Invalid attachment",
          fields: { file: `This ticket already has ${MAX_ATTACHMENTS_PER_TICKET} active attachments.` },
        });
      }
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: "Invalid attachment", fields: { file: "Unsupported file type." } });
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({ error: "Invalid attachment", fields: { file: "Exceeds 5 MB limit." } });
      }

      await mkdir(UPLOAD_DIR, { recursive: true });
      const storedFilename = `${randomUUID()}${path.extname(file.originalname)}`;
      await writeFile(path.join(UPLOAD_DIR, storedFilename), file.buffer);
      const attachment = await getPrisma().attachment.create({
        data: {
          ticketId: ticket.id,
          originalFilename: file.originalname,
          storedFilename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
      res.status(201).json(serializeAttachment(attachment));
    } catch {
      res.status(500).json({ error: "Unable to add attachment" });
    }
  }
);

// ---------------------------------------------------------------------------
// Lab 2 Issue 5 — Attachment metadata, download, and soft removal (api-spec.md §8-10)
// ---------------------------------------------------------------------------
app.get("/api/attachments/:id", requireRequester, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Attachment not found" });

  try {
    const attachment = await getPrisma().attachment.findFirst({
      where: { id, ticket: { requesterId: req.requesterId } },
    });
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });
    res.status(200).json(serializeAttachment(attachment));
  } catch {
    res.status(500).json({ error: "Unable to load attachment" });
  }
});

app.get("/api/attachments/:id/download", requireRequester, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Attachment not found" });

  try {
    // removedAt: null — a removed attachment 404s exactly like a nonexistent one (BR-18/AC-16).
    const attachment = await getPrisma().attachment.findFirst({
      where: { id, removedAt: null, ticket: { requesterId: req.requesterId } },
    });
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.originalFilename)}"`
    );
    res.sendFile(path.join(UPLOAD_DIR, attachment.storedFilename), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "Attachment not found" });
    });
  } catch {
    if (!res.headersSent) res.status(500).json({ error: "Unable to download attachment" });
  }
});

app.delete("/api/attachments/:id", requireRequester, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason ?? "").trim();

  if (!Number.isInteger(id)) return res.status(404).json({ error: "Attachment not found" });
  // BR-20 — a non-empty, bounded removal reason is required.
  if (reason.length < 3 || reason.length > 200) {
    return res.status(400).json({
      error: "Invalid removal reason",
      fields: { reason: "Reason must be 3-200 characters." },
    });
  }

  try {
    const attachment = await getPrisma().attachment.findFirst({
      where: { id, ticket: { requesterId: req.requesterId } },
    });
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });
    if (attachment.removedAt) {
      return res.status(400).json({ error: "Attachment already removed" });
    }

    const updated = await getPrisma().attachment.update({
      where: { id },
      data: { removedAt: new Date(), removedReason: reason },
    });
    res.status(200).json(serializeAttachment(updated));
  } catch {
    res.status(500).json({ error: "Unable to remove attachment" });
  }
});

export default app;
