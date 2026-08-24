import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test, before, after } from "node:test";
// @ts-expect-error pg's ESM entry is untyped despite its separately installed DefinitelyTyped package.
import { Client } from "pg";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "");
const schemaName = `rm_provenance_test_${suffix}`;
const adminName = `RM provenance test ${suffix}`;
const adminEmail = `rm-provenance-admin-${suffix}@example.test`;
const userEmail = `rm-provenance-user-${suffix}@example.test`;
const projectRef = `RM-PROVENANCE-${suffix}`;
const legacyProjectRef = `${projectRef}-LEGACY`;
const isolatedTables = ["users", "sessions", "rm_offsets", "rm_prices", "rm_daily_locks", "quotes"];

let schemaSource = "";
let schemaClient: Client;
let server: any;
let baseUrl = "";
let app: any;
let db: any;
let pool: any;
let tables: any;
let adminToken = "";
let nonAdminToken = "";
let adminId = 0;
let nonAdminId = 0;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function withSearchPath(connectionString: string, searchPath: string) {
  const url = new URL(connectionString);
  const existingOptions = url.searchParams.get("options");
  const searchPathOption = `-c search_path=${searchPath}`;
  url.searchParams.set("options", existingOptions ? `${existingOptions} ${searchPathOption}` : searchPathOption);
  return url.toString();
}

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (path !== "/auth/login") headers.set("authorization", `Bearer ${adminToken}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) as Record<string, any> | any[] : null,
  };
}

async function requestAs(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) as Record<string, any> | any[] : null,
  };
}

before(async () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required. Refusing to run integration tests against the application's default database.");
  }

  schemaClient = new Client({ connectionString: testDatabaseUrl });
  await schemaClient.connect();
  const schemaResult = await schemaClient.query("SELECT current_schema() AS name");
  schemaSource = schemaResult.rows[0].name;

  await schemaClient.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  for (const table of isolatedTables) {
    await schemaClient.query(
      `CREATE TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(table)} (LIKE ${quoteIdentifier(schemaSource)}.${quoteIdentifier(table)} INCLUDING ALL)`,
    );
  }

  // The application imports its database pool only after the isolated schema
  // exists. Every app connection is constrained to this schema, which is
  // discarded at teardown and never touches the configured application's rows.
  process.env.DATABASE_URL = withSearchPath(testDatabaseUrl, schemaName);
  ({ default: app } = await import("../app"));
  ({ db, pool } = await import("@workspace/db"));
  tables = await import("@workspace/db/schema");

  const [admin] = await db.insert(tables.usersTable).values({
    email: adminEmail,
    name: adminName,
    role: "admin",
    isActive: true,
    passwordHash: null,
    mustChangePassword: false,
  }).returning({ id: tables.usersTable.id });
  const [user] = await db.insert(tables.usersTable).values({
    email: userEmail,
    name: `RM provenance user ${suffix}`,
    role: "user",
    isActive: true,
    passwordHash: null,
    mustChangePassword: false,
  }).returning({ id: tables.usersTable.id });
  adminId = admin.id;
  nonAdminId = user.id;

  adminToken = `rm-provenance-admin-token-${suffix}`;
  nonAdminToken = `rm-provenance-user-token-${suffix}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(tables.sessionsTable).values([
    { token: adminToken, userId: adminId, expiresAt },
    { token: nonAdminToken, userId: nonAdminId, expiresAt },
  ]);

  // This row exists only in the disposable schema and makes the save path
  // independent of the wall clock's 2pm lock behavior.
  const now = new Date();
  await db.insert(tables.rmDailyLocksTable).values({
    lockedDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    locked: false,
    lockedByName: adminName,
  });

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error: Error | undefined) => error ? reject(error) : resolve());
    });
  }
  if (pool) await pool.end();
  if (schemaClient) {
    await schemaClient.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await schemaClient.end();
  }
});

