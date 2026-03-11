# CI Pipeline

Run `bin/ci` locally before pushing. It runs the same checks as `.github/workflows/ci.yml` (except `importmap audit`, which only runs in GitHub Actions).

## Jobs

| Job | Tool | What It Checks |
|---|---|---|
| **Lint** | RuboCop | Code style, method/class size, complexity |
| **Security** | Brakeman + bundle-audit + importmap audit | Vulnerabilities in code and dependencies |
| **Test** | RSpec | Unit, request, and model specs |
| **E2E** | agent_e2e (Playwright + OpenAI) | AI-driven end-to-end browser tests |

## Fixing Failures

### RuboCop

**What it enforces:** Method length (max 10), class length (max 100), cyclomatic complexity (max 7), perceived complexity (max 8), ABC size (max 17), plus Standard/Shopify style rules.

**Common failures:**
- **Method too long** — Extract a private method. If the method does two things, it should be two methods.
- **Class too long** — Extract a concern (`app/models/concerns/`) or a service object (`app/services/`).
- **ABC/complexity too high** — Reduce branching. Replace conditionals with guard clauses or polymorphism.
- **Style violations** — Run `bundle exec rubocop -a` to auto-fix safe cops. Review changes before committing.

**Config:** `.rubocop.yml`

### RubyCritic

Runs locally via `bundle exec rubycritic`. Enforced when configured in CI. Minimum score: 85.

RubyCritic scores are driven by three tools:
1. **Flay** (duplication) — Detects structural similarity between code blocks. **This is the #1 score killer.** Two parallel features with copy-pasted models, services, or views will tank the score. Fix: extract shared behavior into concerns, base classes, or shared partials.
2. **Flog** (complexity) — Penalizes deeply nested conditionals, long methods, and ABC complexity. Fix: same as RuboCop complexity fixes.
3. **Reek** (code smells) — Catches feature envy, long parameter lists, data clumps, duplicate method calls. Fix: extract method, introduce parameter object, or move logic to the right class.

**Key insight:** If you're building a feature parallel to an existing one, **extract shared abstractions first** (concern, base service, shared partial). Cloning an entire model/service/view and modifying it creates duplication that Flay will catch, dragging the score below 85.

**Config:** `.rubycritic.yml` — paths, minimum_score, threshold_score.

### Brakeman

**What it catches:** SQL injection, XSS, mass assignment, command injection, file access, and other OWASP vulnerabilities. Runs with `-w3` (high-confidence warnings only).

**Common warnings:**
- **SQL injection** — Use parameterized queries or ActiveRecord methods, never string interpolation in `.where()`.
- **Mass assignment** — Use strong parameters (`params.expect()` per Telos convention). Never pass raw params to `.create` or `.update`.
- **Cross-site scripting** — Don't use `raw` or `html_safe` on user input. ERB auto-escapes by default — trust it.
- **Dynamic render path** — Don't pass user input to `render`. Use a whitelist of allowed templates.
- **File access** — Don't build file paths from user input. Use `ActiveStorage` for uploads.

**False positives:** If Brakeman flags something safe, add an ignore entry to `config/brakeman.ignore` with a note explaining why.

### bundle-audit

**What it catches:** Known CVEs in gem dependencies.

**Fix:** `bundle update <gem_name>` to patch the vulnerable gem. If no patch exists, check the advisory for workarounds or pin to a safe version.

### importmap audit

**What it catches:** Known vulnerabilities in JavaScript packages managed by importmap.

**Fix:** Update the pinned version in `config/importmap.rb`.

### RSpec

**Common failures:**
- **Missing test coverage** — Every public service method and controller action needs a spec.
- **Factory issues** — Check `spec/factories/` for missing or outdated factory definitions.
- **Database state** — Use `let` (lazy) and `before` blocks. Avoid `let!` unless ordering matters.

### E2E (agent_e2e)

**What it does:** An OpenAI agent drives a real Chromium browser via Playwright to execute natural-language test cases defined in `agent-tests/tests.md`. The agent reads the page, decides what to click/fill/navigate, and reports pass/fail.

**How it runs:** `bin/e2e` prepares the test database, seeds the QA user, compiles assets, boots a Rails server on port 3001, runs the agent, and cleans up.

**Common failures:**
- **Agent keeps failing on email confirmation** — Verify `letter_opener_web` is configured. Visit `http://localhost:3000/letter_opener` in development to check.
- **Tests time out** — Increase `MAX_STEPS` or `ACTION_TIMEOUT` in `.env`. Complex flows may need more steps.
- **Agent clicks wrong elements** — Add `data-testid` attributes to ambiguous UI elements.
- **Asset compilation issues** — Check that `bin/rails tailwindcss:build` runs successfully.

**Config:** Test cases in `agent-tests/tests.md`. Environment variables: `OPENAI_API_KEY`, `AI_MODEL` (default: gpt-5.1), `MAX_STEPS` (default: 25), `ACTION_TIMEOUT` (default: 8000ms).

**Requires:** `OPENAI_API_KEY` environment variable. In CI, this must be set as a repository secret.
