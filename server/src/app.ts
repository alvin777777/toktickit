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
// name (BR-17); the multer-level size cap here is just a generous safety net — the real 5 MB rule
// is enforced per-file below so one oversized file doesn't abort the whole request (BR-15).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
  upload.array("attachments", MAX_ATTACHMENTS_PER_TICKET),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const fieldErrors: Record<string, string> = {};

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
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
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

export default app;
