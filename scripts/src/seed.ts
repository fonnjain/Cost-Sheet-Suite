import { db } from "@workspace/db";
import { usersTable, customersTable, rmPricesTable } from "@workspace/db/schema";
import { readFileSync } from "fs";
import path from "path";

const ALLOWED_USERS = [
  { email: "varunp@vijaytransmission.com", name: "Varun P", role: "user" },
  { email: "sambitm@vijaytransmission.com", name: "Sambit M", role: "user" },
  { email: "rajeshnr@vijaytransmission.com", name: "Rajesh NR", role: "user" },
  { email: "sundars@vijaytransmission.com", name: "Sundar S", role: "user" },
  { email: "buntys@vijaytransmission.com", name: "Bunty S", role: "user" },
  { email: "sanjayp@vijaytransmission.com", name: "Sanjay P", role: "user" },
  { email: "alokp@vijaytransmission.com", name: "Alok P", role: "user" },
  { email: "richap@vijaytransmission.com", name: "Richa P", role: "user" },
  { email: "ai-tools@vijaytransmission.com", name: "AI Tools Admin", role: "admin" },
];

const DEFAULT_DAILY_DATA: Record<string, number> = {
  C6: 384400,
  C9: 38511,
  D9: 44511,
  H9: 47000,
  M9: 50000,
  C18: 57000,
  C21: 52500,
  D47: 0,
  D48: 10000,
  D49: 13000,
  D51: 18500,
  I71: 10000,
  I72: 10000,
  I73: 10000,
  I74: 9000,
  I77: 17500,
  I78: 17500,
  I79: 17500,
  I80: 21500,
  I81: 21500,
  F85: 7500,
  F91: 7500,
};

const DEFAULT_TWICE_MONTHLY_DATA: Record<string, number> = {
  C122: 5500,
  D122: 7000,
  E122: 8000,
  C125: 4000,
  D125: 5500,
};

async function seed() {
  console.log("Seeding users...");
  for (const user of ALLOWED_USERS) {
    try {
      await db
        .insert(usersTable)
        .values(user)
        .onConflictDoNothing();
    } catch {
      // already exists
    }
  }
  console.log(`Seeded ${ALLOWED_USERS.length} users.`);

  console.log("Seeding initial RM prices...");
  const [existing] = await db.select().from(rmPricesTable).limit(1);
  if (!existing) {
    await db.insert(rmPricesTable).values({
      dailyData: DEFAULT_DAILY_DATA,
      twiceMonthlyData: DEFAULT_TWICE_MONTHLY_DATA,
      createdByName: "System",
      isWindowUnlocked: false,
    });
    console.log("Seeded initial RM prices.");
  } else {
    console.log("RM prices already exist, skipping.");
  }

  console.log("Seeding customers from CSV...");
  const workspaceRoot = process.cwd().endsWith(path.join("scripts"))
    ? path.resolve(process.cwd(), "..")
    : process.cwd();
  const csvPath = path.resolve(workspaceRoot, "attached_assets/Clients_1780913725421.csv");
  const csvContent = readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").slice(1).filter((l) => l.trim());

  let seeded = 0;
  let skipped = 0;

  for (const line of lines) {
    const name = line.replace(/^"|"$/g, "").trim();
    if (!name) continue;
    try {
      const result = await db
        .insert(customersTable)
        .values({ name })
        .onConflictDoNothing()
        .returning();
      if (result.length > 0) {
        seeded++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  console.log(`Seeded ${seeded} customers, skipped ${skipped} duplicates.`);
  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
