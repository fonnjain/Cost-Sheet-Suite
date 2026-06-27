---
name: RQ cache invalidation in cost-sheet
description: Why cost-sheet mutations must invalidate React Query caches, and how staleTime causes stale UI.
---

The cost-sheet `QueryClient` (in `artifacts/cost-sheet/src/App.tsx`) sets a 30-second `staleTime`. This means after a mutation, dependent queries keep serving cached data for up to 30s — and pages that mount within that window (or are already mounted) show the OLD state until a manual browser refresh.

**Rule:** every mutation whose result changes data shown elsewhere MUST call `queryClient.invalidateQueries({ queryKey: <generated helper>() })` for each affected query.

**Why:** a real user-reported bug — admin clicked "Unlock Window Today", but the RM Prices twice-monthly panel stayed locked (`isWindowUnlocked` derived from `useGetRmPrices`) until manual refresh. Root cause was the unlock mutation not invalidating the rm-prices cache.

**How to apply:**
- Use the generated query-key helpers (e.g. `getGetRmPricesQueryKey`, `getGetRmOffsetsQueryKey`) exported from `@workspace/api-client-react` — do not hand-write keys.
- Unlock window / save RM prices → invalidate `getGetRmPricesQueryKey()`.
- Save RM offsets → invalidate BOTH `getGetRmOffsetsQueryKey()` and `getGetRmPricesQueryKey()` (offsets feed RM-derived computations on the calculator and RM console).
- `invalidateQueries` both marks stale and refetches active queries, so a separate `refetch()` on the same key is redundant — pick one.

## RM window: effective vs override state

`GET /api/rm-prices` returns two distinct booleans:
- `isWindowUnlocked` — EFFECTIVE state: `isTwiceMonthlyWindow() (1st/16th) || stored override`.
- `isWindowOverride` — the RAW stored admin override flag, independent of the schedule.

**Rule:** the admin lock/unlock toggle MUST be driven by `isWindowOverride`, not `isWindowUnlocked`. Using the effective flag makes the button stick on "Lock Window" on the 1st/16th (schedule forces it open, so locking the override has no visible effect).

**Why:** real bug — on schedule days the toggle appeared broken because the effective flag was always true.

**How to apply:** schedule-open (`isWindowUnlocked && !isWindowOverride`) → disable the toggle, show "Open by Schedule". The toggle endpoint `POST /api/rm-prices/unlock-twice-monthly` takes an optional `{ unlocked: boolean }` body (defaults to true for backward compat) and sets the override on the latest snapshot.

## Daily RM lock (distinct from twice-monthly window)

The RM file (daily + twice-monthly inputs AND saving) auto-locks every day at 2:00 PM server-local time; only an admin can reopen it for the rest of that day. The schedule resets daily on its own. Independent of the twice-monthly window override — distinct flags (`isDailyLocked` vs `isWindowOverride`/`isWindowUnlocked`).

**Design:** schedule + directional override, mirroring the twice-monthly window pattern. Append-only `rm_daily_locks` table with `lockedDate text` + `locked boolean`; latest row wins. Effective state: if the latest row's `lockedDate === todayKey()` use its `locked` value (admin override for today, either direction); otherwise fall back to the schedule `isAfterAutoLockTime()` (`getHours() >= 14`). Every toggle writes `lockedDate = today` + the chosen `locked`, so an admin unlock counts only for today and the 2 PM auto-lock returns the next day.

**Why override-scoped-to-today:** an unscoped unlock would suppress the next day's auto-lock; tying the override to today's date key makes the schedule self-reset with no cron/scheduled job.

**How to apply:** enforce the lock server-side (403 on `POST /rm-prices`), not just by disabling UI inputs. Both `todayKey()` and the 2 PM check use server LOCAL time, consistent with `isTwiceMonthlyWindow()` (local `getDate()`) — if business timezone != server timezone, this is the single place to standardize.
