# Automatic Agentic Production Errors Resolver — Implementation Instructions

**For AI agents:** Add an automated pipeline that receives production errors from a monitoring tool (AppSignal, Rollbar, etc.), runs an AI agent in GitHub Actions to diagnose and fix them, runs tests, and opens a draft PR with Slack notification. **You must inspect the target project first** and tailor every artifact to its stack, monitoring tool, and conventions.

---

## Goal

Implement an end-to-end system that:

1. **Receives** production error webhooks from a monitoring service (AppSignal, Rollbar, Sentry, etc.)
2. **Relays** the payload to GitHub via `repository_dispatch`
3. **Runs** a Cursor CLI agent in GitHub Actions that reads the error context, applies a minimal fix, runs tests, commits, pushes, and opens a draft PR
4. **Notifies** a Slack channel when a fix is ready for review

The agent must respect policy constraints (allowed/forbidden paths, max files/lines) and must not attempt fixes for auth, payments, or sensitive user-model changes. All artifacts must be tailored to the target project—there is no reference repo to copy from.

---

## Phase 0: Project discovery (required before any implementation)

Before creating any files, inspect the target project and record:

| What to discover | How | Notes |
|------------------|-----|-------|
| **Framework** | Look for `Gemfile`, `package.json`, `go.mod`, `Cargo.toml`, etc. | Determines test runner, DB setup, and prompt wording |
| **Test runner** | RSpec, Minitest, pytest, jest, go test, etc. | Agent must run the correct command |
| **Default branch** | `git branch` or `.github/` config | Use for `--base` in `gh pr create` |
| **Monitoring tool** | `config/appsignal.rb`, `config/rollbar.rb`, Sentry config, etc. | Determines webhook format and relay logic |
| **App name** | Config file for monitoring | For incident identifiers and prompts |
| **Source layout** | `app/`, `lib/`, `src/`, etc. | For `allowed_paths` and backtrace parsing |
| **CI setup** | `.github/workflows/`, `.gitlab-ci.yml`, etc. | Where to add the new workflow |
| **Runtime version** | `.ruby-version`, `Gemfile`, `package.json` engines | For setup steps in workflow |
| **DB setup** | `rails db:test:prepare`, `npm run db:test`, etc. | For CI step before agent runs |

**Output:** Write a short discovery summary (framework, tests, monitoring, branch, paths) and refer to it when creating artifacts.

---

## Phase 1: Agent policy

Create `scripts/agent/config/agent_policy.yml`:

```yaml
auto_fix:
  enabled: true
  max_files_changed: 3
  max_lines_changed: 50
  branch_prefix: "agent-fix/"
  pr_draft: true
  max_retries: 1
  required_confidence: 0.5

  allowed_paths:
    - app/models/
    - app/controllers/
    - app/services/
    - app/helpers/
    - app/views/
    - app/jobs/
    - app/mailers/
    - lib/
    - spec/

  forbidden_paths:
    - config/
    - db/migrate/
    - Gemfile

  not_fixable_categories:
    - race_condition
    - security
    - data_migration
```

**Tailor:** Adjust `allowed_paths` and `forbidden_paths` to the project layout (e.g. `src/`, `test/` for non-Rails). Add or remove categories in `not_fixable_categories`.

---

## Phase 2: Context preparation script

Create a script that reads webhook data from an env var, normalizes it, writes a JSON file for the agent, and writes the incident id to `.agent_incident`.

**Environment variable:** `APPSIGNAL_WEBHOOK_DATA` (or `ROLLBAR_WEBHOOK_DATA` / `MONITORING_WEBHOOK_DATA` for other tools).

**Output files:**
- `appsignal_webhook.json` (or `monitoring_webhook.json`) — normalized payload
- `.agent_incident` — incident id as a single line (for branch naming)

**Normalized shape:** The agent expects a JSON object with at least:
- `number` or `id` — incident identifier
- `exception` — exception class name
- `message` — error message
- `app_backtrace` or `backtrace` — array of strings (file:line in method)
- `first_backtrace_line` (optional) — first line under app/lib/src

**AppSignal webhook shape:** Top-level `exception` object with `number`, `exception`, `message`, `app_backtrace`. The inner `exception` may be nested; extract it.

**Ruby example** (save as `scripts/agent/triage/prepare_context.rb`):

