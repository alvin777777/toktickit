import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/services/password.js";
import { generateTicketNumber } from "../src/services/ticketNumber.js";

// Issue 3 (Lab 1) — seed the four supported categories.
// Uses upsert so running the seed more than once never creates duplicates.
const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

// Lab 2 Issue 3 — seed Related Systems (docs/lab-02/specification.md §5.3), at least 6.
const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

// Lab 3 Issue 2 — real users with one role each (docs/lab-03/specification.md §7, §5.3 of the
// handout): ≥4 active + 1 inactive Requesters, ≥3 active + 1 inactive IT Staff, ≥1 Administrator,
// plus one Requester still on an initial password to exercise the first-login flow.
//
// LOCAL DEVELOPMENT CREDENTIALS ONLY (documented in README.md). Every account below uses
// SEED_PASSWORD except FIRST_LOGIN_USER, which uses INITIAL_PASSWORD and must change it at login.
export const SEED_PASSWORD = "Password123!";
export const INITIAL_PASSWORD = "Welcome123!";
export const FIRST_LOGIN_EMAIL = "alex.thompson@toktickit.dev";

type Role = "REQUESTER" | "IT_STAFF" | "ADMIN";
const USERS: { name: string; email: string; role: Role; isActive: boolean; mustChangePassword?: boolean }[] = [
  // Requesters (the Lab 2 Development Requesters, now real accounts)
  { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.dev", role: "REQUESTER", isActive: true },
  { name: "Michael Brown", email: "michael.brown@toktickit.dev", role: "REQUESTER", isActive: true },
  { name: "Sarah Johnson", email: "sarah.johnson@toktickit.dev", role: "REQUESTER", isActive: true },
  { name: "David Lee", email: "david.lee@toktickit.dev", role: "REQUESTER", isActive: true },
  { name: "Former Employee", email: "former.employee@toktickit.dev", role: "REQUESTER", isActive: false },
  { name: "Alex Thompson", email: FIRST_LOGIN_EMAIL, role: "REQUESTER", isActive: true, mustChangePassword: true },
  // IT Staff
  { name: "Emily Davis", email: "emily.davis@toktickit.dev", role: "IT_STAFF", isActive: true },
  { name: "Kevin Patel", email: "kevin.patel@toktickit.dev", role: "IT_STAFF", isActive: true },
  { name: "Lisa Martinez", email: "lisa.martinez@toktickit.dev", role: "IT_STAFF", isActive: true },
  { name: "Robert Wilson", email: "robert.wilson@toktickit.dev", role: "IT_STAFF", isActive: false },
  // Administrator
  { name: "John Smith", email: "john.smith@toktickit.dev", role: "ADMIN", isActive: true },
];

// Lab 3 Issue 3 — realistic Tickets across requesters, every status, both priorities, and
// assigned/unassigned ownership (docs/lab-03/specification.md §7). Identified by (requester,
// summary) so re-running the seed never duplicates them; Ticket Numbers come from the real
// generator so they look like production data.
type Status =
  | "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
type Pri = "LOW" | "MEDIUM" | "HIGH";
interface SeedTicket {
  requester: string; category: string; system: string; summary: string; description: string;
  requestedPriority: Pri; itPriority: Pri; status: Status; owner: string | null; daysAgo: number;
  requesterResolved?: boolean;
}
const T = {
  jen: "jennifer.anderson@toktickit.dev", mike: "michael.brown@toktickit.dev",
  sarah: "sarah.johnson@toktickit.dev", david: "david.lee@toktickit.dev",
  emily: "emily.davis@toktickit.dev", kevin: "kevin.patel@toktickit.dev",
  lisa: "lisa.martinez@toktickit.dev", robert: "robert.wilson@toktickit.dev",
};
const SEED_TICKETS: SeedTicket[] = [
  { requester: T.jen, category: "Hardware", system: "Corporate Laptop", summary: "Laptop battery drains quickly", description: "My laptop battery is draining much faster than usual even when the system is idle. This started after last week's Windows update.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "IN_PROGRESS", owner: T.emily, daysAgo: 6 },
  { requester: T.sarah, category: "Network", system: "VPN", summary: "Cannot connect to VPN", description: "The VPN client shows 'authentication failed' every time I try to connect from home, even after resetting my password.", requestedPriority: "HIGH", itPriority: "HIGH", status: "OPEN", owner: T.kevin, daysAgo: 5 },
  { requester: T.david, category: "Software", system: "Email", summary: "Email not syncing on mobile", description: "Outlook on my phone stopped syncing new mail two days ago. Desktop Outlook works fine.", requestedPriority: "MEDIUM", itPriority: "LOW", status: "WAITING_FOR_REQUESTER", owner: T.emily, daysAgo: 5 },
  { requester: T.jen, category: "Account and Access", system: "LEB2 App", summary: "New employee setup request", description: "Please create an LEB2 account for the new teaching assistant starting next Monday and add them to the CPE 334 course.", requestedPriority: "LOW", itPriority: "LOW", status: "RESOLVED", owner: T.lisa, daysAgo: 9 },
  { requester: T.mike, category: "Hardware", system: "Printer", summary: "Printer keeps showing offline", description: "The 3rd floor printer shows as offline on every PC in the office although it prints a test page locally.", requestedPriority: "MEDIUM", itPriority: "LOW", status: "OPEN", owner: null, daysAgo: 4 },
  { requester: T.sarah, category: "Account and Access", system: "Grade Submission App", summary: "Request access to grade submission", description: "I need edit access to the grade submission app for section 31 before the mid-term deadline.", requestedPriority: "LOW", itPriority: "LOW", status: "NEW", owner: null, daysAgo: 3 },
  { requester: T.david, category: "Software", system: "Corporate Laptop", summary: "Outlook freezing intermittently", description: "Outlook freezes for 10-20 seconds several times an hour, usually when opening messages with large attachments.", requestedPriority: "HIGH", itPriority: "MEDIUM", status: "IN_PROGRESS", owner: T.kevin, daysAgo: 3 },
  { requester: T.mike, category: "Hardware", system: "Corporate Laptop", summary: "Docking station not detected", description: "The docking station is no longer detected after the laptop wakes from sleep; a full reboot is needed each time.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "RESOLVED", owner: T.emily, daysAgo: 8, requesterResolved: true },
  { requester: T.jen, category: "Software", system: "LEB2 App", summary: "Software installation request", description: "Please install the statistics package on my laptop for the research project; the license is already approved.", requestedPriority: "LOW", itPriority: "LOW", status: "CLOSED", owner: T.lisa, daysAgo: 12 },
  { requester: T.sarah, category: "Hardware", system: "Corporate Laptop", summary: "Multi-monitor not detected", description: "The second external monitor is not detected since this morning. Cable swap did not help.", requestedPriority: "MEDIUM", itPriority: "MEDIUM", status: "IN_PROGRESS", owner: T.emily, daysAgo: 2 },
  { requester: T.david, category: "Network", system: "Campus Wi-Fi", summary: "Wi-Fi drops in the seminar room", description: "Wi-Fi disconnects every few minutes in seminar room 4; other rooms on the floor are fine.", requestedPriority: "HIGH", itPriority: "HIGH", status: "REOPENED", owner: T.kevin, daysAgo: 7 },
  { requester: T.mike, category: "Account and Access", system: "Email", summary: "Shared mailbox access", description: "Please grant me access to the department shared mailbox so I can answer student questions during the exam period.", requestedPriority: "LOW", itPriority: "LOW", status: "CANCELLED", owner: null, daysAgo: 10 },
  { requester: T.jen, category: "Network", system: "VPN", summary: "VPN slow in the evenings", description: "VPN throughput drops to almost nothing after 8pm; during the day it is fine.", requestedPriority: "LOW", itPriority: "LOW", status: "NEW", owner: null, daysAgo: 1 },
  { requester: T.sarah, category: "Software", system: "Grade Submission App", summary: "Grade export produces an empty file", description: "Exporting grades to CSV downloads a 0-byte file for section 2 only.", requestedPriority: "HIGH", itPriority: "HIGH", status: "OPEN", owner: T.lisa, daysAgo: 14 },
];

async function seedTickets() {
  const prisma = getPrisma();
  const allUsers = await prisma.user.findMany();
  const users = Object.fromEntries(allUsers.map((u) => [u.email, u.id]));
  // BR-23 — a Ticket Owner must be an *active* IT Staff / Administrator; refuse to seed anything else
  // (review on PR #41: an inactive owner would never appear in /api/staff/assignees).
  for (const t of SEED_TICKETS) {
    if (!t.owner) continue;
    const owner = allUsers.find((u) => u.email === t.owner);
    if (!owner || !owner.isActive || owner.role === "REQUESTER") {
      throw new Error(`Seed ticket "${t.summary}" names an owner that is not an active IT Staff/Administrator: ${t.owner}`);
    }
  }
  const categories = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, c.id]));
  const systems = Object.fromEntries((await prisma.relatedSystem.findMany()).map((r) => [r.name, r.id]));
  let created = 0;
  for (const t of SEED_TICKETS) {
    const requesterId = users[t.requester];
    const existing = await prisma.ticket.findFirst({ where: { requesterId, summary: t.summary } });
    const createdAt = new Date(Date.now() - t.daysAgo * 24 * 60 * 60 * 1000);
    const data = {
      categoryId: categories[t.category],
      relatedSystemId: systems[t.system],
      description: t.description,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.status,
      ownerId: t.owner ? users[t.owner] : null,
      requesterResolvedAt: t.requesterResolved ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000) : null,
    };
    if (existing) {
      await prisma.ticket.update({ where: { id: existing.id }, data });
    } else {
      await prisma.ticket.create({
        data: { ...data, ticketNumber: await generateTicketNumber(prisma), requesterId, summary: t.summary, createdAt },
      });
      created += 1;
    }
  }
  console.log(`Seeded ${SEED_TICKETS.length} tickets (${created} new).`);
}

async function main() {
  const prisma = getPrisma();

  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${CATEGORY_NAMES.length} categories.`);

  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${RELATED_SYSTEM_NAMES.length} related systems.`);

  // Hashing is the slow part by design (scrypt) — compute each distinct password once.
  const seedHash = await hashPassword(SEED_PASSWORD);
  const initialHash = await hashPassword(INITIAL_PASSWORD);

  for (const user of USERS) {
    const mustChange = user.mustChangePassword ?? false;
    const data = {
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: mustChange,
      passwordHash: mustChange ? initialHash : seedHash,
    };
    // Idempotent: re-running resets each seeded account to its documented state (including the
    // password), which is what a local lab wants after someone experiments with an account.
    await prisma.user.upsert({ where: { email: user.email }, update: data, create: { email: user.email, ...data } });
  }
  console.log(`Seeded ${USERS.length} users (requesters, IT staff, administrator).`);

  await seedTickets();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
