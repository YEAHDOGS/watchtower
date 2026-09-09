// HTTP uptime check: status code + required content string.
// Pure evaluation is separated from fetching so it can be unit-tested.

export function evaluateHttp(site, status, body, ms) {
  if (status !== site.expect_status) {
    return { ok: false, ms, detail: `HTTP ${status}, expected ${site.expect_status}` };
  }
  if (!body.includes(site.expect_content)) {
    return { ok: false, ms, detail: `HTTP ${status} but content check failed (missing "${site.expect_content}")` };
  }
  return { ok: true, ms, detail: `HTTP ${status}, content ok` };
}

export async function checkHttp(site, { timeoutMs = 20000, retryDelayMs = 15000 } = {}) {
  const t0 = Date.now();
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(site.url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "user-agent": "watchtower-uptime-check" },
      });
      const body = await res.text();
      return evaluateHttp(site, res.status, body, Date.now() - t0);
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, retryDelayMs));
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, ms: Date.now() - t0, detail: `fetch failed after retry: ${lastErr?.message || lastErr}` };
}
