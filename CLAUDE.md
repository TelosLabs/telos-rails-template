# Telos Rails Template

## Quick Start

```bash
bin/setup    # Install deps, prepare DB
bin/dev      # Start all processes
bin/test     # Run RSpec
bin/lint     # RuboCop + Brakeman + bundle-audit
bin/ci       # Full local CI → generates ci_summary.md
bin/smoke    # Quick boot + DB + routes check
```

## Navigation

Read `docs/repo_map.md` first — it maps every directory and file to its purpose.

- `docs/patterns.md` — Hotwire + backend conventions (quick reference)
- `docs/architecture.md` — System overview and request flow
- `docs/decision_log.md` — Append-only ADR log
- `docs/components.md` — UI component inventory
- `docs/ci.md` — CI pipeline checks and how to fix failures
- `docs/reusable.md` — Inventory of reusable abstractions (check before building new ones)

## Tech Stack

- Rails 8.1 with SQLite3
- Devise for authentication
- Hotwire (Turbo + Stimulus) — no other JS frameworks
- RSpec + FactoryBot for testing
- ActionPolicy for authorization
- Solid Queue for background jobs
- Tailwind CSS for styling

## Key Rules

- **Service objects** for all business logic (`app/services/`)
- **Thin controllers** — max 30-50 lines, delegate to services
- **Models** — persistence, associations, validations only. No business logic.
- **Turbo first** — use Turbo Frames/Streams instead of custom JS
- **Stimulus** — small, focused controllers for JS interactions
- **Request specs** preferred over system specs
- **Extract, don't clone** — When building a feature parallel to an existing one, extract shared behavior into concerns or base classes. Never copy-paste an entire model/service/view.
- **Check `docs/reusable.md` first** — Before writing a new service or concern, check for existing abstractions that can be reused or extended.

## Code Quality

- RuboCop with Standard (Shopify) — `bin/lint`
- Brakeman for security scanning
- bundle-audit for dependency vulnerabilities
- Rubycritic minimum score: 85
- Methods: 5-7 lines target, 10 max
- Classes: 100 lines max

## CI

Run `bin/ci` locally before pushing. CI runs: lint, security, code quality, test.

Every PR must pass all checks before merge. See `.github/PULL_REQUEST_TEMPLATE.md` for the merge checklist.
