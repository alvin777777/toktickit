import { PrismaClient } from "@prisma/client";

// BR-01 — TKT-{year}-{6-digit sequence}, sequence resets per calendar year. The upsert+increment
// below is a single atomic UPDATE (or INSERT) per Postgres, so concurrent creates never collide.
export async function generateTicketNumber(prisma: PrismaClient): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await prisma.ticketSequence.upsert({
    where: { year },
    update: { lastValue: { increment: 1 } },
    create: { year, lastValue: 1 },
  });
  const padded = String(sequence.lastValue).padStart(6, "0");
  return `TKT-${year}-${padded}`;
}
