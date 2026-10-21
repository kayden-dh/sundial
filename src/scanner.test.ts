// Checks the scanner against the fake code in test-fixtures/.
// Uses Node's built-in test runner (node:test), so there's nothing extra to install.
// Run with:  npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { loadDeprecations } from "./deprecations";
import { scan } from "./scanner";
import { stripSource } from "./strip";
import { extractScripts } from "./html";

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

test("a backtick inside a regex doesn't hide the rest of the file", () => {
  assert.deepEqual(findingsIn("legacy/backtick-regex.js"), [
    "12 stripe-sources-api",
    "16 stripe-upcoming-invoice-api",
  ]);
});

test("a lone backtick in JSX text doesn't hide the rest of the file", () => {
  assert.deepEqual(findingsIn("legacy/backtick-jsx.jsx"), [
    "8 stripejs-legacy-payment-intent-methods",
    "12 stripejs-redirect-to-checkout",
  ]);
});

test("shows the whole call for multi-line matches", () => {
  const f = result.findings.find((x) => x.file === path.normalize("legacy/multiline.js") && x.line === 6);
  assert.equal(f?.code, "return stripe.sources .create({ type: \"card\" });");
});

test("chained calls show the object they're called on", () => {
  const codeAt = (line: number) =>
    result.findings.find((x) => x.file === path.normalize("legacy/chained-display.js") && x.line === line)?.code;
  assert.deepEqual(findingsIn("legacy/chained-display.js"), [
    "5 stripejs-redirect-to-checkout",
    "11 stripejs-legacy-payment-intent-methods",
  ]);
  assert.equal(codeAt(5), "stripe .redirectToCheckout({ sessionId });");
  // The comment line between "stripe" and "?.handleCardPayment" is skipped.
  assert.equal(codeAt(11), "const result = stripe ?.handleCardPayment(secret);");
});

test("scans inline <script> blocks in HTML pages", () => {
  // Line 5 (page text), 6 (commented-out script) and 7 (JSON script) are ignored.
  assert.deepEqual(findingsIn("legacy/inline-script.html"), [
    "12 stripejs-legacy-bank-elements",
    "15 stripejs-redirect-to-checkout",
  ]);
});

test("scans inline <script> blocks in PHP pages, ignoring PHP code", () => {
  // Line 3 is PHP, and line 2's comment mentions "<script>" without being a tag.
  assert.deepEqual(findingsIn("legacy/inline-script.php"), ["13 stripejs-legacy-bank-elements"]);
});

test("finds methods called with bracket syntax", () => {
  assert.deepEqual(findingsIn("legacy/bracket-calls.js"), [
    "3 stripejs-legacy-payment-intent-methods",
    "4 stripejs-legacy-setup-intent-methods",
    "5 stripejs-redirect-to-checkout",
    "9 stripe-upcoming-invoice-api",
    "10 stripe-legacy-usage-records",
    // line 12: customers["createSource"] is a different method, not flagged
    // line 18: stripe[method](...) is a KNOWN GAP (name in a variable)
  ]);
});

test("finds the removed display_items property", () => {
  assert.deepEqual(findingsIn("legacy/display-items.js"), [
    "4 stripe-checkout-display-items",
    "8 stripe-checkout-display-items",
  ]);
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
  // 13 real source files: 10 in legacy/ (incl. .html/.php), 2 in modern/, 1 in ignored/.
  assert.equal(result.filesScanned, 13);
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

test("stripSource recovers from a template that never closes", () => {
  const { code } = stripSource("const re = /`/;\nstripe.sources.create();\n");
  assert.ok(code.includes("stripe.sources.create()"));
  assert.ok(code.includes("/`/")); // the stray backtick is kept as plain code
});

test("stripSource still blanks real templates after a stray backtick", () => {
  // The stray backtick opens first; the real template inside ${...} closes.
  const src = "x(`a ${ y(`inner handleX()`) }\nafter();\n";
  const { code } = stripSource(src);
  assert.ok(code.includes("after();"));
  assert.ok(!code.includes("handleX"));
});

test("known gap: a later backtick can pair up with a stray one", () => {
  // The regex backtick and the backtick in the string below pair up as one
  // "template", so the call between them is hidden. The safety net only
  // helps when a template is still open at the end of the file.
  const src = 'const re = /`/;\nstripe.sources.create();\nconst s = "`";\n';
  const { code } = stripSource(src);
  assert.ok(!code.includes("stripe.sources.create()"));
});

// Direct tests of the HTML/PHP script extractor.
test("extractScripts keeps only JavaScript inside <script> blocks", () => {
  const page = [
    "<p>handleA()</p>",
    "<script>handleB();</script>",
    "<SCRIPT type='text/javascript'>handleC();</SCRIPT>",
    '<script type="application/json">{"x": "handleD()"}</script>',
    "<!-- <script>handleE();</script> -->",
    "<?php /* <script> */ handleF(); ?><script>handleG();</script>",
  ].join("\n");
  const js = extractScripts(page);
  assert.equal(js.length, page.length); // every position kept
  assert.equal(js.split("\n").length, 6); // every line kept
  for (const kept of ["handleB", "handleC", "handleG"]) assert.ok(js.includes(kept), kept);
  for (const dropped of ["handleA", "handleD", "handleE", "handleF"]) assert.ok(!js.includes(dropped), dropped);
});
