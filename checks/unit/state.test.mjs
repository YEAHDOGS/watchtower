import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTransitions } from "../lib/state.mjs";

const sites = [{ name: "paper" }, { name: "news" }];
const T0 = "2026-09-09T19:00:00.000Z";
const T1 = "2026-09-09T19:30:00.000Z";
const up = (detail = "ok") => ({ ok: true, detail });
const down = (detail = "boom") => ({ ok: false, detail });

test("first observation is a silent baseline", () => {
  const { nextState, events } = computeTransitions(sites, {}, { paper: { http: down() } }, T0);
  assert.equal(events.length, 0);
  assert.equal(nextState.paper.status, "down");
  assert.equal(nextState.paper.since, T0);
});

test("up->up produces no event", () => {
  const prev = { paper: { status: "up", since: T0, lastCheck: T0, checks: { http: { ...up(), at: T0 } }, failing: [] } };
  const { events } = computeTransitions(sites, prev, { paper: { http: up() } }, T1);
  assert.equal(events.length, 0);
});

test("up->down fires a down event, down->down stays silent", () => {
  const prev = { paper: { status: "up", since: T0, lastCheck: T0, checks: { http: { ...up(), at: T0 } }, failing: [] } };
  const r1 = computeTransitions(sites, prev, { paper: { http: down("timeout") } }, T1);
  assert.equal(r1.events.length, 1);
  assert.equal(r1.events[0].type, "down");
  assert.match(r1.events[0].detail, /timeout/);
  assert.equal(r1.nextState.paper.since, T1);
  const r2 = computeTransitions(sites, r1.nextState, { paper: { http: down("still bad") } }, T1);
  assert.equal(r2.events.length, 0); // no repeat alert while down
});

test("down->up fires a recovered event", () => {
  const prev = { paper: { status: "down", since: T0, lastCheck: T0, checks: { http: { ...down(), at: T0 } }, failing: [{ type: "http", detail: "x" }] } };
  const { events, nextState } = computeTransitions(sites, prev, { paper: { http: up() } }, T1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "recovered");
  assert.equal(nextState.paper.status, "up");
});

test("a check that did not run keeps its previous slot", () => {
  const prev = {
    paper: { status: "down", since: T0, lastCheck: T0, checks: { http: { ...up(), at: T0 }, e2e: { ...down("old"), at: T0 } }, failing: [{ type: "e2e", detail: "old" }] },
  };
  // http-only run: e2e slot preserved, site stays down, no new event
  const { nextState, events } = computeTransitions(sites, prev, { paper: { http: up() } }, T1);
  assert.equal(nextState.paper.status, "down");
  assert.equal(events.length, 0);
  // e2e recovers -> site recovers
  const r2 = computeTransitions(sites, nextState, { paper: { e2e: up() } }, T1);
  assert.equal(r2.nextState.paper.status, "up");
  assert.equal(r2.events[0].type, "recovered");
});

test("site removed from inventory drops out of state", () => {
  const prev = { paper: { status: "up", since: T0, lastCheck: T0, checks: {}, failing: [] } };
  const { nextState } = computeTransitions([{ name: "news" }], prev, {}, T1);
  assert.ok(!("paper" in nextState));
});
