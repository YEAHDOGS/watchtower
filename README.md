# Watchtower

Uptime + e2e monitor for **every live YEAHDOGS website**. No hardcoded site list:
each run discovers the org's repos via the GitHub API and monitors everything
with GitHub Pages enabled. New site appears? It's monitored within 30 minutes.
Repo deleted or Pages disabled? It drops off the dashboard automatically.

## How it works

- **Discovery** (`checks/lib/sites.mjs`): lists YEAHDOGS repos, keeps those with
  Pages enabled. `sites.yaml` is only an *overrides* file — custom content
  checks, e2e selectors, friendly names, or `skip: true`. Repos with no override
  get defaults: HTTP 200 + serves HTML + `body` visible in e2e.
- **HTTP checks** (`node checks/http-check.mjs`): status code + required content
  string, with one retry. Runs every **30 minutes** via GitHub Actions.
- **E2E** (`npx playwright test`): per-site smoke — page loads, expected HTTP
  status, key selector visible, zero JS page errors, screenshot archived.
  Runs **daily at 06:00 UTC** via GitHub Actions.
- **State** (`state.json`): per-site up/down, derived from per-check slots. A
  site is DOWN if any check that has run is failing. A check that hasn't run
  yet never fails a site.
- **Dashboard**: merged into [DOGS Mission Control](https://yeahdogs.github.io/dashboard/),
  which renders every YEAHDOGS repo with its live Watchtower status.
  `status.json` is still published here every run (that is the feed the
  dashboard consumes); this repo's own Pages site now just redirects to the
  dashboard. `STATUS.md` is the same data in markdown.

## Alerting (anti-spam by design)

- A GitHub issue `[watchtower] DOWN: <site>` opens **only** on an UP→DOWN
  transition. One open issue per site, ever — never re-notified while it stays
  down, no "still down" chatter.
- On recovery: one comment + auto-close.
- The first time a site is ever seen, its state is recorded **silently**
  (baseline) — no alert for something that was already down.
- GitHub's own issue notifications are the alert channel (they email per your
  GitHub notification settings). There is deliberately no SMTP email path:
  literal email to brando@wearedogs.net was not wired up — it needs mailbox
  credentials and would just duplicate GitHub notifications.

## Adding / tuning a site

Don't add sites — discovery handles it. To customize checks, add an override
to `sites.yaml`:

```yaml
overrides:
  myrepo:
    expect_content: "Welcome to My Site"
    e2e_selector: "#hero"
    name: "My Friendly Name"
    skip: true   # exclude this repo from monitoring entirely
```

## Local use

```bash
npm test              # unit tests (node --test, no deps)
GH_TOKEN=<token> node checks/http-check.mjs        # discovery + HTTP checks
DRY_RUN=1 GH_TOKEN=<token> node checks/http-check.mjs  # no issue changes
```

`GH_TOKEN` needs repo read for the YEAHDOGS org (a classic PAT or
`secrets.GITHUB_TOKEN` in Actions).
