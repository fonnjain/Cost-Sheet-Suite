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

Authentication is email-only against an allowlist — there are no passwords.

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

- `/login` — `src/pages/login.tsx`: email-only sign-in.
- `/` — `src/pages/home.tsx`: landing / step navigation.
- `/rm-prices` — `src/pages/rm-prices.tsx`: RM prices console (daily and
  twice-monthly panels, window lock, admin unlock).
- `/rm-data-variation` — `src/pages/rm-data-variation.tsx`: editable offset
  configuration for the 9 auto-populated billet and wire-rod cells (E9, F9,
  G9, I9, J9, K9, L9, D18, E18). Shows BASE | OFFSET (editable) | RESULT
  per cell; persists offsets to the `rm_offsets` table via `POST /api/rm-offsets`.
- `/calculator` — `src/pages/calculator.tsx`: project info, structure picker,
  full cost build-up, save quote.
- `/dashboard` — `src/pages/dashboard.tsx`: KPIs and charts.
- `/review` — `src/pages/review.tsx`: compare all revisions for a
  client + project; approve a revision; legacy-quote messaging.
- `/admin` — `src/pages/admin.tsx`: user management and twice-monthly window
  unlock (admin only).
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
  - `POST /api/auth/login` (no auth) — email lookup against the allowlist;
    issues a 30-day session token.
  - `POST /api/auth/logout` — deletes the session row matching the token
    resolved by the shared `extractToken` helper (`Authorization: Bearer
    <token>` first, `X-Session-Token` as a fallback). This is the same token the
    generated client sends, so a Bearer-authenticated logout now revokes the
    underlying session row immediately.
  - `GET /api/auth/me` — current user.
- `src/routes/users.ts` (admin only) — `GET/POST /api/users`,
  `PATCH/DELETE /api/users/:id`.
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
  `userName` to the request.
- `requireAdmin` requires `userRole === "admin"` (returns `403` otherwise).

## 6. Database schema (`lib/db`)

The Drizzle client is created in `lib/db/src/index.ts` from a `pg` pool using
`DATABASE_URL`; the schema is re-exported from `lib/db/src/schema/`. Tables:

- `users` (`schema/users.ts`): `id` (serial PK), `email` (unique), `name`,
  `role` (default `user`), `isActive` (default true), `createdAt`, `updatedAt`.
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
- `quotes` (`schema/quotes.ts`): `id` (serial PK), `customerId`, `customerName`
  (denormalized for query performance), `projectRef`, `revision` (default 0),
  `structureType`, `kvOption`, `quotePricePerMt`, `totalCost`, `steelPrice`,
  `zincPrice`, `inputs` (jsonb), `costBreakdown` (jsonb), `generatedByName`,
  `notes`, `approved` (default false), `approvedAt`, `approvedByName`, `legacy`
  (default false), `createdAt`.

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

- Email-only auth: no passwords. Login is an email lookup against an allowlist;
  a random 30-day session token is issued, stored in the `sessions` table, sent
  as `Authorization: Bearer <token>`, and persisted in `localStorage`.
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
   against the allowlist and returns a user plus a session token.
2. The frontend stores the token in `localStorage` (`vt_session_token`) and
   registers the token getter so the custom fetch mutator attaches
   `Authorization: Bearer <token>` to subsequent requests.
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
   │  POST /api/auth/login (email)  ─────────►  validate allowlist  ───────►  users
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
