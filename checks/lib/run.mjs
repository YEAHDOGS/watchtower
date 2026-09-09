// Shared pipeline: take check results -> compute transitions -> alert on
// transitions only -> persist state.json, status.json, STATUS.md.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeTransitions, saveState } from "./state.mjs";
import { findOpenDownIssue, openDownIssue, closeRecoveredIssue } from "./github.mjs";

export function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID) {
    return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
  }
  return "";
}

export function buildStatusJson(sites, state, nowIso) {
  return {
    generatedAt: nowIso,
    sites: sites.map((s) => {
      const st = state[s.name] || { status: "unknown", since: null, lastCheck: null, failing: [] };
      const httpMs = st.checks && st.checks.http && typeof st.checks.http.ms === "number"
        ? st.checks.http.ms
        : null;
      return {
        name: s.name,
        url: s.url,
        repo: s.repo,
        status: st.status,
        since: st.since,
        lastCheck: st.lastCheck,
        responseMs: httpMs,
        failing: (st.failing || []).map((f) => `${f.type}: ${f.detail}`),
      };
    }),
  };
}

export function buildStatusMd(sites, state, nowIso) {
  const rows = sites.map((s) => {
    const st = state[s.name] || { status: "unknown", since: "-", lastCheck: "-", failing: [] };
    const badge = st.status === "up" ? "🟢 UP" : st.status === "down" ? "🔴 DOWN" : "⚪ UNKNOWN";
    const failing = (st.failing || []).map((f) => f.type).join(", ") || "—";
    return `| ${s.name} | ${s.url} | ${badge} | ${st.since || "—"} | ${st.lastCheck || "—"} | ${failing} |`;
  });
  return [
    `# Watchtower status`,
    ``,
    `YEAHDOGS site monitor. Updated ${nowIso}.`,
    `Source: live discovery of the YEAHDOGS org — ${sites.length} site(s) with Pages enabled right now.`,
    ``,
    `| Site | URL | Status | Since | Last check | Failing checks |`,
    `|------|-----|--------|-------|------------|----------------|`,
    ...rows,
    ``,
    `Alerts: a GitHub issue opens only when a site goes from UP to DOWN, and auto-closes on recovery. No per-run emails, no repeat alerts while a site stays down.`,
    ``,
  ].join("\n");
}

export async function updateAndAlert({ sites, rootDir, results, nowIso, dryRun }) {
  const { loadState } = await import("./state.mjs");
  const prev = loadState(rootDir);
  const { nextState, events } = computeTransitions(sites, prev, results, nowIso);
  const prevNames = new Set(Object.keys(prev));
  const newNames = new Set(sites.map((s) => s.name));
  for (const n of [...prevNames].filter((x) => !newNames.has(x))) {
    console.log(`no longer monitored (repo deleted or Pages disabled): ${n}`);
  }
  for (const s of sites) {
    if (!prevNames.has(s.name)) console.log(`new site auto-discovered: ${s.name} (${s.url})`);
  }
  const url = runUrl();
  for (const ev of events) {
    if (ev.type === "down") {
      if (dryRun) {
        console.log(`[dry-run] would open DOWN issue for ${ev.site.name}: ${ev.detail}`);
        continue;
      }
      const existing = await findOpenDownIssue(ev.site.name);
      if (existing) {
        console.log(`DOWN ${ev.site.name}: issue #${existing.number} already open, not re-alerting`);
      } else {
        const issue = await openDownIssue(ev.site, ev.detail, url);
        console.log(`DOWN ${ev.site.name}: opened issue #${issue.number}`);
      }
    } else {
      if (dryRun) {
        console.log(`[dry-run] would close DOWN issue for ${ev.site.name} (recovered)`);
        continue;
      }
      const existing = await findOpenDownIssue(ev.site.name);
      if (existing) {
        await closeRecoveredIssue(existing.number, ev.site);
        console.log(`RECOVERED ${ev.site.name}: closed issue #${existing.number}`);
      } else {
        console.log(`RECOVERED ${ev.site.name}: no open issue found, nothing to close`);
      }
    }
  }
  saveState(rootDir, nextState);
  writeFileSync(join(rootDir, "status.json"), JSON.stringify(buildStatusJson(sites, nextState, nowIso), null, 2) + "\n");
  writeFileSync(join(rootDir, "STATUS.md"), buildStatusMd(sites, nextState, nowIso));
  return { nextState, events };
}
