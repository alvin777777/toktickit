import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/services/password.js";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
