# Production Error Fixing — Approaches

This folder documents approaches for triaging and fixing production errors with AI agents.

| Approach | Description | When to Use |
|----------|-------------|-------------|
| **[1. Cursor Automations](1-cursor-automations/implementation-guide.md)** | Webhook-triggered Cursor cloud automation. AppSignal → Cursor webhook → agent fixes → opens PR. No tests before PR; CI runs on the PR. | Minimal infra; okay with tests only in CI after PR. |
| **[2. GitHub Actions Agent](2-github-actions-agent/system-overview.md)** | Webhook → relay → GitHub Actions → Cursor CLI agent. Runs tests *before* opening the PR, then commit, push, draft PR, Slack. | Need automated tests before PR; willing to run relay + workflow. |
| **[3. Local MCP Debugging](https://github.com/TelosLabs/claude-config/commands/triage-prod.md)** | Manual triage workflow run locally with MCP tools (AppSignal, Rollbar). Full control over debugging, stepping through fixes, and review before push. | Manual fixes; want full local control; MCP access to error sources. |