test("RM history requires admin access and preserves saved source revisions", async () => {
  const unauthenticated = await fetch(`${baseUrl}/rm-prices/history`);
  assert.equal(unauthenticated.status, 401);

  const nonAdmin = await requestAs("/rm-prices/history", nonAdminToken);
  assert.equal(nonAdmin.response.status, 403);

  const offsetResponse = await request("/rm-offsets", {
    method: "POST",
    body: JSON.stringify({ offsetData: { E9: 4100, G9: 1700, D18: 7100 } }),
  });
  assert.equal(offsetResponse.response.status, 201);
  const offset = offsetResponse.body as { id: number };

  const firstData = { C9: 38000, D9: 44000, H9: 47000, C18: 56000, E9: 42100 };
  const firstSave = await request("/rm-prices", {
    method: "POST",
    body: JSON.stringify({ dailyData: firstData, twiceMonthlyData: { C12: 50000 } }),
  });
  assert.equal(firstSave.response.status, 201);
  const first = firstSave.body as { id: number; offsetVersion: { id: number } };
  assert.equal(first.offsetVersion.id, offset.id);

  const secondData = { ...firstData, C9: 39200, E9: 43300 };
  const secondSave = await request("/rm-prices", {
    method: "POST",
    body: JSON.stringify({ dailyData: secondData, twiceMonthlyData: { C12: 50100 } }),
  });
  assert.equal(secondSave.response.status, 201);
  const second = secondSave.body as { id: number };
  assert.notEqual(second.id, first.id);

  const beforeOverrideResponse = await request("/rm-prices/history");
  assert.equal(beforeOverrideResponse.response.status, 200);
  const beforeOverride = beforeOverrideResponse.body as Array<any>;
  const firstRevisionBeforeOverride = beforeOverride.find((row) => row.id === first.id);
  const secondRevisionBeforeOverride = beforeOverride.find((row) => row.id === second.id);
  assert.deepEqual(firstRevisionBeforeOverride.dailyData, firstData);
  assert.deepEqual(secondRevisionBeforeOverride.dailyData, secondData);
  assert.equal(firstRevisionBeforeOverride.offsetVersion.id, offset.id);
  assert.equal(secondRevisionBeforeOverride.offsetVersion.id, offset.id);

  const latest = beforeOverride[0];
  const override = await request("/rm-prices/unlock-twice-monthly", {
    method: "POST",
    body: JSON.stringify({ unlocked: !latest.isWindowUnlocked }),
  });
  assert.equal(override.response.status, 200);

  const afterOverride = (await request("/rm-prices/history")).body as Array<any>;
  const firstRevisionAfterOverride = afterOverride.find((row) => row.id === first.id);
  const secondRevisionAfterOverride = afterOverride.find((row) => row.id === second.id);
  assert.deepEqual(firstRevisionAfterOverride.dailyData, firstData);
  assert.deepEqual(secondRevisionAfterOverride.dailyData, secondData);
  assert.equal(afterOverride[0].createdByName, `${adminName} (window override)`);
  assert.deepEqual(afterOverride[0].dailyData, secondData);
});

test("new quotes retain RM provenance while unlinked legacy quotes remain readable", async () => {
  const offsetResponse = await request("/rm-offsets", {
    method: "POST",
    body: JSON.stringify({ offsetData: { E9: 4200, G9: 1800, D18: 7200 } }),
  });
  assert.equal(offsetResponse.response.status, 201);
  const offset = offsetResponse.body as { id: number };

  const priceResponse = await request("/rm-prices", {
    method: "POST",
    body: JSON.stringify({ dailyData: { C9: 38100 }, twiceMonthlyData: {} }),
  });
  assert.equal(priceResponse.response.status, 201);
  const price = priceResponse.body as { id: number };

  const quoteResponse = await request("/quotes", {
    method: "POST",
    body: JSON.stringify({
      customerId: 900000,
      customerName: `RM provenance customer ${suffix}`,
      projectRef,
      structureType: "TLT >800 mt",
      kvOption: "400",
      quotePricePerMt: 123456.78,
      totalCost: 111111.11,
      steelPrice: 50000,
      zincPrice: 250,
      rmPricesId: price.id,
      rmOffsetsId: offset.id,
      inputs: { steelBasePrice: 50000 },
      costBreakdown: { steel: 50000 },
      generatedByName: adminName,
    }),
  });
  assert.equal(quoteResponse.response.status, 201);
  const quote = quoteResponse.body as any;
  assert.equal(quote.rmPricesId, price.id);
  assert.equal(quote.rmOffsetsId, offset.id);
  assert.equal(quote.rmPriceSource.id, price.id);
  assert.equal(quote.rmPriceSource.createdByName, adminName);
  assert.equal(quote.rmOffsetSource.id, offset.id);
  assert.equal(quote.rmOffsetSource.updatedByName, adminName);

  const persisted = await request(`/quotes/${quote.id}`);
  assert.equal(persisted.response.status, 200);
  assert.equal((persisted.body as any).rmPriceSource.id, price.id);
  assert.equal((persisted.body as any).rmOffsetSource.id, offset.id);

  const [legacy] = await db.insert(tables.quotesTable).values({
    customerId: 900001,
    customerName: `Legacy customer ${suffix}`,
    projectRef: legacyProjectRef,
    structureType: "Fasteners",
    kvOption: null,
    quotePricePerMt: "90000",
    totalCost: "85000",
    steelPrice: null,
    zincPrice: null,
    rmPricesId: null,
    rmOffsetsId: null,
    inputs: {},
    costBreakdown: {},
    generatedByName: "Historical import",
    legacy: true,
  }).returning({ id: tables.quotesTable.id });

  const legacyResponse = await request(`/quotes/${legacy.id}`);
  assert.equal(legacyResponse.response.status, 200);
  assert.equal((legacyResponse.body as any).rmPricesId, null);
  assert.equal((legacyResponse.body as any).rmOffsetsId, null);
  assert.equal((legacyResponse.body as any).rmPriceSource, null);
  assert.equal((legacyResponse.body as any).rmOffsetSource, null);
  assert.equal((legacyResponse.body as any).legacy, true);
});