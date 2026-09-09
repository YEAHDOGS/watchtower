// E2E report ingester: reads Playwright's JSON report, maps each
// `smoke: <site>` test to its site, and runs the shared transition/alert
// pipeline for the e2e check slot. Usage: node checks/e2e-report.mjs <report.json>
// GH_TOKEN is required (org discovery + alerts). DRY_RUN=1 skips issue changes.
import { readFileSync } from "node:fs";
import { loadSites } from "./lib/sites.mjs";
import { updateAndAlert } from "./lib/run.mjs";

const rootDir = new URL("..", import.meta.url).pathname;
const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN is required (org discovery + alerts).");
  process.exit(2);
}
const dryRun = process.env.DRY_RUN === "1";
if (dryRun) console.log("DRY_RUN=1: discovery + ingestion run, issues will not be touched.");

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("usage: node checks/e2e-report.mjs <playwright-json-report>");
  process.exit(2);
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));

const specs = [];
(function walk(node) {
  for (const s of node.suites || []) walk(s);
  for (const spec of node.specs || []) specs.push(spec);
})(report);

const results = {};
for (const spec of specs) {
  const m = /^smoke: (.+)$/.exec(spec.title);
  if (!m) continue;
  const detail = spec.ok
    ? "playwright smoke passed"
    : `playwright smoke failed: ${(spec.tests?.[0]?.results?.[0]?.error?.message || "see report").slice(0, 300)}`;
  results[m[1]] = { e2e: { ok: !!spec.ok, detail } };
  console.log(`${spec.ok ? "UP  " : "DOWN"} e2e ${m[1]}: ${detail}`);
}

const sites = await loadSites(rootDir, token);
console.log(`discovered ${sites.length} live site(s) in the YEAHDOGS org`);
const nowIso = new Date().toISOString();
const { events } = await updateAndAlert({ sites, rootDir, results, nowIso, dryRun });
console.log(`done: ${events.length} transition(s), state.json + STATUS.md + status.json written`);
