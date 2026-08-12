# Fix Production Errors with Cursor Automations (Webhook-Triggered)

This guide explains how to implement a **webhook-triggered Cursor Automation** to automatically triage and fix production errors. The automation receives incident data via webhook, applies fixes in the cloud, and opens a pull request—without running GitHub Actions or maintaining a relay worker.

## When to Use This Approach

| Use Cursor Automations when… | Prefer GitHub Actions Agent when… |
|-----------------------------|-----------------------------------|
| You want fully automatic fix + PR with minimal infra | You need automated tests before the PR (GitHub Actions runs `bundle exec rspec`) |
| You're okay with tests running only in CI after the PR is opened | You want tests to run before the PR is created |
| You want to avoid maintaining a relay worker and GitHub Actions workflow | You need full control over the pipeline or local debugging |
| You already have event pipelines (AppSignal, PagerDuty, etc.) that can POST webhooks | You need the richest possible context (full AppSignal API, local DB) |

**Trade-off:** Cursor Automations do **not** run unit tests as part of the run. Quality is enforced by CI when the PR is opened, not before.

---

## Overview

```
AppSignal (or similar) webhook
    |
    v
POST to Cursor Automation webhook URL
    |
    v
Cursor cloud agent
    |-- Reads incident data from webhook body
    |-- Applies fix using codebase context
    |-- Opens PR via "Open pull request" tool
    |-- Notifies Slack via "Send to Slack" tool
    v
CI runs tests on the PR
```

---

## Prerequisites

- **Cursor account** with Automations access (Team or Business plan)
- **GitHub integration** connected to Cursor (for opening PRs)
- **Slack integration** (optional, for notifications)
- **AppSignal** (or another error monitor that can send webhooks)

---

## Step 1: Create the Automation

