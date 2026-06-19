# Vijay Transmission Cost Sheet Suite — Architecture

A mobile-first internal costing tool for power transmission steel fabricators. Field
engineers enter raw-material prices, build detailed cost sheets for 27 structure types,
save quotes with automatic revision tracking, review historical quotes by client/project,
and mark the vendor-approved quote for an order.

---

## 1. High-level overview

The project is a **pnpm monorepo** containing multiple deployable *artifacts* and shared
*libraries*. Traffic is routed by path through a global reverse proxy:

- `/`     → React single-page app (the cost-sheet UI)
- `/api`  → Express REST API
- `/__mockup` → component preview server (design tooling, not part of the product)

```
Browser (mobile-first SPA)
        │  HTTPS, Authorization: Bearer <token>
        ▼
  Reverse proxy (path-based routing)
        │
   ┌────┴───────────────┐
   ▼                    ▼
React SPA (/)     Express API (/api)
                        │
                        ▼
                 PostgreSQL (Drizzle ORM)
```

The API contract is defined **OpenAPI-first**. React Query hooks and Zod validators are
generated from that single spec, so the client and server always share one source of truth.

---

## 2. Technology stack

| Layer            | Technology |
|------------------|------------|
| Monorepo         | pnpm workspaces, Node.js 24, TypeScript 5.9 |
| Frontend         | React 19, Vite, Tailwind CSS, shadcn/ui, wouter (routing), TanStack Query, Recharts |
| API              | Express 5 |
| Database         | PostgreSQL + Drizzle ORM |
| Validation       | Zod (`zod/v4`), `drizzle-zod` |
| API codegen      | Orval (generates hooks + Zod schemas from OpenAPI) |
| Build            | esbuild (API → CJS bundle), Vite (frontend) |
| Fonts            | Sora (UI text), Space Mono (numbers/codes) |

---

## 3. Repository layout

```
artifacts/
  cost-sheet/        React + Vite frontend (the product UI)
    src/pages/       login, home, rm-prices, calculator, dashboard, review, admin
    src/lib/         costCalculator.ts, pdfExport.ts, auth.ts, utils.ts
  api-server/        Express 5 REST API
    src/routes/      auth, customers, rm-prices, quotes, dashboard, users, health
    src/middlewares/ auth.ts (session + role guards)
  mockup-sandbox/    Component preview server (design tooling, not shipped)

lib/
  api-spec/          openapi.yaml — source-of-truth API contract + Orval config
  api-client-react/  generated React Query hooks + customFetch client
  api-zod/           generated Zod request/response schemas (used by the server)
  db/                Drizzle schema + DB client
    src/schema/      users, customers, rm_prices, quotes, sessions

scripts/             seed scripts (users, RM prices, customers from CSV)
```

**Dependency rule:** artifacts never import each other. Shared code lives in `lib/*`.
Libraries are composite TypeScript projects (emit declarations); artifacts are leaf
packages typechecked with `--noEmit`.

---

## 4. The contract-first API workflow

`lib/api-spec/openapi.yaml` is the single source of truth. The build flow is:

```
openapi.yaml
   │  pnpm --filter @workspace/api-spec run codegen   (Orval)
   ├──► lib/api-client-react   React Query hooks (useGetQuotesByProject, useApproveQuote, …)
   └──► lib/api-zod            Zod schemas (CreateQuoteBody, ApproveQuoteParams, …)
```

- The **server** imports the generated Zod schemas to validate every request input.
- The **client** imports the generated hooks; it never hand-writes fetch calls.
- After editing the spec, always run codegen, then `pnpm run typecheck:libs` before
  checking artifact packages.

---

## 5. Data model (PostgreSQL via Drizzle)

| Table        | Purpose |
|--------------|---------|
| `users`      | Allowlisted users (email, name, role: user/admin, isActive) |
| `sessions`   | Session tokens with expiry (Bearer auth) |
| `customers`  | 842 clients seeded from CSV |
| `rm_prices`  | Raw-material prices, including a twice-monthly locked panel |
| `quotes`     | Saved cost sheets with revision tracking and vendor approval |

**`quotes`** is the core table. Each saved cost sheet stores its full inputs and computed
breakdown as JSONB, plus denormalized fields for fast querying:

- `revision` — auto-increments per `(customerId, projectRef)`; first save is Rev 0.
- `quotePricePerMt`, `totalCost`, `steelPrice`, `zincPrice` — denormalized headline numbers.
- `inputs` / `costBreakdown` (JSONB) — the complete cost build-up snapshot.
- `approved`, `approvedAt`, `approvedByName` — the vendor-approved (finalized) revision.

---

## 6. Key architectural decisions

**Email-only authentication.** No passwords — login is an email lookup against the
allowlist. A session token is created in the DB and returned to the client, which stores
it in `localStorage` and sends it as `Authorization: Bearer <token>` on every request.
Server middleware (`middlewares/auth.ts`) validates the token and attaches the user;
a separate guard enforces the admin role.

**Client-side calculation.** The entire cost build-up (steel → zinc → conversion →
finance → contingency → credit → margin → quote price) is computed live in the browser by
`costCalculator.ts`. Only the final result plus the inputs are persisted, keeping the API
thin and the UI instantly responsive.

**Quote revisions.** Saving a quote for an existing `(customer, project)` pair
auto-increments the revision. The Review page compares every revision side by side and
highlights what changed between consecutive revisions.

**Twice-monthly RM price window.** The raw-material console has two panels. The
twice-monthly panel (plates, coils) is locked unless today is the 1st or 15th, or an admin
has explicitly unlocked it for the day.

**Vendor approval invariant.** At most one revision per `(customerId, projectRef)` may be
approved. The approve endpoint clears approval on sibling revisions and sets the target in
a **single database transaction**, so a project can never be left with zero approved
revisions. The UI validates the selected row against the loaded project before approving.

**PDF export.** PDFs are built from structured data with `jspdf` + `jspdf-autotable`
(not screenshot-based), avoiding theme-color rendering issues. Numbers use Indian grouping
with an "Rs" prefix because the PDF fonts cannot render the ₹ glyph.

---

## 7. Product flow

Users move through four steps, then review:

1. **Update RM prices** — enter current raw-material prices.
2. **Project + structure** — enter project/PO info and pick one of 27 structure types.
3. **Cost build-up** — configure the full costing in the calculator (live computation).
4. **Review & save** — save the quote (auto-revisioned).

Supporting surfaces: a **Dashboard** with KPIs and charts, a **Review** page to compare
revisions and mark the vendor-approved quote (with PDF export and a Save-to-Monday.com
hook), and an **Admin** page for user management and unlocking the price window.

---

## 8. Running & operating

| Command | Purpose |
|---------|---------|
| `pnpm --filter @workspace/api-server run dev` | Run the API (port 8080, proxied at `/api`) |
| `pnpm --filter @workspace/cost-sheet run dev` | Run the frontend (proxied at `/`) |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate hooks + Zod schemas from the spec |
| `pnpm --filter @workspace/db run push` | Push DB schema changes (dev only) |
| `pnpm --filter @workspace/scripts run seed` | Seed users, RM prices, and customers |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm run build` | Typecheck + build all packages |

**Required environment:** `DATABASE_URL` (Postgres connection string),
`SESSION_SECRET` (session token secret).

---

## 9. Design conventions

- Dark mode only — navy `#0e1f33` background, red `#e63329` accent.
- Sora for UI text, Space Mono for numbers and codes.
- Mobile-first layout.
- Indian locale number formatting (₹1,23,456).
- No emojis in the UI.
