import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHttp } from "../lib/http.mjs";

const site = { name: "paper", expect_status: 200, expect_content: "PAPER — Fake money" };

test("200 + content present = ok", () => {
  const r = evaluateHttp(site, 200, "<title>PAPER — Fake money. Real lessons.</title>", 42);
  assert.equal(r.ok, true);
});

test("wrong status = not ok", () => {
  const r = evaluateHttp(site, 404, "not found", 42);
  assert.equal(r.ok, false);
  assert.match(r.detail, /HTTP 404/);
});

test("200 but content missing = not ok", () => {
  const r = evaluateHttp(site, 200, "<title>Some other site</title>", 42);
  assert.equal(r.ok, false);
  assert.match(r.detail, /content check failed/);
});
