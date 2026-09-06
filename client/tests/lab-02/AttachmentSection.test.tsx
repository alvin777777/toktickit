import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttachmentSection from "../../src/components/AttachmentSection.js";
import * as api from "../../src/api.js";

function attachment(overrides: Partial<api.AttachmentInfo> = {}): api.AttachmentInfo {
  return {
    id: 1,
    ticketId: 1,
    originalFilename: "photo.png",
    sizeBytes: 20480,
    mimeType: "image/png",
    uploadedAt: "2026-09-06T10:00:00.000Z",
    removedAt: null,
    removedReason: null,
    ...overrides,
  };
}

describe("AttachmentSection", () => {
  // UI-15 (AC-14) — adding a valid attachment appears without a full page reload.
  it("adds a new attachment to the list without a full reload", async () => {
    const added = attachment({ id: 2, originalFilename: "new-photo.png" });
    vi.spyOn(api, "addAttachment").mockResolvedValue(added);
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AttachmentSection requesterId={1} ticketNumber="TKT-2026-000001" attachments={[]} onChange={onChange} />
    );

    const file = new File([new Uint8Array(10)], "new-photo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/add attachment/i), file);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([added]);
    });
  });

  // UI-16 (AC-15, AC-16) — removed attachment shows metadata + reason, no download/remove actions.
  it("shows an attachment as removed with its reason after confirming removal", async () => {
    const active = attachment();
    const removed = attachment({ removedAt: "2026-09-06T11:00:00.000Z", removedReason: "Wrong file uploaded" });
    vi.spyOn(api, "removeAttachment").mockResolvedValue(removed);
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AttachmentSection
        requesterId={1}
        ticketNumber="TKT-2026-000001"
        attachments={[active]}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await user.type(screen.getByLabelText(/reason for removal/i), "Wrong file uploaded");
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([removed]);
    });
  });

  it("renders a removed attachment as metadata-only, without Download or Remove actions", () => {
    const removed = attachment({ removedAt: "2026-09-06T11:00:00.000Z", removedReason: "Duplicate upload" });
    render(
      <AttachmentSection requesterId={1} ticketNumber="TKT-2026-000001" attachments={[removed]} onChange={vi.fn()} />
    );

    expect(screen.getByText(/duplicate upload/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove$/i })).not.toBeInTheDocument();
  });

  // Requested by review on PR #27 — uploaded date must be visible for both active and
  // removed attachments per ui-spec.md §5.5, not just filename/size.
  it("shows the uploaded date for both active and removed attachments", () => {
    const active = attachment({ id: 1, uploadedAt: "2026-09-01T00:00:00.000Z" });
    const removed = attachment({
      id: 2,
      uploadedAt: "2026-09-02T00:00:00.000Z",
      removedAt: "2026-09-03T00:00:00.000Z",
      removedReason: "No longer needed",
    });
    render(
      <AttachmentSection
        requesterId={1}
        ticketNumber="TKT-2026-000001"
        attachments={[active, removed]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(new RegExp(`Uploaded ${new Date("2026-09-01").toLocaleDateString()}`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Uploaded ${new Date("2026-09-02").toLocaleDateString()}`))).toBeInTheDocument();
  });

  it("requires a reason before confirming removal", async () => {
    const user = userEvent.setup();
    render(
      <AttachmentSection
        requesterId={1}
        ticketNumber="TKT-2026-000001"
        attachments={[attachment()]}
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await user.click(screen.getByRole("button", { name: /confirm removal/i }));

    expect(await screen.findByText(/provide a reason/i)).toBeInTheDocument();
  });
});
