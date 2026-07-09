# Vijay Transmission Cost Sheet Suite — Architecture

This document describes how the project is structured and how the pieces fit
together. It is intended for anyone new to the codebase who needs to understand
the system end to end. All file paths are relative to the repository root.

## 1. System overview and purpose

The suite is a mobile-first internal costing tool for a power transmission steel
fabricator. Field engineers use it to:

1. Maintain raw-material (RM) prices in a console.
2. Enter project information and select a structure type.
3. Configure a full cost build-up and see the per-tonne quote price update live.
4. Save quotes (with automatic revision tracking) and review/approve historical
   revisions per client and project.

A dashboard surfaces KPIs and charts over saved quotes. The application is dark
mode only (navy `#0e1f33` background, red `#e63329` accent), uses Sora for UI
text and Space Mono for numbers, formats numbers in the Indian locale
(`₹1,23,456`), and uses no emojis in the UI.

Authentication is email + password against an allowlist. Every user starts on
the default password (`Vtpl@2026`) and must set their own password on first
logon before using the rest of the app.

## 2. Tech stack

- Monorepo: pnpm workspaces, Node.js 24, TypeScript 5.9.
- Frontend: React 19 + Vite + Tailwind CSS + shadcn/ui (Radix primitives) +
  wouter for routing. Charts use Recharts. PDF export uses jspdf and
  jspdf-autotable.
- Server state / data fetching: TanStack Query (React Query).
- API: Express 5.
- Database: PostgreSQL with Drizzle ORM.
- Validation: Zod (`zod/v4`) and `drizzle-zod`.
- API codegen: Orval, generating React Query hooks and Zod schemas from a single
  OpenAPI spec.
- API build: esbuild (ESM bundle).
- Logging (server): pino / pino-http.

## 3. Monorepo layout

```
artifacts/                 Deployable applications
  cost-sheet/              React + Vite frontend (web, served at /)
  api-server/              Express 5 API (served at /api)
  mockup-sandbox/          Design/preview tool (not part of the product runtime)
lib/                       Shared libraries
  api-spec/                openapi.yaml (source of truth) + Orval config
  api-client-react/        Generated React Query hooks + custom fetch mutator
  api-zod/                 Generated Zod schemas (request/response validation)
  db/                      Drizzle schema, client, and exports
scripts/                   Utility scripts (@workspace/scripts), e.g. seeding
pnpm-workspace.yaml        Workspace package discovery, catalog pins
tsconfig.base.json         Shared strict TS defaults
tsconfig.json              Root solution config for composite libs only
package.json               Root task orchestration
```

Conventions (see the `pnpm-workspace` skill for full detail):

- `lib/*` packages are composite and emit declarations via `tsc --build`.
- `artifacts/*` and `scripts` are leaf packages typechecked with `tsc --noEmit`.
  They never import from each other; shared code lives in a `lib/*` package.
- A global reverse proxy routes traffic by path. Each artifact declares its
  routing in `.replit-artifact/artifact.toml`. The API server owns `/api`; the
  frontend owns `/`. Paths are not rewritten, so each service handles its own
  full base path.

### Package dependency graph

```
                         lib/api-spec (openapi.yaml)
                                  │  orval codegen
                 ┌────────────────┴────────────────┐
                 ▼                                  ▼
      lib/api-client-react                      lib/api-zod
        (React Query hooks)                   (Zod schemas)
                 │                                  │
                 ▼                                  ▼
       artifacts/cost-sheet               artifacts/api-server ──► lib/db
        (React frontend)                     (Express API)      (Drizzle/PG)
```

The frontend depends on `@workspace/api-client-react`. The API server depends on
`@workspace/api-zod` and `@workspace/db`. Both generated libraries are produced
from `lib/api-spec/openapi.yaml`, which is the contract that keeps the two sides
in sync.

## 4. Frontend architecture (`artifacts/cost-sheet`)

### Routing and pages

