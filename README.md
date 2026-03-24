# Telos Rails Template

Starting point for new Rails projects at Telos. Includes authentication, authorization, background jobs, and CI tooling out of the box, with conventions enforced through linting and code quality checks.

## Getting Started

```bash
git clone <repo-url>
cd telos-rails-template
bin/setup    # Install dependencies, prepare database
bin/dev      # Start all processes (server, CSS, JS)
```

The app runs at `http://localhost:3000` by default.

## Tech Stack

- **Rails 8.1** with SQLite3
- **Devise** for authentication
- **Hotwire** (Turbo + Stimulus) -- no other JS frameworks
- **RSpec + FactoryBot** for testing
- **ActionPolicy** for authorization
- **Solid Queue** for background jobs
- **Tailwind CSS** for styling

## Scripts

| Command      | Description                                      |
|--------------|--------------------------------------------------|
| `bin/setup`  | Install deps, prepare DB                         |
| `bin/dev`    | Start all processes                              |
| `bin/test`   | Run RSpec                                        |
| `bin/lint`   | RuboCop + Brakeman + bundle-audit                |
| `bin/ci`     | Full local CI -- generates `ci_summary.md`       |
| `bin/smoke`  | Quick boot + DB + routes check                   |

## Code Conventions

### Architecture

- **Service objects** for all business logic (`app/services/`).
- **Thin controllers** -- max 30-50 lines, delegate to services.
- **Models** -- persistence, associations, and validations only. No business logic.
- **Turbo first** -- use Turbo Frames and Streams instead of custom JS.
- **Stimulus** -- small, focused controllers for JS interactions.
- **Request specs** preferred over system specs.

### Code Quality Thresholds

- RuboCop with Standard (Shopify) rules
- Brakeman for security scanning
- bundle-audit for dependency vulnerabilities
- Rubycritic minimum score: 85
- Methods: 5-7 lines target, 10 lines max
- Classes: 100 lines max

See `docs/patterns.md` for detailed conventions.

## CI

Run `bin/ci` locally before pushing. It runs linting, security checks, code quality (RubyCritic), and tests, then generates a `ci_summary.md` report.

## Claude Code

The team uses a shared Claude Code configuration from the [claude-config](https://github.com/TelosLabs/claude-config) repo for AI-assisted development. This provides slash commands and tooling:

- `/plan` -- generate an implementation plan
- `/fix` -- diagnose and fix issues
- `/ship` -- prepare changes for review
- `/review` -- multi-pass code review

See the [claude-config README](https://github.com/TelosLabs/claude-config) for setup instructions.

## Worktrees

Use the `cw` command for parallel development in git worktrees. The `.worktree-symlinks` file configures which gitignored files (`.env`, `config/master.key`) get symlinked into new worktrees so the app can boot without extra setup.

## Documentation

The `docs/` directory contains project documentation:

- `docs/repo_map.md` -- project structure overview
- `docs/patterns.md` -- coding patterns and conventions
- `docs/architecture.md` -- system architecture
- `docs/decision_log.md` -- record of technical decisions
- `docs/components.md` -- UI component reference
