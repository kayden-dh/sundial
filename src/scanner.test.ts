// Checks the scanner against the fake code in test-fixtures/.
// Uses Node's built-in test runner (node:test), so there's nothing extra to install.
// Run with:  npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { loadDeprecations } from "./deprecations";
import { scan } from "./scanner";
import { stripSource } from "./strip";

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

test("finds calls split across several lines", () => {
  assert.deepEqual(findingsIn("legacy/multiline.js"), [
    "6 stripe-sources-api", // stripe.sources / .create( on the next line
    "12 stripe-upcoming-invoice-api", // match starts at ".invoices" on line 12
    "17 stripejs-legacy-payment-intent-methods", // after a /* comment */ on the same line
    "25 stripe-upcoming-invoice-api", // inside a template literal's ${...}
  ]);
});

test("shows the whole call for multi-line matches", () => {
  const f = result.findings.find((x) => x.file === path.normalize("legacy/multiline.js") && x.line === 6);
  assert.equal(f?.code, "return stripe.sources .create({ type: \"card\" });");
});

test("ignores deprecated methods mentioned in comments and strings", () => {
  assert.deepEqual(findingsIn("ignored/comments-and-strings.ts"), []);
});

test("does not flag modern code", () => {
  assert.deepEqual(findingsIn("modern/server.ts"), []);
  assert.deepEqual(findingsIn("modern/checkout.js"), []);
});

test("skips node_modules, dist and minified files", () => {
  for (const f of result.findings) {
    assert.ok(!f.file.includes("node_modules"), `should skip ${f.file}`);
    assert.ok(!f.file.startsWith("dist"), `should skip ${f.file}`);
    assert.ok(!f.file.endsWith(".min.js"), `should skip ${f.file}`);
  }
  // 6 real source files: 3 in legacy/, 2 in modern/, 1 in ignored/.
  assert.equal(result.filesScanned, 6);
});

// Direct tests of the comment/string stripper.
test("stripSource blanks comments but keeps line numbers", () => {
  const { code } = stripSource("a(); // x()\n/* y()\n z() */ b();");
  assert.equal(code.split("\n").length, 3); // same number of lines
  assert.ok(!code.includes("x()") && !code.includes("y()") && !code.includes("z()"));
  assert.ok(code.includes("a();") && code.includes("b();"));
});

test("stripSource hides string contents only from the code view", () => {
  const { code, codeWithStrings } = stripSource('fetch("/v1/sources"); f(\'it\\\'s\');');
  assert.ok(!code.includes("/v1/sources"));
  assert.ok(codeWithStrings.includes("/v1/sources"));
  assert.ok(code.includes("f(")); // the escaped quote didn't swallow the code
});

test("stripSource treats ${...} in template literals as code", () => {
  const { code } = stripSource("`text handleX() ${ realCall({ a: 1 }) } more text`; after();");
  assert.ok(!code.includes("handleX"));
  assert.ok(code.includes("realCall({ a: 1 })"));
  assert.ok(code.includes("after();"));
});
