// HTTP check runner: discovers every live YEAHDOGS site from the org API,
// checks each one, updates state and alerts ONLY on transitions.
// GH_TOKEN is required (org discovery + issue alerts).
// DRY_RUN=1 runs discovery + checks but never touches issues.
import { loadSites } from "./lib/sites.mjs";
import { checkHttp } from "./lib/http.mjs";
import { updateAndAlert } from "./lib/run.mjs";

const rootDir = new URL("..", import.meta.url).pathname;
const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN is required (org discovery + alerts).");
  process.exit(2);
}
const dryRun = process.env.DRY_RUN === "1";
if (dryRun) console.log("DRY_RUN=1: discovery + checks run, issues will not be touched.");

const sites = await loadSites(rootDir, token);
console.log(`discovered ${sites.length} live site(s) in the YEAHDOGS org`);
const nowIso = new Date().toISOString();

const results = {};
for (const site of sites) {
  const r = await checkHttp(site);
  results[site.name] = { http: { ok: r.ok, detail: r.detail, ms: r.ms } };
  console.log(`${r.ok ? "UP  " : "DOWN"} ${site.name} (${r.ms}ms) ${r.detail}`);
}

const { events } = await updateAndAlert({ sites, rootDir, results, nowIso, dryRun });
console.log(`done: ${events.length} transition(s), state.json + STATUS.md + status.json written`);
