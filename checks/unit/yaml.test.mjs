import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseOverridesYaml,
  mergeInventory,
  DEFAULT_EXPECT_CONTENT,
  DEFAULT_E2E_SELECTOR,
} from "../lib/sites.mjs";

const realYaml = readFileSync(new URL("../../sites.yaml", import.meta.url), "utf8");

test("parses the real sites.yaml overrides", () => {
  const o = parseOverridesYaml(realYaml);
  assert.equal(o.paper.expect_content, "PAPER. Fake money");
  assert.equal(o.paper.e2e_selector, ".paper-banner");
  assert.equal(o.icecream.e2e_selector, "#app");
  assert.ok(!("name" in o.paper));
});

test("coerces integers and booleans, keeps strings with colons", () => {
  const o = parseOverridesYaml(
    "overrides:\n  x:\n    expect_status: 200\n    skip: true\n    e2e_selector: https://a/b:c\n"
  );
  assert.equal(o.x.expect_status, 200);
  assert.equal(o.x.skip, true);
  assert.equal(o.x.e2e_selector, "https://a/b:c");
});

test("rejects garbage and unknown keys", () => {
  assert.throws(() => parseOverridesYaml("nope: [\n"), /watchtower yaml/);
  assert.throws(
    () => parseOverridesYaml("overrides:\n  x:\n    bogus_key: 1\n"),
    /unknown override key/
  );
});

test("mergeInventory applies overrides, defaults, names, and skip", () => {
  const discovered = [
    { repo: "paper", url: "https://yeahdogs.github.io/paper/", customDomain: null },
    { repo: "brandnew", url: "https://yeahdogs.github.io/brandnew/", customDomain: null },
    { repo: "retired", url: "https://yeahdogs.github.io/retired/", customDomain: null },
  ];
  const overrides = {
    paper: { expect_content: "PAPER. Fake money", e2e_selector: ".paper-banner", name: "Paper Trading" },
    retired: { skip: true },
  };
  const sites = mergeInventory(discovered, overrides);
  assert.equal(sites.length, 2);
  const paper = sites.find((s) => s.repo === "paper");
  assert.equal(paper.name, "Paper Trading");
  assert.equal(paper.expect_content, "PAPER. Fake money");
  assert.equal(paper.e2e_selector, ".paper-banner");
  const fresh = sites.find((s) => s.repo === "brandnew");
  assert.equal(fresh.name, "brandnew");
  assert.equal(fresh.expect_status, 200);
  assert.equal(fresh.expect_content, DEFAULT_EXPECT_CONTENT);
  assert.equal(fresh.e2e_selector, DEFAULT_E2E_SELECTOR);
});
