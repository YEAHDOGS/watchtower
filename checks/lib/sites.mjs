// Watchtower site inventory: DYNAMIC. The YEAHDOGS org API is the source of
// truth — every repo with GitHub Pages enabled is monitored, discovered fresh
// on every run. sites.yaml is only an overrides file (custom content checks,
// friendly names, skip flags), never the source of truth.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ORG = "YEAHDOGS";
const API = "https://api.github.com";

// Default content check for auto-discovered sites with no override: proves the
// URL actually serves an HTML page (not a 404 body, not an empty reply).
export const DEFAULT_EXPECT_CONTENT = "<html";
export const DEFAULT_E2E_SELECTOR = "body";

const OVERRIDE_KEYS = ["name", "expect_status", "expect_content", "e2e_selector", "skip"];

function coerce(raw) {
  const t = raw.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
}

export function parseOverridesYaml(text) {
  const overrides = {};
  let current = null;
  let inOverrides = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed === "overrides:") {
      inOverrides = true;
      continue;
    }
    if (!inOverrides) throw new Error(`watchtower yaml: expected "overrides:" first, got: ${trimmed}`);
    const repo = line.match(/^  ([A-Za-z0-9_.-]+):$/);
    if (repo) {
      current = {};
      overrides[repo[1]] = current;
      continue;
    }
    const kv = line.match(/^    ([A-Za-z0-9_]+):\s?(.*)$/);
    if (kv && current) {
      if (!OVERRIDE_KEYS.includes(kv[1])) throw new Error(`watchtower yaml: unknown override key "${kv[1]}"`);
      current[kv[1]] = coerce(kv[2]);
      continue;
    }
    throw new Error(`watchtower yaml: cannot parse line: ${line}`);
  }
  return overrides;
}

function nextLink(linkHeader) {
  if (!linkHeader) return null;
  const m = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
  return m ? m[1] : null;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, worker));
}

// Every repo in the org with GitHub Pages enabled. Returns
// [{ repo, url, customDomain }], sorted by repo name.
export async function discoverSites(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "watchtower",
  };
  const repos = [];
  let url = `${API}/orgs/${ORG}/repos?per_page=100`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`watchtower discovery: org repos returned HTTP ${res.status}`);
    repos.push(...(await res.json()));
    url = nextLink(res.headers.get("link"));
  }
  const found = [];
  await mapLimit(repos, 5, async (r) => {
    const pr = await fetch(`${API}/repos/${ORG}/${r.name}/pages`, { headers });
    if (pr.status === 200) {
      const p = await pr.json();
      let siteUrl = p.html_url || "";
      if (siteUrl.startsWith("http://")) siteUrl = "https://" + siteUrl.slice("http://".length);
      found.push({ repo: r.name, url: siteUrl, customDomain: p.cname || null });
    } else if (pr.status !== 404) {
      console.warn(`watchtower discovery: pages check for ${r.name} -> HTTP ${pr.status}`);
    }
  });
  return found.sort((a, b) => a.repo.localeCompare(b.repo));
}

// Merge discovery (what exists) with overrides (how to check it).
export function mergeInventory(discovered, overrides) {
  const sites = [];
  for (const d of discovered) {
    const o = overrides[d.repo] || {};
    if (o.skip) continue;
    sites.push({
      name: o.name || d.repo,
      repo: d.repo,
      url: d.url,
      customDomain: d.customDomain,
      expect_status: o.expect_status ?? 200,
      expect_content: o.expect_content ?? DEFAULT_EXPECT_CONTENT,
      e2e_selector: o.e2e_selector ?? DEFAULT_E2E_SELECTOR,
    });
  }
  return sites;
}

export async function loadSites(rootDir, token) {
  const p = join(rootDir, "sites.yaml");
  const overrides = existsSync(p) ? parseOverridesYaml(readFileSync(p, "utf8")) : {};
  const discovered = await discoverSites(token);
  return mergeInventory(discovered, overrides);
}
