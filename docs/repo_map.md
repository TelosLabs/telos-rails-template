# Repo Map

Where things live and what they do.

## Directory Structure

| Directory | Purpose |
|---|---|
| `app/controllers/` | Thin controllers — instantiate services, handle responses |
| `app/controllers/concerns/` | Shared controller behavior (authentication, locale, etc.) |
| `app/models/` | Persistence, associations, validations, scopes |
| `app/models/concerns/` | Shared model behavior (extracted when 3+ methods are duplicated) |
| `app/services/` | Business logic — service objects with `call` or `save` |
| `app/policies/` | ActionPolicy authorization policies |
| `app/validators/` | Custom validator classes for complex validation logic |
| `app/views/` | ERB templates with Turbo Frames and Streams |
| `app/javascript/controllers/` | Stimulus controllers |
| `app/jobs/` | Background jobs — thin wrappers that delegate to services |
| `config/` | Rails configuration, routes, initializers |
| `config/locales/` | Shared i18n keys (navbar, flash, errors) |
| `config/locales/{feature}/` | Feature-specific i18n keys |
| `db/` | Migrations and schema (SQLite3) |
| `spec/` | RSpec tests — request specs, model specs, service specs |
| `docs/` | Project documentation (patterns, architecture, decisions) |
| `agent-tests/` | AI-powered E2E tests — Playwright + OpenAI agent (agent_e2e) |

## Key Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Agent entry point — tech stack, key rules, quick start |
| `Procfile.dev` | Process definitions for `bin/dev` |
| `.rubocop.yml` | Linting rules (Standard + Rails extensions) |
| `.rubycritic.yml` | Code quality thresholds (minimum score, paths) |
| `.rspec` | RSpec configuration |
| `docs/ci.md` | CI pipeline checks and remediation playbook |
| `docs/reusable.md` | Inventory of reusable abstractions |
| `config/routes.rb` | All application routes |
| `db/schema.rb` | Current database schema (auto-generated) |

## bin/ Scripts

| Script | When to Use |
|---|---|
| `bin/setup` | First time setup or after pulling new changes with migrations |
| `bin/dev` | Start the development server (web + CSS + jobs) |
| `bin/test` | Run tests — pass args for targeted runs: `bin/test spec/models/` |
| `bin/lint` | Check code style + security before committing |
| `bin/ci` | Full local CI — run before pushing to confirm everything passes |
| `bin/smoke` | Quick sanity check — app boots, DB connects, routes load |
| `bin/e2e` | Run AI-powered E2E tests (boots server, runs agent, cleans up) |