Routing uses wouter, mounted under the Vite base path
(`import.meta.env.BASE_URL`). See `src/App.tsx`. Routes:

- `/login` — `src/pages/login.tsx`: email + password sign-in; redirects to
  `/change-password` when the user is still on the default password.
- `/change-password` — `src/pages/change-password.tsx`: standalone page
  (outside `Layout`) for the forced first-logon password change (current +
  new + confirm, minimum 8 characters).
- `/` — `src/pages/home.tsx`: landing / step navigation.
- `/rm-prices` — `src/pages/rm-prices.tsx`: RM prices console (daily and
  twice-monthly panels, window lock, admin unlock).
- `/rm-data-variation` — `src/pages/rm-data-variation.tsx`: editable offset
  configuration for the 9 auto-populated billet and wire-rod cells (E9, F9,
  G9, I9, J9, K9, L9, D18, E18). Shows BASE | OFFSET (editable) | RESULT
  per cell; persists offsets to the `rm_offsets` table via `POST /api/rm-offsets`.
- `/rm-price-list` — `src/pages/rm-price-list.tsx`: read-only "RM Price List"
  tab mirroring the second worksheet of the source Excel file. Purely a
  display of the same embedded RM data used elsewhere — no inputs, no save,
  no effect on any calculation or quote. Built on `buildRMPriceListView()`
  in `src/lib/v6/engine.ts`, a new function added alongside (not modifying)
  `buildRMData()`: it reuses the same formula evaluator/overrides but also
  surfaces the Base Price and Load+Transport+Brokerage/Transportation header
  rows for display. Renders one card per material block (Angles, MS Flats,
  MS Rounds, RSJ/WPB/Channels & Beams, Plate, Pipe, Hardware Nuts & Bolts,
  Foundation Bolts) with supplier columns (name + make) and section-size
  rows, a dash for missing prices, and the same RM date / zinc price shown
  on the RM Prices console.
- `/calculator` — `src/pages/calculator.tsx`: project info, structure picker,
  full cost build-up, save quote.
- `/dashboard` — `src/pages/dashboard.tsx`: KPIs and charts.
- `/review` — `src/pages/review.tsx`: compare all revisions for a
  client + project; approve a revision; legacy-quote messaging.
- `/admin` — `src/pages/admin.tsx`: user management and twice-monthly window
  unlock (admin only).
- `/rm-ratios` — `src/pages/rm-ratios.tsx` (admin only): hosts the RM Ratio
  Editor (`src/components/rm-ratio-editor.tsx`) for the 11 structures with
  voltage-weighted RM price ratios.
- Fallback — `src/pages/not-found.tsx`.

All non-login routes render inside `src/components/layout.tsx`.

### Server state and data fetching

Data fetching is done with TanStack Query through the generated hooks in
`@workspace/api-client-react`. The `QueryClient` (in `src/App.tsx`) is configured
to skip retries on `401`/`403` responses and uses a 30-second stale time.

### Authentication / token handling

- The session token is stored in `localStorage` under the key
  `vt_session_token`. See `src/lib/auth.ts`.
- `src/lib/auth.ts` registers a token getter with the generated client via
  `setAuthTokenGetter`. The custom fetch mutator
  (`lib/api-client-react/src/custom-fetch.ts`) then attaches
  `Authorization: Bearer <token>` to every request when no explicit
  Authorization header is present.
- On login the token is stored and the getter re-initialized; on logout the token
  is cleared and the getter removed.

### Cost-calculation engine

The full cost build-up is computed in the browser in real time. There are two
relevant modules:

