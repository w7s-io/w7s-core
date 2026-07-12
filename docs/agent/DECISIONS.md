# W7S Core Agent Decisions

## 2026-07-12: Scanner Not-Found Bursts Do Not Suspend Apps

W7S records all routed requests as usage, including W7S-generated `not_found` 404 responses on mapped custom domains.

For short-window rate enforcement only, W7S suppresses app suspension for:

- `static_fallback`
- `not_found`

Rationale: these responses are cheap platform-generated outcomes commonly caused by external scanners. They should remain visible in telemetry and usage counters, but they should not make a customer app unavailable when no customer runtime work is being performed.

Non-rate policy enforcement and real app traffic remain suspendable.
