// Checks the scanner against the fake code in test-fixtures/.
// Uses Node's built-in test runner (node:test), so there's nothing extra to install.
// Run with:  npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadDeprecations, loadProviders, bracketCallPattern, isOfficialSource } from "./deprecations";
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
    assert.ok(isOfficialSource(d.sourceUrl, d.provider.officialSources), d.sourceUrl);
  }
});

test("finds every deprecated call in legacy/server.js", () => {
  assert.deepEqual(findingsIn("legacy/server.js"), [
    "6 stripe-sources-api",
    "12 stripe-upcoming-invoice-api",
    "17 stripe-legacy-usage-records",
    "24 stripe-aggregate-usage",
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

test("requireProviderMention: generic names aren't flagged in files that never mention Stripe", () => {
  // Uses display_items and aggregate_usage, but has nothing to do with Stripe.
  assert.deepEqual(findingsIn("ignored/no-stripe-mention.js"), []);
  // The same names ARE flagged in Stripe files (see display-items.js / server.js).
  const flags = Object.fromEntries(deprecations.map((d) => [d.id, d.requireProviderMention]));
  assert.equal(flags["stripe-checkout-display-items"], true);
  assert.equal(flags["stripe-aggregate-usage"], true);
  assert.equal(flags["stripe-legacy-usage-records"], false); // only aggregate_usage was split out
});

test("flags imports and requires of react-stripe-elements", () => {
  assert.deepEqual(findingsIn("legacy/react-stripe-elements.jsx"), [
    "3 react-stripe-elements-package", // import ... from
    "4 react-stripe-elements-package", // export ... from
    "5 react-stripe-elements-package", // require()
    "6 react-stripe-elements-package", // dynamic import()
    // lines 8-9 only mention the name in a comment and a log message
  ]);
  assert.deepEqual(findingsIn("modern/react-stripe-js.jsx"), []);
});

test("bracket-call patterns are generated, not hand-written", () => {
  const raw = JSON.parse(require("fs").readFileSync(path.join(__dirname, "..", "data", "providers", "stripe.json"), "utf8"));
  for (const entry of raw.deprecations) {
    for (const p of entry.stringPatterns ?? []) {
      assert.ok(!p.includes("\\[\\s*['"), `${entry.id} still has a hand-written bracket pattern`);
    }
  }
  const re = (method: string, ignore: string[] = []) => new RegExp(bracketCallPattern(method, ignore));
  assert.ok(re("handleCardPayment").test('stripe["handleCardPayment"](s)'));
  assert.ok(re("handleCardPayment").test("stripe?.[`handleCardPayment`]?.(s)"));
  assert.ok(!re("handleCardPayment").test('stripe["confirmCardPayment"](s)'));
  assert.ok(re("invoices.retrieveUpcoming").test('stripe.invoices["retrieveUpcoming"]({})'));
  assert.ok(!re("invoices.retrieveUpcoming").test('stripe.quotes["retrieveUpcoming"]({})'));
  assert.ok(!re("createSource", ["customers"]).test('stripe.customers["createSource"](c)'));
  assert.ok(!re("createSource", ["customers"]).test('stripe.customers?.["createSource"](c)'));
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
  // 16 real source files: 11 in legacy/ (incl. .html/.php), 3 in modern/, 2 in ignored/.
  assert.equal(result.filesScanned, 16);
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

// ---- Provider layer ----

/** Writes provider files into a fresh temp folder and returns its path. */
function providerDir(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sundial-providers-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(content));
  }
  return dir;
}

/** A minimal valid provider file for tests ("acme" by default). */
function fakeProvider(id = "acme", entryId = "acme-old-ping") {
  return {
    provider: { id, name: "Acme", mentionWords: ["acme"], officialSources: ["docs.acme.test"] },
    deprecations: [
      {
        id: entryId,
        deprecated: "acme.ping()",
        patterns: ["\\.ping\\s*\\("],
        stringPatterns: ["\\bold_flag\\b"],
        requireProviderMention: true,
        replacement: "acme.health()",
        removalDate: null,
        removedInVersion: null,
        sourceUrl: "https://docs.acme.test/changelog/ping",
        note: "Test entry.",
      },
    ],
  };
}

test("the bundled data ships with exactly one provider: Stripe", () => {
  const providers = loadProviders();
  assert.deepEqual(providers.map((p) => [p.id, p.name]), [["stripe", "Stripe"]]);
  assert.deepEqual(providers[0].mentionWords, ["stripe"]);
  assert.ok(deprecations.every((d) => d.provider.id === "stripe"));
});

test("every *.json file in the providers folder is loaded automatically", () => {
  const stripe = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "providers", "stripe.json"), "utf8"));
  const dir = providerDir({ "stripe.json": stripe, "acme.json": fakeProvider(), "notes.txt": "ignored" });
  const providers = loadProviders(dir);
  assert.deepEqual(providers.map((p) => p.id), ["acme", "stripe"]); // sorted by file name

  // The new provider's entries work end to end, using its own mention words.
  const all = providers.flatMap((p) => p.deprecations);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sundial-code-"));
  fs.writeFileSync(path.join(tmp, "uses-acme.js"), "const acme = require('acme');\nacme.ping();\nconst x = { old_flag: 1 };\n");
  fs.writeFileSync(path.join(tmp, "no-mention.js"), "const x = { old_flag: 1 };\n");
  const found = scan(tmp, all).findings.map((f) => `${f.file}:${f.line} ${f.deprecation.provider.id}/${f.deprecation.id}`);
  assert.deepEqual(found, ["uses-acme.js:2 acme/acme-old-ping", "uses-acme.js:3 acme/acme-old-ping"]);
});

test("sourceUrl is checked against the provider's own officialSources", () => {
  const sources = ["stripe.com", "docs.stripe.com", "github.com/stripe", "github.com/stripe-archive"];
  assert.ok(isOfficialSource("https://docs.stripe.com/changelog/x", sources));
  assert.ok(isOfficialSource("https://github.com/stripe-archive/react-stripe-elements", sources));
  assert.ok(!isOfficialSource("https://github.com/stripe-evil/repo", sources)); // whole path parts only
  assert.ok(!isOfficialSource("https://docs.stripe.com.evil.test/x", sources)); // exact host only
  assert.ok(!isOfficialSource("http://docs.stripe.com/x", sources)); // https only
  assert.ok(!isOfficialSource("not a url", sources));

  // A Stripe link is not an official source for another provider.
  const wrongSource = fakeProvider();
  wrongSource.deprecations[0].sourceUrl = "https://docs.stripe.com/changelog";
  assert.throws(() => loadProviders(providerDir({ "acme.json": wrongSource })), /official sources: docs\.acme\.test/);
});

test("provider files are validated", () => {
  // File name must match the provider id.
  assert.throws(() => loadProviders(providerDir({ "other.json": fakeProvider() })), /must live in acme\.json/);
  // Deprecation ids must be unique across providers.
  const dup = providerDir({ "acme.json": fakeProvider("acme", "same-id"), "beta.json": fakeProvider("beta", "same-id") });
  assert.throws(() => loadProviders(dup), /duplicate id "same-id"/);
  // Missing provider settings are reported.
  const noWords = fakeProvider();
  (noWords.provider as { mentionWords: string[] }).mentionWords = [];
  assert.throws(() => loadProviders(providerDir({ "acme.json": noWords })), /"mentionWords" must be a non-empty array/);
  // An empty folder is an error, not a silent "nothing found".
  assert.throws(() => loadProviders(providerDir({})), /no provider files/);
});