- `src/lib/v6/` — the faithful port of the v6 workbook engine, used for new
  quotes:
  - `data.ts` — auto-generated, embedded source-of-truth data extracted from the
    v6 workbook: `BILLET_FULL`, `RM_FULL`, `INITIAL_DATA`, `MASTER_SPECS`, and
    `STRUCTURE_FAMILIES`. Do not edit by hand.
  - `engine.ts` — an Excel-style formula evaluator (supports `+`, `AVERAGE`,
    cell and cross-sheet references, and overrides applied to Billet-sheet
    cells) plus the RM-data parsing and the cost-sheet math: `buildRMData`,
    `pickRMPriceForCategory`, `calculateRMPrice`, `calculateCostSheet`, and
    `buildDefaultInputs`. It reproduces the v6 numbers to the rupee. Also
    exports `DEFAULT_OFFSETS` (the 9 default additive constants) and
    `computeAutoOverrides(daily, offsets)`, which merges DB-persisted offsets
    on top of the defaults and returns the computed cell values; G9 chains off
    the already-computed E9 rather than off the raw base.
  - `legacy.ts` — `toLegacyShape` maps the v6 engine's `CostResults` and
    v6-keyed inputs into the flat, camelCase storage shape (`legacyInputs` +
    `legacyCostBreakdown`) that the dashboard, review, and PDF-export pages read.
    New quotes are computed by the v6 engine but persisted in this stable shape
    so all downstream display code keeps working.
- `src/lib/costCalculator.ts` — a placeholder/legacy generic calculator. Its
  `formatINR` helper is still used elsewhere in the UI for Indian-locale
  currency formatting.

Only the final result plus the inputs are stored in the database; the
calculation itself is not run on the server.

### Admin-editable RM ratios

For the `tlt5`/`subp`-schema structures (voltage-weighted RM price build-up),
the per-category percentage ratios used to blend RM prices are admin-editable
rather than fully hardcoded. `calculator.tsx` builds an `effectiveSpec` (a
shallow clone of the `MASTER_SPECS` entry) by fetching `GET /api/rm-ratios` and
overlaying any saved `(structureName, kv, category)` values onto the spec's
`ratios.kv_options[].ratios` object, falling back to the hardcoded
`MASTER_SPECS` values when the fetch hasn't landed or a row is missing.
`effectiveSpec` — never the raw `spec` — is what gets passed into
`calculateCostSheet`/`calculateRMPrice`; those engine functions themselves are
never modified. This only affects quotes computed going forward: saved quotes
store their computed result and inputs, so past quotes are never retroactively
recalculated.

## 5. API architecture (`artifacts/api-server`)

### Application setup

`src/index.ts` reads `PORT` (required) and starts the server. `src/app.ts`
configures the Express app: pino-http request logging, `cors`,
`express.json`, `express.urlencoded`, and mounts the combined router under
`/api`. `src/routes/index.ts` composes the per-feature routers.

### Route groups

Handlers that accept a request body, params, or query generally validate it with
the generated Zod schemas from `@workspace/api-zod`, and require authentication
via middleware unless noted.

- `src/routes/health.ts` — `GET /api/healthz` (no auth).
- `src/routes/auth.ts`:
  - `POST /api/auth/login` (no auth) — email lookup against the allowlist plus
    password verification, then issues a 30-day session token. When
    `users.passwordHash` is `NULL` the user is still on the default password
    (`Vtpl@2026`, a constant in this file) and the password is compared against
    that; otherwise it is checked with `bcrypt.compare`. Unknown email, inactive
    user, and wrong password all return the same generic 401 message to prevent
    account enumeration.
  - `POST /api/auth/change-password` — validates the current password, requires
    a new password of at least 8 characters that is not the default, stores a
    bcrypt hash (cost 10), clears `mustChangePassword`, and revokes every other
    session for the user (only the session making the change survives).
  - `POST /api/auth/logout` — deletes the session row matching the token
    resolved by the shared `extractToken` helper (`Authorization: Bearer
    <token>` first, `X-Session-Token` as a fallback). This is the same token the
    generated client sends, so a Bearer-authenticated logout now revokes the
    underlying session row immediately.
  - `GET /api/auth/me` — current user.
- `src/routes/users.ts` (admin only) — `GET/POST /api/users`,
  `PATCH/DELETE /api/users/:id`, and `GET /api/users/activity` — per-user quote
  activity: all quotes grouped by `generatedByName`, sorted by count
  descending, each with customer name, project ref, structure type, revision,
  and date (rendered as the expandable "User Quote Activity" card on `/admin`).
