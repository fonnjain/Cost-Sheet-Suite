---
name: Usage audit privacy
description: Privacy and interpretation rules for the in-app usage audit.
---

Usage auditing must remain limited to authenticated session lifecycle, route visits, generated quote identities, report-export counts, and bounded active/idle heartbeat estimates. Do not record raw session tokens, query strings, form values, keystrokes, pointer coordinates, screen activity, clipboard contents, IP addresses, or device fingerprints.

**Why:** Administrators need operational evidence that the application is being used, but not invasive surveillance or a duplicate store of commercial quote inputs. Browser activity is inherently approximate and must not be presented as timekeeping evidence.

**How to apply:** New audit events should be allow-listed with minimal metadata. Keep event history append-only, aggregate duration only from capped heartbeats, and label all active/idle figures as estimates in admin-facing UI and exports.