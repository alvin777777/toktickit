import type { Response } from "express";

// Lab 4 — thrown inside a transaction to roll it back and answer with a documented error body
// (docs/lab-04/api-spec.md §0). Anything else becomes the route's safe 500 message.
export class HttpError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(String(body.error));
  }
}

export function sendError(res: Response, err: unknown, fallback: string) {
  if (err instanceof HttpError) return res.status(err.status).json(err.body);
  return res.status(500).json({ error: fallback });
}
