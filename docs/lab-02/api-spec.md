# Lab 2 API Contract

All Requester-scoped endpoints require an `X-Requester-Id` header carrying the currently selected
Development Requester's id (see specification.md §11 — this stands in for a session until Lab 3).
Missing or unknown/inactive `X-Requester-Id` → `401` with a safe message (treated like "not logged
in" would be in a real auth system).

## 1. GET /api/requesters

Active Development Requesters, for the selection screen. No `X-Requester-Id` required.

**200 OK**
```json
[{ "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@toktickit.dev" }]
```

## 2. GET /api/categories

Reused from Lab 1, unchanged. **200 OK** → `[{ "id": 1, "name": "Hardware" }, ...]`

## 3. GET /api/related-systems

Active Related Systems. **200 OK** → `[{ "id": 1, "name": "Corporate Laptop" }, ...]`

## 4. POST /api/tickets

Create a Ticket for the Requester in `X-Requester-Id`. `multipart/form-data` (fields + up to 5 files
under `attachments`).

**Request fields:** `categoryId` (int), `relatedSystemId` (int), `summary` (string), `description`
(string), `requestedPriority` (`LOW`|`MEDIUM`|`HIGH`), `attachments` (0–5 files).

**201 Created**
```json
{
  "id": 42, "ticketNumber": "TKT-2026-000042", "ticketDate": "2026-09-06T10:00:00.000Z",
  "requesterId": 1, "categoryId": 2, "relatedSystemId": 5,
  "summary": "Laptop battery drains quickly", "description": "...",
  "requestedPriority": "MEDIUM", "currentStatus": "NEW",
  "attachments": [{ "id": 7, "originalFilename": "battery.png", "sizeBytes": 20480 }],
  "attachmentErrors": []
}
```
`attachmentErrors` is a non-empty array (per BR-15) when the Ticket saved but one or more files
failed, e.g. `[{ "filename": "huge.pdf", "reason": "exceeds 5 MB limit" }]` — still a 201.

**400 Bad Request** — validation failure (missing/too-short Summary or Description, invalid
priority, unknown/inactive categoryId/relatedSystemId). Body: `{ "error": "...", "fields": { "summary": "Summary is required" } }`.

**401 Unauthorized** — missing/unknown/inactive `X-Requester-Id`.

**500 Internal Server Error** — unexpected failure; body: `{ "error": "Unable to create ticket" }`
(no internal details).

## 5. GET /api/tickets

Paginated list of the current Requester's own Tickets.

**Query params:** `search` (matches ticketNumber or summary, case-insensitive substring),
`categoryId`, `requestedPriority`, `currentStatus`, `sortBy` (`createdAt`|`requestedPriority`|`currentStatus`,
default `createdAt`), `sortDir` (`asc`|`desc`, default `desc`), `page` (default 1), `pageSize`
(default 10, max 50). Invalid values fall back to defaults rather than erroring (BR-13).

**200 OK**
```json
{
  "items": [{ "id": 42, "ticketNumber": "TKT-2026-000042", "summary": "...", "categoryId": 2,
              "requestedPriority": "MEDIUM", "currentStatus": "NEW", "createdAt": "..." }],
  "page": 1, "pageSize": 10, "totalItems": 42, "totalPages": 5
}
```

**401 Unauthorized** — as above.

## 6. GET /api/tickets/:ticketNumber

One Ticket owned by the current Requester, with its attachments (active and removed).

**200 OK** — Ticket fields (as in POST response) plus full `attachments[]` including removed ones
(`removedAt`, `removedReason` populated for those).

**404 Not Found** — Ticket doesn't exist, OR exists but isn't owned by the current Requester
(BR-22/AC-03 — identical response either way): `{ "error": "Ticket not found" }`.

**401 Unauthorized** — as above.

## 7. POST /api/tickets/:ticketNumber/attachments

Add one Attachment to an owned Ticket. `multipart/form-data`, field `file`.

**201 Created** → the new attachment object (same shape as in POST /api/tickets response).

**400 Bad Request** — unsupported type / over 5 MB / would exceed 5 active attachments.

**404 Not Found** — Ticket not owned/doesn't exist (same rule as §6).

**401 Unauthorized** — as above.

## 8. GET /api/attachments/:id

Attachment metadata only (used to render the list without re-fetching the whole ticket).

**200 OK** → `{ "id": 7, "ticketId": 42, "originalFilename": "battery.png", "sizeBytes": 20480, "mimeType": "image/png", "uploadedAt": "...", "removedAt": null, "removedReason": null }`

**404 Not Found** — doesn't exist or its Ticket isn't owned by the current Requester.

## 9. GET /api/attachments/:id/download

Streams the file — only if active (not removed) and owned by the current Requester.

**200 OK** — file stream with correct `Content-Type` and `Content-Disposition: attachment`.

**404 Not Found** — doesn't exist, not owned, **or removed** (BR-18/AC-16 — a removed attachment
downloads exactly like a nonexistent one).

## 10. DELETE /api/attachments/:id

Soft-remove an owned, currently-active Attachment.

**Request body:** `{ "reason": "Wrong file, re-uploading correct one" }` (3–200 chars, required —
BR-20).

**200 OK** → the updated attachment object with `removedAt`/`removedReason` populated.

**400 Bad Request** — missing/too-short/too-long reason, or attachment already removed.

**404 Not Found** — doesn't exist or not owned.

## Status Code Summary

| Status | Meaning in this API |
|---|---|
| 200 | Successful retrieval or update |
| 201 | Ticket or Attachment created |
| 400 | Validation failure (bad field, unsupported file, limit exceeded) |
| 401 | Missing/unknown/inactive `X-Requester-Id` |
| 404 | Resource doesn't exist or isn't owned by the current Requester (never distinguished) |
| 500 | Unexpected server error, safe message only |