```ruby
#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"

WEBHOOK_FILE = "appsignal_webhook.json"
INCIDENT_FILE = ".agent_incident"
ENV_VAR = "APPSIGNAL_WEBHOOK_DATA"

def normalize(data)
  return data unless data.is_a?(Hash)
  exc = data["exception"]
  if exc.is_a?(Hash) && exc.key?("number") && exc.key?("exception")
    return exc.transform_keys(&:to_s)
  end
  if exc.is_a?(Hash) && (exc["backtrace"] || exc["name"])
    backtrace = exc["backtrace"] || []
    first_app = backtrace.find { |l| l =~ %r{(?:app|lib|src)/} }
    return {
      "number" => data["id"] || data["number"],
      "exception" => exc["name"] || exc["exception"],
      "message" => exc["message"] || data["message"],
      "action" => data["action"],
      "app_backtrace" => backtrace,
      "first_backtrace_line" => first_app || backtrace.first
    }.compact.transform_keys(&:to_s)
  end
  data.transform_keys(&:to_s)
end

raw = JSON.parse(ENV.fetch(ENV_VAR))
webhook_data = normalize(raw)
incident_number = webhook_data["number"] || webhook_data["id"]

File.write(WEBHOOK_FILE, JSON.pretty_generate(webhook_data))
File.write(INCIDENT_FILE, incident_number.to_s)
puts "[prepare_context] Wrote #{WEBHOOK_FILE} and #{INCIDENT_FILE} for incident ##{incident_number}"
```

**For non-Ruby projects:** Implement equivalent logic in Node, Python, or the project's primary language. The script must run in CI without extra dependencies.

**Rollbar:** Rollbar webhooks use `data.item.counter`, `data.body.trace_chain`, etc. Normalize to the same shape (number/id, exception, message, app_backtrace).

---

## Phase 3: Agent prompt

Create `scripts/agent/prompts/cursor_fix.txt`. The prompt instructs the agent to load context, apply a fix, run tests, commit, push, open a PR, and notify Slack.

**Placeholders to replace from Phase 0:**
- `<PROJECT_DESCRIPTION>` — e.g. "a Rails 7.2 web app" or "a Node.js API"
- `<WEBHOOK_JSON_FILE>` — e.g. `appsignal_webhook.json` or `monitoring_webhook.json`
- `<MONITORING_NAME>` — e.g. AppSignal or Rollbar
- `<TEST_COMMAND>` — e.g. `bundle exec rspec` or `npm test` or `pytest`
- `<DEFAULT_BRANCH>` — e.g. `main` or `master`
- `<SOURCE_PATHS>` — e.g. `app/` or `lib/` or `src/` (for backtrace parsing)

**Full prompt template:**

