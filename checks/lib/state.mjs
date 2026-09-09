// Watchtower state: per-site up/down derived from per-check-type results.
// A site is DOWN if any check that has ever run for it is failing.
// Alerts fire ONLY on state transitions (up->down, down->up). The very first
// observation of a site is a silent baseline: recorded, never alerted.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const CHECK_TYPES = ["http", "e2e"];

export function loadState(rootDir) {
  const p = join(rootDir, "state.json");
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf8"));
}

export function saveState(rootDir, state) {
  writeFileSync(join(rootDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

// results: { [siteName]: { http?: {ok, detail}, e2e?: {ok, detail} } }
// A check type absent from results keeps its previous slot (checks run on
// different schedules; never fail a site for a check that didn't run).
export function computeTransitions(sites, prevState, results, nowIso) {
  const nextState = {};
  const events = [];
  for (const site of sites) {
    const prev = prevState[site.name];
    const prevChecks = (prev && prev.checks) || {};
    const incoming = results[site.name] || {};
    const checks = {};
    for (const t of CHECK_TYPES) {
      if (incoming[t]) checks[t] = { ...incoming[t], at: nowIso };
      else if (prevChecks[t]) checks[t] = prevChecks[t];
    }
    const ran = Object.values(checks);
    const failing = Object.entries(checks)
      .filter(([, r]) => !r.ok)
      .map(([t, r]) => ({ type: t, detail: r.detail }));
    // No check has ever run: treat as unknown-but-not-down; baseline only.
    const status = ran.length === 0 || failing.length === 0 ? "up" : "down";
    const entry = {
      status,
      since: prev && prev.status === status ? prev.since : nowIso,
      lastCheck: nowIso,
      checks,
      failing,
    };
    nextState[site.name] = entry;
    if (!prev) continue; // silent baseline
    if (prev.status === "up" && status === "down") {
      events.push({ type: "down", site, detail: failing.map((f) => `${f.type}: ${f.detail}`).join(" | ") });
    } else if (prev.status === "down" && status === "up") {
      events.push({ type: "recovered", site, detail: "all checks passing" });
    }
  }
  return { nextState, events };
}
