import { getPrisma } from "../src/prisma.js";

// Issue 3 (Lab 1) — seed the four supported categories.
// Uses upsert so running the seed more than once never creates duplicates.
const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

// Lab 2 Issue 2 — seed Development Requesters (testing mechanism only, not real users).
// At least 4 active + 1 inactive, per docs/lab-02/specification.md §5.3.
const REQUESTERS = [
  { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.dev", isActive: true },
  { name: "Michael Brown", email: "michael.brown@toktickit.dev", isActive: true },
  { name: "Sarah Johnson", email: "sarah.johnson@toktickit.dev", isActive: true },
  { name: "David Lee", email: "david.lee@toktickit.dev", isActive: true },
  { name: "Former Employee", email: "former.employee@toktickit.dev", isActive: false },
];

async function main() {
  const prisma = getPrisma();

  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${CATEGORY_NAMES.length} categories.`);

  for (const requester of REQUESTERS) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      update: { name: requester.name, isActive: requester.isActive },
      create: requester,
    });
  }
  console.log(`Seeded ${REQUESTERS.length} development requesters.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