```
You are a senior developer for <PROJECT_DESCRIPTION>. Follow these instructions exactly. Do not classify or ask for permission — attempt a minimal fix for the error, then run the post-process steps.

## 1. Load context (do this first)

- **Webhook:** Read `<WEBHOOK_JSON_FILE>` in this workspace. From it extract:
  - Incident number: `number` or `id`
  - Error title: `exception` and `message` (e.g. "ExceptionName: message")
  - Stack trace: `app_backtrace` (array of strings) or `backtrace`; format as "ExceptionName: message" then each line indented
  - **Affected file:** From the backtrace, pick the first line that contains a path under <SOURCE_PATHS> (e.g. "app/controllers/foo_controller.rb:22 in index" → file is `app/controllers/foo_controller.rb`)
- **Source:** Read the affected file from the repository (if no app/lib/src path in backtrace, do not attempt a fix and skip to step 2 with no changes).
- **Git history:** Run `git log -5 --oneline -- <affected_file>` and note recent commits.
- **Policy:** Read `scripts/agent/config/agent_policy.yml`. Use the `auto_fix` section: `allowed_paths`, `forbidden_paths`, `max_files_changed`, `max_lines_changed`. You MUST respect these constraints.

## 2. Fix

Identify the root cause from the stack trace and affected code, then apply the minimal code change that fixes it. Prefer simple, mechanical changes: nil guards, missing require, type checks, or edge-case handling. Change at most the number of files and lines allowed by the policy. Add or update a spec/test if the affected file has a corresponding spec under spec/ or test/.

Do NOT attempt a fix if the error clearly involves authentication, payments, or sensitive user model changes — in that case do not modify code and report no_changes in post-process.

## 3. Post-process

Run `git diff --name-only` to list modified files.

- If no files were modified: append to the file at `$GITHUB_OUTPUT` (from environment) the line: fix_status=no_changes
- If modified paths violate policy (not all under allowed_paths, or any under forbidden_paths, or count > max_files_changed): append fix_status=blocked and fix_reason=policy violation to that file.
- If valid: append to the file at `$GITHUB_OUTPUT` the following (one per line). For multiline values use GitHub Actions format: key<<EOF (newline) content (newline) EOF
  fix_status=applied
  modified_files=<space-separated paths>
  spec_files=<space-separated paths under spec/ or test/>
  pr_title=[Agent Fix] <error title, first line, max 80 chars>
  fix_explanation=<one-line explanation>
  pr_body<<GHAEOF
  <markdown: Auto-generated fix for <MONITORING_NAME> #<incident_number>. Error: <error title>. Fix: <your fix_explanation>. Please review.>
  GHAEOF

## 4. Tests

If spec_files is non-empty, run `<TEST_COMMAND> <spec_files> --format documentation` (or equivalent). If tests fail, you may attempt one more minimal fix and re-run the tests.

## 5. Commit and push

Run `git add -A`, `git commit -m "[Agent Fix] <MONITORING_NAME> #<incident_number>: <your fix_explanation>"`, `git push origin <current branch>`.

## 6. Open PR

Run `gh pr create --draft --title "[Agent Fix] <error title first line>" --body-file <(echo "<pr_body content>") --base <DEFAULT_BRANCH> --label agent-fix`. Use the GH_TOKEN from the environment.

## 7. Notify Slack

POST to the URL in SLACK_WEBHOOK_URL (from environment) with JSON body:
{"blocks":[{"type":"header","text":{"type":"plain_text","text":"Agent fix ready for review"}},{"type":"section","text":{"type":"mrkdwn","text":"*<pr_title>*\n<fix_explanation>\n\n<MONITORING_NAME> incident: #<incident_number>"}}]}

If you did not apply a fix (no changes or blocked), skip steps 4–7 and optionally notify Slack that no fix was applied.

Use the environment variables GH_TOKEN and SLACK_WEBHOOK_URL for the gh and curl commands.
```

---

## Phase 4: GitHub Actions workflow

Create `.github/workflows/agent-triage.yml`:

```yaml
name: Agent Triage

on:
  repository_dispatch:
    types: [appsignal-error]
  workflow_dispatch:
    inputs:
      ref:
        description: "Branch or ref to checkout (optional). Default: repo default branch."
        required: false
        type: string
      client_payload_json:
        description: "Optional: JSON with webhook_data key for manual run."
        required: false
        type: string

permissions:
  contents: write
  pull-requests: write
  actions: read

env:
  SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}

jobs:
  triage:
    name: Context prep & Cursor fix
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref || github.event.repository.default_branch || 'main' }}
          fetch-depth: 50

      - name: Setup runtime
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: .ruby-version
          bundler-cache: true

      - name: Setup DB
        run: bundle exec rails db:test:prepare

      - name: Prepare context for Cursor
        env:
          APPSIGNAL_WEBHOOK_DATA: ${{ github.event_name == 'workflow_dispatch' && inputs.client_payload_json != '' && fromJson(inputs.client_payload_json).webhook_data != null && toJson(fromJson(inputs.client_payload_json).webhook_data) || toJson(github.event.client_payload.webhook_data) }}
        run: ruby scripts/agent/triage/prepare_context.rb

      - name: Copy agent prompt
        run: cp scripts/agent/prompts/cursor_fix.txt agent_prompt.txt

      - name: Create fix branch
        run: |
          INCIDENT=$(cat .agent_incident)
          BRANCH="agent-fix/appsignal-${INCIDENT}"
          git checkout -b "$BRANCH"
          echo "BRANCH_NAME=$BRANCH" >> $GITHUB_ENV

      - name: Install Cursor CLI
        run: |
          curl -fsSL https://cursor.com/install | bash
          echo "$HOME/.cursor/bin" >> $GITHUB_PATH
          agent --version || true

      - name: Run Cursor Agent
        env:
          CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          export GITHUB_OUTPUT GH_TOKEN SLACK_WEBHOOK_URL
          agent -p --force --sandbox disabled --trust --workspace "$GITHUB_WORKSPACE" \
            --output-format stream-json \
            "Read and follow every instruction in ./agent_prompt.txt"
        timeout-minutes: 20
```

