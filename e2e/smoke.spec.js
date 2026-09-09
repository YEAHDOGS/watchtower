import { test, expect } from "@playwright/test";
import { loadSites } from "../checks/lib/sites.mjs";

// One smoke test per live YEAHDOGS site, discovered from the org API at run
// time: page loads (expected HTTP status), the key selector is visible, no JS
// page errors, screenshot archived.
const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN is required (org discovery)");
const sites = await loadSites(new URL("..", import.meta.url).pathname, token);

for (const site of sites) {
  test(`smoke: ${site.name}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e && e.message ? e.message : e)));
    const resp = await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    expect(resp && resp.status(), `HTTP status for ${site.url}`).toBe(site.expect_status);
    await expect(page.locator(site.e2e_selector).first()).toBeVisible({ timeout: 20000 });
    expect(errors, `JS page errors on ${site.name}`).toEqual([]);
    await page.screenshot({ path: `screenshots/${site.name}.png` });
  });
}
