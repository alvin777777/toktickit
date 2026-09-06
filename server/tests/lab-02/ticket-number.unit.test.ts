import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { generateTicketNumber } from "../../src/services/ticketNumber.js";

// UNIT-01 — BR-01: TKT-{year}-{6-digit sequence}, unique/sequential per generation.
describe("generateTicketNumber", () => {
  it("returns a correctly formatted, unique, sequential ticket number", async () => {
    const prisma = getPrisma();
    const year = new Date().getFullYear();
    const pattern = new RegExp(`^TKT-${year}-\\d{6}$`);

    const first = await generateTicketNumber(prisma);
    const second = await generateTicketNumber(prisma);

    expect(first).toMatch(pattern);
    expect(second).toMatch(pattern);
    expect(first).not.toBe(second);

    const firstSeq = Number(first.split("-")[2]);
    const secondSeq = Number(second.split("-")[2]);
    expect(secondSeq).toBe(firstSeq + 1);
  });
});