**Tailor:** Match `repository_dispatch.types` to relay, use correct test runner and DB setup command. For non-Rails projects, replace `ruby/setup-ruby` and `bundle exec rails db:test:prepare`.

---

## Phase 5: Webhook relay

**When to skip:** You can skip if (1) you don't use GitHub Actions, or (2) your CI accepts webhooks directly from AppSignal, Rollbar, or Sentry.

**When required:** GitHub Actions cannot receive external webhooks. Implement a relay (Cloudflare Worker, Lambda, etc.) that:
1. Receives POST from the monitoring tool
2. Validates the payload (e.g. has `exception` for AppSignal)
3. POSTs to `https://api.github.com/repos/{owner}/{repo}/dispatches` with `event_type: "appsignal-error"` and `client_payload: { webhook_data: <raw body> }`
4. Uses `Authorization: Bearer <GITHUB_PAT>` and `GITHUB_REPO` env

**Cloudflare Worker example** (save as `scripts/relay/worker.js`):

```javascript
const OK = () => new Response('ok', { status: 200 })
const fail = (msg) => new Response(JSON.stringify({ error: msg }), {
  status: 422,
  headers: { 'Content-Type': 'application/json' }
})

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return fail(`Rejected method: ${request.method}`)
    if (env.APPSIGNAL_WEBHOOK_TOKEN) {
      const sig = request.headers.get('X-Appsignal-Signature')?.trim()
      if (!sig) return fail('Missing X-Appsignal-Signature header')
    }
    let payload
    try { payload = JSON.parse(await request.text()) } catch (e) {
      return fail(`JSON parse error: ${e.message}`)
    }
    if (!payload.exception) return fail('No exception in payload')
    const dispatchPayload = {
      event_type: 'appsignal-error',
      client_payload: { webhook_data: payload }
    }
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'appsignal-relay-worker'
        },
        body: JSON.stringify(dispatchPayload)
      }
    )
    if (!res.ok) {
      const body = await res.text()
      return fail(`GitHub dispatch failed: ${res.status} - ${body || res.statusText}`)
    }
    return OK()
  }
}
```

**Wrangler config** (`scripts/relay/wrangler.toml`): `name = "appsignal-relay"`, `main = "worker.js"`, `compatibility_date = "2025-04-01"`. Deploy with `npx wrangler deploy` from `scripts/relay/`.

**Rollbar:** Change `payload.exception` check to Rollbar's structure (e.g. `payload.data`). Set `event_type: "rollbar-error"` to match the workflow.

---

## Phase 6: Secrets and configuration

**GitHub repository secrets:** CURSOR_API_KEY, SLACK_WEBHOOK_URL

**Relay secrets:** GITHUB_PAT (repo + workflow scope), GITHUB_REPO (org/repo), APPSIGNAL_WEBHOOK_TOKEN (optional)

**Monitoring:** Configure webhook URL in AppSignal/Rollbar/Sentry to point at relay. Enable exception events.

---

## Phase 7: Sample payload for manual testing

For `workflow_dispatch`, use `client_payload_json`:

```json
{
  "webhook_data": {
    "exception": {
      "number": 47,
      "exception": "SomeError",
      "message": "error description",
      "action": "Controller#action",
      "app_backtrace": ["app/controllers/example_controller.rb:22 in index"],
      "first_backtrace_line": "app/controllers/example_controller.rb:22 in index"
    }
  }
}
```

---

## Phase 8: Verification

1. **Manual run:** Trigger `workflow_dispatch` with sample `client_payload_json`. Confirm context prep, agent run, tests, commit, push, draft PR, Slack.
2. **Relay test:** Send test webhook to relay. Confirm workflow run is triggered.
3. **End-to-end:** Trigger real incident or use realistic payload. Confirm full flow.

---

## Tailoring checklist

- [ ] Framework and test runner in prompt and workflow match the project
- [ ] Default branch correct in `gh pr create --base` and `git diff`
- [ ] `allowed_paths` and `forbidden_paths` match project layout
- [ ] Webhook normalization handles monitoring tool's payload shape
- [ ] Relay `event_type` matches workflow `repository_dispatch` type
- [ ] App/project name in prompts and Slack messages correct
- [ ] Env var names consistent across workflow, context script, and relay
