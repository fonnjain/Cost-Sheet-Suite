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

A separate admin lock toggles ALL RM file inputs (daily + twice-monthly) + saving off for the current day; auto-reopens next day. Do NOT conflate with the twice-monthly window override — they are independent flags (`isDailyLocked` vs `isWindowOverride`/`isWindowUnlocked`).

**Design:** append-only `rm_daily_locks` table; latest row wins. Lock = insert `lockedDate = today`; unlock = insert `lockedDate = null`. `isDailyLocked = latest && latest.lockedDate === todayKey()`. Auto-reopen is free because yesterday's date != today.

**Why date-keyed instead of a boolean:** a stored boolean would not auto-expire; the date comparison gives "opens next day" with no scheduled job.

**How to apply:** enforce the lock server-side (403 on `POST /rm-prices`), not just by disabling UI inputs. `todayKey()` uses server LOCAL date components to stay consistent with `isTwiceMonthlyWindow()` (also local `getDate()`).