- `src/routes/customers.ts` — `GET/POST /api/customers`.
- `src/routes/rm-prices.ts`:
  - `GET /api/rm-prices` — latest RM prices. `isWindowUnlocked` is the
    effective state (true when today is the 1st or 16th, OR an admin has
    overridden it); `isWindowOverride` is the raw stored admin flag, exposed
    separately so the admin toggle reflects the override independently of the
    schedule. `isDailyLocked` is true when an admin has locked the RM file for
    today (see daily lock below). The response also fetches the latest row from
    `rm_offsets` in parallel and embeds `offsetData` for consumers that need it
    alongside prices.
  - `POST /api/rm-prices` — save a new RM-price snapshot. Returns 403 when the
    RM file is daily-locked, so the lock is enforced server-side, not just in UI.
  - `GET /api/rm-prices/history` — last 30 snapshots.
  - `POST /api/rm-prices/unlock-twice-monthly` (admin only) — toggle the
    twice-monthly window override. Accepts an optional `{ unlocked: boolean }`
    body (validated by `WindowToggleInput`); defaults to `true` (unlock) when
    omitted, for backward compatibility. Sets `isWindowUnlocked` on the latest
    snapshot, so admins can both open and re-lock the window.
  - `POST /api/rm-prices/toggle-daily-lock` (admin only) — lock/unlock all RM
    file inputs for today. Accepts `{ locked: boolean }` (validated by
    `DailyLockInput`). Appends a row to `rm_daily_locks` with `lockedDate` set to
    today's key plus the chosen `locked` direction, so an admin override (lock or
    unlock) only counts for today. See the daily-lock decision below for how this
    combines with the 2:00 PM auto-lock schedule.
- `src/routes/rm-offsets.ts`:
  - `GET /api/rm-offsets` — returns the latest `offsetData` object (keyed by
    cell ref, e.g. `{ "E9": 4000, ... }`); returns `{}` when no row exists.
  - `POST /api/rm-offsets` — inserts a new offset snapshot, validated with
    the generated `SaveRmOffsetsBody` Zod schema. Each save is appended; the
    GET always reads the most-recent row (append-only audit trail).
- `src/routes/rm-ratios.ts`:
  - `GET /api/rm-ratios` — `requireAuth` only (not admin-gated): every user's
    quote calculation needs the current ratios, and the values already ship in
    the client JS bundle via `MASTER_SPECS`, so they aren't secret. Returns all
    `(structureName, kv, category)` rows.
  - `POST /api/rm-ratios` (admin only) — upserts the full ratio row for one
    `(structureName, kv)`, validated with the generated `SaveRmRatiosBody` Zod
    schema. Rejects if any value is outside `[0, 1]` or the row doesn't sum to
    ~100% (0.5% float tolerance). Diffs each category against the current DB
    value and appends a row to `rm_ratio_history` only for categories that
    actually changed.
  - `GET /api/rm-ratios/history` (admin only) — last 100 change-log rows,
    newest first.
- `src/routes/quotes.ts`:
  - `GET /api/quotes` — list with optional `customerId` / `projectRef` filters.
  - `POST /api/quotes` — create; auto-assigns the next revision (see below).
  - `GET /api/quotes/by-project` — all revisions for a customer + project.
  - `POST /api/quotes/:id/approve` — mark one revision approved; runs in a
    transaction that clears the approved flag on all sibling revisions first so
    exactly one revision per customer + project is approved.
  - `GET /api/quotes/:id` — single quote.
  - `GET /api/review/projects` — distinct project refs for a customer.
- `src/routes/dashboard.ts` — `GET /api/dashboard/summary`,
  `/recent-quotes`, `/quotes-by-structure`, `/quotes-by-user`.

### Auth middleware (`src/middlewares/auth.ts`)

