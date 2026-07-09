# Vijay Transmission Cost Sheet Suite

A mobile-first internal costing tool for power transmission steel fabricators. Allows field engineers to enter raw material prices, build detailed cost sheets for 27 structure types, save quotes with auto-revision tracking, and review historical quotes by client/project.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at /api)
- `pnpm --filter @workspace/cost-sheet run dev` — run the React frontend (port 21194, proxied at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed users, initial RM prices, and 842 customers from CSV
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — session token (stored in secrets)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS + shadcn/ui + wouter routing
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Charts: Recharts
- Fonts: Sora (UI text), Space Mono (numbers/codes)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/db/src/schema/` — DB schema (users, customers, rm_prices, quotes, sessions)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — session auth middleware
- `artifacts/cost-sheet/src/pages/` — React pages (login, change-password, home, rm-prices, calculator, dashboard, review, admin)
- `GET /users/activity` (admin only) — per-user quote log (count + customer/project/revision/date), shown as the "User Quote Activity" card in the admin panel
- `artifacts/cost-sheet/src/components/rm-ratio-editor.tsx` — admin-only editor for the 11 structures' voltage-weighted RM price ratios (row-sum-to-100% validation, per-cell change log)
- `lib/db/src/schema/rm_ratios.ts`, `rm_ratio_history.ts` — current ratio values (unique per structureName+kv+category) and append-only change log
- `artifacts/api-server/src/routes/rm-ratios.ts` — `GET /rm-ratios` (any authenticated user, needed for quote calc), `POST /rm-ratios` + `GET /rm-ratios/history` (admin only)
- `artifacts/cost-sheet/src/lib/costCalculator.ts` — client-side cost calculation engine
- `artifacts/cost-sheet/src/lib/auth.ts` — session token management (localStorage + setAuthTokenGetter)
- `attached_assets/Clients_1780913725421.csv` — 844-client source CSV (seeded to DB)

## Architecture decisions

- **Email + password auth**: Email lookup against an allowlist plus a password. Every user starts on the default password `Vtpl@2026` (`password_hash` NULL in DB = still on default) and must change it on first logon (`must_change_password` flag). User-set passwords are bcrypt-hashed. The forced change is enforced server-side in `requireAuth` (only `/auth/change-password`, `/auth/logout`, `/auth/me` allowed while pending) and client-side via a `/change-password` page redirect. Session tokens stored in DB, sent as `Authorization: Bearer <token>` header. Token persisted in localStorage.
- **Twice-monthly window**: RM prices console has two panels. The twice-monthly panel (plates, coils) is locked unless today is 1st or 15th of the month, OR an admin has unlocked it explicitly via the admin panel.
- **Quote revisions**: Auto-increments per (customerId + projectRef) combination. First quote = Rev 0, subsequent saves = Rev 1, Rev 2, etc.
- **Client-side calculation**: The full cost build-up (steel → zinc → conversion → finance → contingency → credit → margin → quote price) is computed in the browser in real-time using `costCalculator.ts`. Only the final result + inputs are stored in the DB.
- **Admin-editable RM ratios**: The voltage-weighted RM price ratios (per structure+kv+category) for 11 structures are admin-editable via the admin panel, row-sum-to-100% validated, and logged per-cell (who/what/old→new/when) to `rm_ratio_history`. Seeded to the exact hardcoded `MASTER_SPECS` defaults, so nothing changes until an admin edits a value. Only the spec object fed into `calculateRMPrice` is overridden client-side — the engine and previously saved quotes are never touched, so this only affects new quotes going forward.
- **Contract-first API**: OpenAPI spec is the single source of truth. Always run codegen after spec changes.

## Product

Users flow through 4 steps: (1) Update RM prices console → (2) Enter project info + pick structure → (3) Configure full cost build-up → (4) Review and save quote. The Dashboard shows KPIs and charts. The Review page lets users compare all revisions for a client+project side-by-side.

## Allowed Users

- varunp, sambitm, rajeshnr, sundars, buntys, sanjayp, alokp, richap @vijaytransmission.com (role: user)
- ai-tools@vijaytransmission.com (role: admin) — full access + user management + window unlock

## User preferences

- Dark mode only (navy #0e1f33 background, red #e63329 accent)
- Sora font for UI text, Space Mono for numbers
- Mobile-first layout
- Indian locale number formatting (₹1,23,456)
- No emojis in the UI

## Gotchas

- The `customFetch` client sends auth as `Authorization: Bearer <token>` — do NOT use `X-Session-Token`
- After codegen, always run `pnpm run typecheck:libs` before checking artifact packages
- Quote inserts require `customerName` explicitly (denormalized for query performance)
- Admin email is `ai-tools@vijaytransmission.com` (lowercase, with hyphen)
- `@workspace/db/schema` exports need `pnpm run typecheck:libs` to rebuild after schema changes

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
