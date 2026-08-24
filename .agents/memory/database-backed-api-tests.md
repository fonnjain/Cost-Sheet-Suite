---
name: Database-backed API tests
description: Safe isolation rules for integration tests that exercise the API through PostgreSQL.
---

Database-backed API tests must require an explicit `TEST_DATABASE_URL`, create a uniquely named disposable schema before importing the application's database pool, constrain the pool to that schema, and drop the schema at teardown.

**Why:** Tests that use the application's normal database can temporarily change live behavior even when they clean up later (for example, daily lock state), and concurrent activity makes assertions based on globally newest rows unreliable.

**How to apply:** Clone only the tables needed by the suite into the temporary schema, import the app after setting its connection search path, and fail closed when no explicit test connection is supplied. Run the suite with an intentional `TEST_DATABASE_URL`; using the development database is safe only through that isolated schema.