- `requireAuth` extracts the bearer token (from `Authorization: Bearer <token>`,
  with `X-Session-Token` as a fallback), validates a non-expired session,
  confirms the user exists and is active, and attaches `userId`, `userRole`, and
  `userName` to the request. While the user's `mustChangePassword` flag is set,
  every endpoint except `/auth/change-password`, `/auth/logout`, and `/auth/me`
  returns `403 Password change required`, so the forced first-logon password
  change is enforced server-side, not just in the UI.
- `requireAdmin` requires `userRole === "admin"` (returns `403` otherwise).

## 6. Database schema (`lib/db`)

The Drizzle client is created in `lib/db/src/index.ts` from a `pg` pool using
`DATABASE_URL`; the schema is re-exported from `lib/db/src/schema/`. Tables:

- `users` (`schema/users.ts`): `id` (serial PK), `email` (unique), `name`,
  `role` (default `user`), `isActive` (default true), `passwordHash` (nullable;
  `NULL` means the user is still on the default password), `mustChangePassword`
  (default true — forces the first-logon password change), `createdAt`,
  `updatedAt`.
- `sessions` (`schema/sessions.ts`): `token` (PK), `userId`, `createdAt`,
  `expiresAt`. A session references a user by `userId`.
- `customers` (`schema/customers.ts`): `id` (serial PK), `name` (unique),
  `createdAt`.
- `rm_prices` (`schema/rm_prices.ts`): `id` (serial PK), `dailyData` (jsonb),
  `twiceMonthlyData` (jsonb), `createdByName`, `isWindowUnlocked` (default
  false), `createdAt`. Each row is a point-in-time RM-price snapshot.
- `rm_offsets` (`schema/rm_offsets.ts`): `id` (serial PK), `offsetData`
  (jsonb — a `Record<string, number>` keyed by cell ref such as `E9`),
  `updatedByName`, `updatedAt`. Append-only; the GET endpoint reads the
  most-recent row. Stores the 9 additive offset constants that control the
  auto-populated billet and wire-rod cells; defaults fall back to
  `DEFAULT_OFFSETS` in `engine.ts` when no row exists.
- `rm_ratios` (`schema/rm_ratios.ts`): `id` (serial PK), `structureName`,
  `kv`, `category`, `ratioValue` (real, fraction 0-1), `updatedByName`,
  `updatedAt`. Unique on `(structureName, kv, category)` — this is the
  current-value table, upserted on save. Seeded with the exact `MASTER_SPECS`
  defaults for the 11 admin-editable structures so nothing changes until an
  admin edits a value.
- `rm_ratio_history` (`schema/rm_ratio_history.ts`): `id` (serial PK),
  `structureName`, `kv`, `category`, `oldValue` (nullable — null on first
  write for a cell), `newValue`, `changedByName`, `changedAt`. Append-only;
  one row per changed cell per save (unchanged cells in the same save don't
  get a history row).
- `quotes` (`schema/quotes.ts`): `id` (serial PK), `customerId`, `customerName`
  (denormalized for query performance), `projectRef`, `revision` (default 0),
  `structureType`, `kvOption`, `quotePricePerMt`, `totalCost`, `steelPrice`,
  `zincPrice`, `inputs` (jsonb), `costBreakdown` (jsonb), `generatedByName`,
  `notes`, `approved` (default false), `approvedAt`, `approvedByName`, `legacy`
  (default false), `createdAt`.
- `rm_daily_locks` (`schema/rm_daily_locks.ts`): `id` (serial PK), `lockedDate`
  (text, e.g. `2026-07-03`), `locked` (boolean, default true), `lockedByName`,
  `createdAt`. Append-only; the GET endpoint reads the most-recent row for
  `lockedDate` to decide whether the Daily RM panel is locked (auto-locked at
  2:00 PM each day, or unlocked early by an admin).

Relationships are expressed by ID columns (`sessions.userId -> users.id`,
`quotes.customerId -> customers.id`) rather than enforced foreign keys in the
schema files. `customerName` is denormalized onto quotes to avoid joins on the
hot read paths (lists, dashboard aggregations).