1. Go to [cursor.com/automations](https://cursor.com/automations).
2. Click **Create automation** (or start from a template).
3. Give it a name, e.g. `Fix production errors`.

---

## Step 2: Add a Webhook Trigger

1. Under **Triggers**, add a **Webhook** trigger.
2. **Save the automation** (required before the webhook URL is generated).
3. After saving, copy:
   - **Webhook URL** — the HTTP endpoint to POST to
   - **API key** — used in the `Authorization` header for authentication

For webhook triggers, you must choose the **repository** and **branch** the agent will work against (e.g. `main` or `develop`). The agent will create a new branch from this base when opening a PR.

---

## Step 3: Enable Tools

Enable these tools in the automation:

| Tool | Purpose |
|------|---------|
| **Open pull request** | Lets the agent create a branch, commit changes, and open a PR |
| **Send to Slack** | Lets the agent post fix results or status to a Slack channel |

Optional:

- **MCP server** — Connect the AppSignal MCP for richer incident context (stack traces, metadata).
- **Read Slack channels** — If the agent needs to read messages for context.

---

## Step 4: Configure the Environment

In the automation settings:

- **Environment: Enabled** — If the agent needs to install dependencies (e.g. `bundle install`) to understand or modify the codebase.
- **Environment: Disabled** — If the agent only needs to read and edit code without running builds.

Note: Even with Environment enabled, Cursor Automations do **not** run your unit tests as part of the run. Tests will run in CI when the PR is opened.

---

## Step 5: Write the Prompt

The prompt tells the agent what to do with the incident data. Reference the webhook body and the tools you enabled.

### Example prompt

```markdown
You are triaging a production error. The webhook body contains incident data.

## Your task

1. Parse the incident from the webhook body. Look for:
   - exception class and message
   - action/controller and method
   - backtrace (app_backtrace or backtrace)
   - incident id (if present)

2. Locate the affected file and line from the backtrace.

3. Analyze the error and propose a fix. Apply the fix in the codebase.

4. Open a pull request with a clear title and description. Include:
   - Link to the incident (if you have an AppSignal URL)
   - Summary of the fix
   - Any caveats or follow-ups

5. Send a message to Slack (channel: #your-errors or as configured) with:
   - Incident summary
   - Link to the PR
   - Whether the fix was applied or skipped (and why)

## Constraints

- Only change files related to the error. Do not refactor unrelated code.
- If the error is unclear or the fix is risky, open a PR with a proposed fix and note that it needs review.
- If you cannot determine a safe fix, do not open a PR; instead post to Slack explaining why.
```

### Passing context via the webhook body

The agent receives whatever you send in the POST body. Structure it so the agent can parse it easily. Example payload:

```json
{
  "incident_id": "47",
  "exception": "Pagy::VariableError",
  "message": "expected :page >= 1; got 0",
  "action": "StoriesController#index",
  "app_backtrace": [
    "app/controllers/stories_controller.rb:22 in index"
  ],
  "first_backtrace_line": "app/controllers/stories_controller.rb:22 in index",
  "appsignal_url": "https://appsignal.com/..."
}
```

---

## Step 6: Wire the Webhook

Configure AppSignal to POST directly to the Cursor Automation webhook when an incident occurs:

1. In AppSignal: **Notifications > Add integration > Webhook**
2. Set the URL to your Cursor Automation webhook URL
3. Add a header: `Authorization: Bearer <your-automation-api-key>`
4. Enable **Exception incidents**

Check AppSignal's webhook format. If it differs from your prompt's expectations, align your prompt's expectations with the payload structure (see "Passing context via the webhook body" above).

---

## Step 7: Configure Secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| Cursor webhook URL | AppSignal webhook config | Where to POST incident data |
| Cursor automation API key | AppSignal webhook config | `Authorization: Bearer <key>` header |

Store the API key securely; AppSignal stores it as part of the webhook integration configuration.

---

## Step 8: Add a Safety Policy (Optional)

If your project has an `agent_policy.yml` or similar, include its constraints in the prompt so the agent respects path limits, max files changed, etc. Example:

```markdown
## Policy (from config/agent_policy.yml)

- allowed_paths: app/, lib/, config/
- forbidden_paths: db/migrate/, spec/
- max_files_changed: 5
- max_lines_changed: 50
```

---

## Quality Assurance

Because the automation does **not** run tests:

1. **Rely on CI** — Ensure your repo runs tests on every PR (e.g. GitHub Actions on `pull_request`).
2. **Draft PRs** — Consider having the agent open draft PRs so a human can run tests locally before marking ready.
3. **Review before merge** — Treat automation PRs like any other; require review before merging.
4. **Slack notifications** — Use "Send to Slack" so the team sees when a fix was attempted and can follow up.

---

## Billing and Permissions

- **Billing:** Automations use cloud agent usage. Team Owned → team pool; Private/Team Visible → creator.
- **Identity:** Team-scoped automations open PRs as `cursor`; private automations use your GitHub account.
- **Model:** Choose the model in the automation settings (Claude, GPT, etc.).

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Webhook not firing | Verify URL and API key; ensure `Authorization: Bearer <key>` is set |
| Agent doesn't understand incident | Inspect webhook body format; align with what the prompt expects |
| PR not opened | Ensure "Open pull request" is enabled; repo/branch are set for the webhook trigger |
| No Slack message | Ensure "Send to Slack" is enabled; channel is accessible to the Cursor bot |
| Fix is wrong | Refine the prompt; add policy constraints; consider manual Cursor for complex incidents |

---

## Summary

1. Create a Cursor Automation with a webhook trigger.
2. Enable **Open pull request** and **Send to Slack**.
3. Write a prompt that parses the webhook body and applies fixes.
4. Wire AppSignal to POST incident data to the webhook URL with the API key.
5. Rely on CI to run tests when the PR is opened.
6. Review and merge automation PRs like any other.

For automatic triage **with** tests before the PR, use the [GitHub Actions Agent approach](../2-github-actions-agent/system-overview.md) instead.
