// GitHub issue alerting. Anti-spam contract:
// - ONE open issue per site, ever (checked before opening).
// - Open only on up->down transitions; never re-notify while down.
// - On recovery: one comment + close. No "still down" chatter.
const API = "https://api.github.com";
const OWNER = "YEAHDOGS";
const REPO = "watchtower";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "watchtower",
  };
}

export function downIssueTitle(siteName) {
  return `[watchtower] DOWN: ${siteName}`;
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function findOpenDownIssue(siteName) {
  const issues = await api(`/repos/${OWNER}/${REPO}/issues?state=open&labels=watchtower,site-down&per_page=100`);
  return issues.find((i) => i.title === downIssueTitle(siteName)) || null;
}

export async function openDownIssue(site, detail, runUrl) {
  const body = [
    `**${site.name}** is down.`,
    ``,
    `- URL: ${site.url}`,
    `- Repo: ${site.repo}`,
    `- Detected: ${new Date().toISOString()}`,
    `- Failing: ${detail}`,
    runUrl ? `- Run: ${runUrl}` : null,
    ``,
    `Watchtower will auto-close this issue when the site recovers. No action needed unless it stays red.`,
  ]
    .filter(Boolean)
    .join("\n");
  return api(`/repos/${OWNER}/${REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({ title: downIssueTitle(site.name), body, labels: ["watchtower", "site-down"] }),
  });
}

export async function closeRecoveredIssue(issueNumber, site) {
  await api(`/repos/${OWNER}/${REPO}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: `✅ **${site.name}** recovered at ${new Date().toISOString()} — all checks passing. Closing.` }),
  });
  return api(`/repos/${OWNER}/${REPO}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}