### Revision logic

On `POST /api/quotes`, the server finds the highest existing `revision` for the
`(customerId, projectRef)` pair and inserts the next one. The first quote for a
project is Rev 0; subsequent saves are Rev 1, Rev 2, and so on. Approval is
mutually exclusive per `(customerId, projectRef)`.

### Legacy flagging

Quotes computed by the pre-reconciliation engine carry `legacy = true` and are
shown read-only in the review page with a "computed on previous logic" note. New
quotes default to `legacy = false`.

## 7. Contract-first API and codegen

`lib/api-spec/openapi.yaml` is the single source of truth for the API contract
(`info.title` is `Api`, which controls generated filenames — do not change it).

Codegen is driven by `lib/api-spec/orval.config.ts` and run with:

```
pnpm --filter @workspace/api-spec run codegen
```

This produces two outputs:

- `lib/api-client-react/src/generated/` — React Query hooks (split mode,
  `react-query` client, base URL `/api`) wired to the `customFetch` mutator in
  `lib/api-client-react/src/custom-fetch.ts`. The frontend consumes these hooks.
- `lib/api-zod/src/generated/` — Zod schemas (request bodies, params, query, and
  responses). The API server imports these to validate inputs and outputs.

Workflow: edit `openapi.yaml`, run codegen, then update server handlers and
frontend usage. After changes to any `lib/*` package, run `pnpm run
typecheck:libs` before checking the leaf artifact packages.

## 8. Key architecture decisions

- Email + password auth with a default-password bootstrap: login is an email
  lookup against an allowlist plus a password check. New users start on the
  default password `Vtpl@2026` (`passwordHash` `NULL` in the DB) and must set
  their own bcrypt-hashed password on first logon; until then `requireAuth`
  blocks everything except the change-password/logout/me endpoints. On success
  a random 30-day session token is issued, stored in the `sessions` table, sent
  as `Authorization: Bearer <token>`, and persisted in `localStorage`. Changing
  the password revokes all other sessions for that user.
- Twice-monthly RM window: the twice-monthly RM panel (plates, coils) is locked
  unless today is the 1st or 16th of the month, or an admin has explicitly
  unlocked it via the admin panel.
- Daily RM lock: the entire RM file (daily + twice-monthly inputs and saving)
  auto-locks every day at 2:00 PM server-local time; only an admin can reopen it
  for the rest of that day via the admin panel. An admin can also lock early.
  The schedule resets each day on its own. Independent of the twice-monthly
  window; enforced both in the UI (disabled inputs/save + banner) and server-side
  (403 on save). Backed by the append-only `rm_daily_locks` table (`lockedDate` +
  `locked` direction): an override row dated today wins over the schedule,
  otherwise the 2:00 PM `isAfterAutoLockTime()` check applies.
- Quote auto-revisioning: revisions auto-increment per
  `(customerId, projectRef)`; approval is mutually exclusive per project.
- Client-side calculation with a stable storage shape: the full cost build-up is
  computed in the browser by the v6 engine, then mapped via `toLegacyShape`
  into a flat shape before storage so display code stays stable. Only the final
  result and inputs are persisted.
- Admin-editable RM ratios: voltage-weighted RM price ratios for 11 structures
  are admin-editable (row-sum-to-100% validated, per-cell history logged) but
  seeded to the exact `MASTER_SPECS` defaults so nothing changes until an admin
  edits a value. Only the spec object fed into `calculateRMPrice` is
  overridden; the engine functions and previously saved quotes are untouched.
- DB-persisted RM offsets: the 9 additive constants that derive auto-populated
  billet/wire-rod cell values (E9, F9, G9, I9, J9, K9, L9, D18, E18) from the
  daily input prices are stored in `rm_offsets` and editable via the RM Data
  Variation page. `computeAutoOverrides` in `engine.ts` merges these on top of
  `DEFAULT_OFFSETS`. Both the RM console and the Calculator fetch the latest
  offsets via `useGetRmOffsets` and apply them when building RM data.
