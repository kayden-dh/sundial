// Checks the scanner against the fake code in test-fixtures/.
// Uses Node's built-in test runner (node:test), so there's nothing extra to install.
// Run with:  npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { loadDeprecations } from "./deprecations";
import { scan } from "./scanner";

const FIXTURES = path.join(__dirname, "..", "test-fixtures");
const deprecations = loadDeprecations();
const result = scan(FIXTURES, deprecations);

/** Helper: "file:line rule-id" strings for the findings in one file. */
function findingsIn(file: string): string[] {
  return result.findings
    .filter((f) => f.file === path.normalize(file))
    .map((f) => `${f.line} ${f.deprecation.id}`);
}

test("data file loads and every entry has an official source URL", () => {
  assert.ok(deprecations.length >= 5);
  for (const d of deprecations) {
    assert.match(d.sourceUrl, /^https:\/\/(docs\.)?stripe\.com\//);
  }
});

test("finds every deprecated call in legacy/server.js", () => {
  assert.deepEqual(findingsIn("legacy/server.js"), [
    "6 stripe-sources-api",
    "12 stripe-upcoming-invoice-api",
    "17 stripe-legacy-usage-records",
    "24 stripe-legacy-usage-records",
  ]);
});

test("finds every deprecated call in legacy/checkout.ts", () => {
  assert.deepEqual(findingsIn("legacy/checkout.ts"), [
    "7 stripejs-legacy-bank-elements",
    "10 stripejs-legacy-payment-intent-methods",
    "14 stripejs-legacy-setup-intent-methods",
    "18 stripejs-source-methods",
    "22 stripejs-redirect-to-checkout",
  ]);
});

test("does not flag modern code", () => {
  assert.deepEqual(findingsIn("modern/server.ts"), []);
  assert.deepEqual(findingsIn("modern/checkout.js"), []);
});

test("skips node_modules and dist folders", () => {
  for (const f of result.findings) {
    assert.ok(!f.file.includes("node_modules"), `should skip ${f.file}`);
    assert.ok(!f.file.startsWith("dist"), `should skip ${f.file}`);
  }
  // 4 real source files: legacy/ and modern/, two each.
  assert.equal(result.filesScanned, 4);
});
