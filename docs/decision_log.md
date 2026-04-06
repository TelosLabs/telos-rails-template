# Decision Log

Append-only. Add new decisions at the bottom.

## Format

```
### DEC-NNN: Title
**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded by DEC-NNN
**Context:** Why this decision was needed.
**Decision:** What was decided.
**Consequences:** What follows from this decision.
```

---

### DEC-001: SQLite3 as primary database
**Date:** 2026-02-24
**Status:** Accepted
**Context:** Rails 8 ships with solid defaults for SQLite3 including Solid Queue, Solid Cache, and Solid Cable. For MVP projects, PostgreSQL adds operational complexity without proportional benefit.
**Decision:** Use SQLite3 for all storage (application data, job queue, cache, Action Cable).
**Consequences:** Simpler deployment and development setup. No external database service needed. May need to migrate to PostgreSQL if the app requires advanced features (full-text search, JSONB operators, concurrent writes at scale).

### DEC-002: Hotwire-only frontend
**Date:** 2026-02-24
**Status:** Accepted
**Context:** The project needs interactive UIs but doesn't require the complexity of a full SPA framework. Hotwire (Turbo + Stimulus) provides server-rendered HTML with selective interactivity.
**Decision:** Use Turbo Frames, Turbo Streams, and Stimulus for all frontend interactivity. No React, Vue, or other JS frameworks.
**Consequences:** Faster initial development. Less client-side complexity. Server-side rendering by default. May need to reconsider for highly interactive features (complex drag-and-drop, real-time collaborative editing).

### DEC-003: ActionPolicy for authorization
**Date:** 2026-02-24
**Status:** Accepted
**Context:** Need a consistent authorization layer. Options considered: Pundit, CanCanCan, ActionPolicy.
**Decision:** Use ActionPolicy. It provides a clean DSL, better Rails integration, and built-in caching.
**Consequences:** All authorization logic lives in policy classes. Controllers use `authorize!`. Policies are testable in isolation.

### DEC-004: Service objects for business logic
**Date:** 2026-02-24
**Status:** Accepted
**Context:** Business logic needs a consistent home outside of controllers and models. Fat models and fat controllers both lead to maintenance problems.
**Decision:** All business logic goes in service objects in `app/services/`. Two patterns: `call` (returns data) and `save` (persists, returns boolean).
**Consequences:** Controllers stay thin. Models focus on persistence. Services are independently testable. New developers have a clear place to put logic.

### DEC-005: agent_e2e for AI-powered E2E testing
**Date:** 2026-03-11
**Status:** Superseded (2026-04-03) — replaced by agent-native browser tools (`/uiqa`, `/gstack-qa`, `/test-browser`) which leverage the coding agent's built-in Playwright/Chrome integration without requiring a separate gem or OpenAI API key.
**Context:** E2E tests were a placeholder ("Station C"). Traditional selector-based E2E tests are brittle and expensive to maintain. The agent_e2e gem uses an OpenAI agent to drive a real Chromium browser via Playwright, executing natural-language test cases.
**Decision:** ~~Use agent_e2e (TelosLabs/agent_e2e) for E2E testing.~~ Removed in favor of built-in agent browser tools.
**Consequences:** No additional gem dependency for E2E testing. Browser-based QA is handled by the agent's own tools at development time.