- Legacy quote flagging: older quotes are flagged and rendered read-only with a
  note, keeping revision history intact while new quotes use the corrected
  engine.
- Contract-first API: OpenAPI is authoritative; client hooks and server Zod
  schemas are generated from it.

## 9. End-to-end request flow

1. The user signs in at `/login`. `POST /api/auth/login` validates the email
   against the allowlist plus the password (default `Vtpl@2026` until changed)
   and returns a user plus a session token.
2. The frontend stores the token in `localStorage` (`vt_session_token`) and
   registers the token getter so the custom fetch mutator attaches
   `Authorization: Bearer <token>` to subsequent requests. If the user is still
   on the default password (`mustChangePassword`), both the login page and
   `Layout` redirect to `/change-password`, and the server rejects all other
   endpoints until the password is changed.
3. Authenticated data fetches (RM prices, customers, quotes, dashboard) go
   through generated React Query hooks; `requireAuth` validates the session and
   attaches user context on the server.
4. On the calculator, RM prices are loaded, the v6 engine computes the cost
   build-up live in the browser, and the user reviews the quote.
5. Saving a quote calls `POST /api/quotes`. The server assigns the next revision
   for the customer + project and persists the inputs and cost breakdown.
6. On the review page, the user compares all revisions for a customer + project
   and can approve one revision (`POST /api/quotes/:id/approve`), which clears
   approval on sibling revisions in a transaction.

```
Browser (cost-sheet)                          API server                    PostgreSQL
   │  POST /api/auth/login (email+password) ─►  validate allowlist  ───────►  users
   │  ◄──── user + token ───────────────────   create session      ───────►  sessions
   │  store token in localStorage
   │  GET /api/rm-prices  (Bearer token) ────►  requireAuth ► query  ───────►  rm_prices
   │  compute quote locally (v6 engine)
   │  POST /api/quotes  (Bearer token)   ────►  next revision ► insert ─────►  quotes
   │  POST /api/quotes/:id/approve       ────►  transaction (clear+set) ────►  quotes
```

## 10. Build, run, and operate

Run during development (each via its workflow / pnpm filter):

- API server: `pnpm --filter @workspace/api-server run dev` (reads `PORT`,
  proxied at `/api`).
- Frontend: `pnpm --filter @workspace/cost-sheet run dev` (proxied at `/`).

Quality and build:

- Typecheck everything: `pnpm run typecheck` (builds composite libs first via
  `tsc --build`, then typechecks leaf artifact/script packages).
- Typecheck libs only: `pnpm run typecheck:libs`.
- Build all: `pnpm run build` (typecheck, then `pnpm -r run build`). The API
  bundles with esbuild via `artifacts/api-server/build.mjs` (ESM output to
  `dist/`); the frontend builds with Vite.

Codegen and data:

- Regenerate API hooks and Zod schemas:
  `pnpm --filter @workspace/api-spec run codegen`.
- Push DB schema changes (dev only): `pnpm --filter @workspace/db run push`.
- Seed users, initial RM prices, and customers:
  `pnpm --filter @workspace/scripts run seed`.

Required environment (enforced at runtime):

- `DATABASE_URL` — PostgreSQL connection string (required by `lib/db/src/index.ts`).
- `PORT` — provided by the workflow for the API server (required by
  `artifacts/api-server/src/index.ts`).

`SESSION_SECRET` is present as a project secret but is not currently read by the
application code; session tokens are random values stored in the `sessions`
table.

Deployment: the suite deploys behind the shared path-based reverse proxy, with
the API on `/api` and the frontend on `/`. Use the Replit deployment workflow to
publish; published apps are served over HTTPS on the configured domains.

## 11. Pointers

- `replit.md` — project overview, user preferences, allowed users, and gotchas.
- The `pnpm-workspace` skill — workspace structure, TypeScript project
  references, codegen conventions, and proxy routing.
