# Automatic Agentic Production Errors Resolver — System Overview

This document describes the end-to-end system that an AI agent creates when following the implementation instructions. Use it to understand what you get, how it works, and what you need to provide.

---

## What This System Does

When a production error occurs, the system automatically:

1. **Receives** the error from your monitoring tool (AppSignal, Rollbar, Sentry, etc.)
2. **Triggers** a GitHub Actions workflow (or equivalent CI job)
3. **Runs** an AI agent that reads the error, finds the affected code, and applies a minimal fix
4. **Runs your test suite** on the changed files
5. **Commits** the fix to a branch and **opens a draft PR**
6. **Notifies** your team in Slack when a fix is ready for review

You review the PR, run any extra checks you want, and merge when satisfied. No manual triage for straightforward bugs.

---

## Features

| Feature | Description |
|---------|-------------|
| **Automatic trigger** | Every production error (or exception incident) from your monitoring tool kicks off the pipeline. No manual step to start it. |
| **Minimal, safe fixes** | The agent prefers simple changes: nil guards, type checks, edge-case handling. It does not touch auth, payments, or sensitive user-model logic. |
| **Policy constraints** | A config file (`agent_policy.yml`) limits which paths the agent can modify, how many files and lines it can change, and which error categories it skips. |
| **Tests before PR** | The agent runs your test command (e.g. `bundle exec rspec`, `npm test`) on the changed specs. If tests fail, it may retry once with a small fix. |
| **Draft PRs** | All PRs are created as drafts. You decide when to mark them ready for review or merge. |
| **Slack notification** | When a fix is applied, the agent posts to a Slack channel with the PR title, a short explanation, and the incident link. |
| **Manual runs** | You can trigger the workflow manually with a test payload (e.g. from the Actions UI) to try it without a real incident. |
| **Skip when blocked** | If the agent can't fix (no app/lib path in backtrace, policy violation, or sensitive area), it reports that and does not open a PR. |

---

## How It Works

### End-to-end flow

```
Production error occurs
        │
        ▼
Monitoring tool (AppSignal/Rollbar/Sentry) sends webhook
        │
        ▼
Relay receives webhook, forwards to GitHub repository_dispatch
        │
        ▼
GitHub Actions workflow starts
        │
        ├── Checkout repo
        ├── Setup runtime (Ruby/Node/etc.) and test DB
        ├── Prepare context: normalize webhook → JSON file + incident id
        ├── Create branch agent-fix/<monitoring>-<id>
        ├── Install Cursor CLI
        └── Run Cursor agent
                │
                ├── Read error JSON, extract affected file from backtrace
                ├── Read agent_policy.yml (allowed/forbidden paths, limits)
                ├── Apply minimal fix (or skip if auth/payments/sensitive)
                ├── Run tests on changed specs
                ├── Commit, push, open draft PR
                └── POST to Slack
        │
        ▼
You get a draft PR + Slack message → review → merge
```

### Components

| Component | Purpose |
|-----------|---------|
| **Webhook relay** | Receives POST from your monitoring tool and calls GitHub's `repository_dispatch` API. Needed because GitHub Actions cannot receive webhooks directly from third parties. Can be skipped if your CI accepts webhooks directly (e.g. GitLab, Jenkins). |
| **Context preparation script** | Parses the raw webhook payload, normalizes it to a common shape (incident id, exception, message, backtrace), and writes a JSON file the agent reads. |
| **Agent prompt** | Step-by-step instructions for the agent: load context, apply fix, run tests, commit, push, open PR, notify Slack. |
| **Agent policy** | YAML config that defines allowed/forbidden paths, max files/lines, and categories the agent must not fix. |
| **GitHub Actions workflow** | Orchestrates checkout, setup, context prep, branch creation, Cursor CLI install, and agent run. |

---

## What You Need to Provide

### 1. Secrets

| Secret | Where | How to get it |
|-------|-------|---------------|
| **CURSOR_API_KEY** | GitHub repo secrets | Cursor → Settings → API keys. Used so the workflow can run the Cursor CLI agent without interactive login. |
| **SLACK_WEBHOOK_URL** | GitHub repo secrets | Slack → Your app → Incoming Webhooks → Add webhook to workspace → Copy URL. |
| **GITHUB_PAT** | Relay (e.g. Cloudflare Worker) | GitHub → Settings → Developer settings → Personal access tokens. Needs `repo` and `workflow` scope. |
| **GITHUB_REPO** | Relay | Your repo in `org/repo` format (e.g. `acme/my-app`). |
| **APPSIGNAL_WEBHOOK_TOKEN** (or equivalent) | Relay | Optional. From your monitoring tool's webhook settings. Used to verify that webhooks are genuine. |

### 2. Monitoring webhook configuration

In AppSignal, Rollbar, or Sentry:

- Add a **webhook** integration.
- Set the URL to your relay's endpoint (or your CI's webhook URL if you skip the relay).
- Enable **exception** or **error** events (not deploy or performance only).

### 3. A Slack channel

Create a channel (e.g. `#agent-fixes`) and add the incoming webhook to it. The agent will post there when a fix is ready.

### 4. Access and permissions

- **GitHub:** Admin or Maintainer on the repo (to add secrets and approve workflow runs).
- **Slack:** Permission to create an app and add incoming webhooks.
- **Relay (if used):** Access to deploy the worker (e.g. Cloudflare account, or equivalent for Lambda/Vercel).

---

## What the Agent Will Not Do

- **No auth/payment fixes** — Skips errors that clearly involve authentication, payments (e.g. Stripe, Plaid), or sensitive user-model changes.
- **No config/migration changes** — Policy forbids touching `config/`, `db/migrate/`, `Gemfile`, etc.
- **No blind fixes** — If the backtrace has no path under `app/`, `lib/`, or `src/`, the agent stops and reports that it cannot fix.
- **No push without tests** — If tests fail after a retry, the agent does not push or open a PR.

---

## After a Fix Is Applied

1. **Slack** — You get a message with the PR title, a one-line explanation, and the incident id.
2. **GitHub** — A draft PR is open with the `agent-fix` label.
3. **Review** — Read the diff, re-run tests locally if you want, and do any manual checks.
4. **Merge** — When satisfied, mark the PR ready for review and merge, or ask the agent to push more changes on the same branch.

---

## Manual testing

You can run the workflow without a real incident:

1. Go to **Actions** → select the agent-triage workflow.
2. Click **Run workflow**.
3. Paste a sample payload in the `client_payload_json` input (see the implementation instructions for the expected shape).
4. The workflow will run as if it had received a webhook.

Use this to verify setup before relying on real incidents.

---

## Implementation

For AI agents or developers implementing this system, see [implementation-instructions.md](implementation-instructions.md).
