# Sundial

Sundial scans your JavaScript/TypeScript code for deprecated or removed API calls (currently Stripe) and tells you what to use instead.

```bash
npx @kayden-dh/sundial scan .
```

```
Sundial: scanned 1 file(s) in . for Stripe deprecations

checkout.js
  Line 2: await stripe.redirectToCheckout({ sessionId: session.id });
    Provider:    Stripe
    Deprecated:  Stripe.js redirectToCheckout()
    Use instead: Redirect to the Checkout Session URL yourself (window.location.href = session.url), or use Payment Links / Buy Buttons for client-only integrations
    Removed:     2025-09-30 (API version 2025-09-30.clover)
    Docs:        https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout
    Rule:        stripejs-redirect-to-checkout

Found 1 deprecated API usage(s) in 1 file(s) (Stripe: 1).
```

Requires Node.js 22 or newer. Nothing is uploaded: Sundial only reads files
on your machine.

## Known limitations

Sundial uses pattern matching, not a full JavaScript parser. In practice:

- **It can miss calls** where the method name is in a variable
  (`stripe[method](...)`), or where a library wraps Stripe for you.
- **It doesn't detect Sources passed through a `source` option**, such as
  `stripe.paymentIntents.confirm(id, { source: src.id })` or webhook code
  checking `object === "source"`. A plain `source:` key is too common to flag
  safely.
- **It can't tell whether `stripe` really is a Stripe client.** Any object
  with a matching method name is flagged.
- **Unusual syntax can confuse comment/string detection**: quotes, `//` or
  `/*` inside a regex literal, or apostrophes and backticks in JSX text.
  Usually only the rest of that line is affected.
- **Generic names** (`display_items`, `aggregate_usage`) are only reported in
  files that mention "stripe". That can miss a helper file that never names
  Stripe.
- **Only JS/TS files and inline `<script>` blocks in `.html`/`.htm`/`.php`
  pages are scanned.** Server code in other languages (Python, PHP, Ruby, ...)
  and Vue/Svelte/Astro files aren't checked.
- **A removal date means the feature was removed in that API version.**
  Accounts pinned to an older version may still work until they upgrade.

## What it detects

| Deprecated | Removed in |
|---|---|
| [Sources API](https://docs.stripe.com/sources) (`stripe.sources.*`, `/v1/sources`) | deprecated, no date yet |
| [Stripe.js `createSource()` / `retrieveSource()`](https://docs.stripe.com/changelog/dahlia/2026-03-25/remove-legacy-stripejs-methods) | 2026-03-25.dahlia |
| [Stripe.js `handleCardPayment()` / `confirmPaymentIntent()`](https://docs.stripe.com/changelog/dahlia/2026-03-25/remove-legacy-stripejs-methods) | 2026-03-25.dahlia |
| [Stripe.js `handleFpxPayment()`](https://docs.stripe.com/changelog/dahlia/2026-03-25/remove-legacy-stripejs-methods) | 2026-03-25.dahlia |
| [Stripe.js `handleCardSetup()` / `confirmSetupIntent()`](https://docs.stripe.com/changelog/dahlia/2026-03-25/remove-legacy-stripejs-methods) | 2026-03-25.dahlia |
| [Stripe.js `redirectToCheckout()`](https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout) | 2025-09-30.clover |
| [Bank Elements: `idealBank`, `fpxBank`, `epsBank`, `p24Bank`](https://docs.stripe.com/changelog/clover/2025-09-30/stripejs-deprecated-elements-removal) | 2025-09-30.clover |
| [Messaging Elements: `affirmMessage`, `afterpayClearpayMessage`](https://docs.stripe.com/changelog/clover/2025-09-30/stripejs-deprecated-elements-removal) | 2025-09-30.clover |
| [Legacy usage records (`createUsageRecord`, `listUsageRecordSummaries`)](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing) | 2025-03-31.basil |
| [`aggregate_usage` on metered prices](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing) | 2025-03-31.basil |
| [Upcoming Invoice API (`retrieveUpcoming`, `listUpcomingLines`)](https://docs.stripe.com/changelog/basil/2025-03-31/invoice-preview-api-deprecations) | 2025-03-31.basil |
| [Checkout Session `display_items`](https://docs.stripe.com/changelog/2020-08-27/removes-display-items-checkout-session) | 2020-08-27 |
| [`react-stripe-elements` package](https://github.com/stripe-archive/react-stripe-elements) | deprecated, no date yet |

Every entry links to Stripe's own docs, changelog or GitHub.

## Usage

```bash
npx @kayden-dh/sundial scan <path>    # a folder or a single file
```

Or install it to get a shorter `sundial` command:

```bash
npm install -g @kayden-dh/sundial
sundial scan .
```

**Exit codes**: `0` = nothing found, `1` = deprecated usage found, `2` =
error. So you can fail a CI build when deprecated calls appear:

```bash
npx @kayden-dh/sundial scan ./src || exit 1
```

### What gets scanned

- `.js .jsx .mjs .cjs .ts .tsx .mts .cts` files
- Inline `<script>` blocks in `.html`, `.htm` and `.php` pages (page text,
  PHP code, HTML comments and non-JS script types are ignored)
- Skipped: minified files (`*.min.js`) and the folders `node_modules`,
  `dist`, `build`, `out`, `coverage`, `vendor`, `.git`, `.next`, `.nuxt`,
  `.svelte-kit`, `.turbo`, `.cache`, `.vercel`, `.output`

### How matching works

- Comments are ignored, so a mention like `// old: handleCardPayment()` isn't
  flagged. Method names inside plain strings are ignored too.
- Calls split across lines (`stripe.sources\n  .create(...)`) and bracket
  calls (`stripe["handleCardPayment"](...)`) are caught.
- Code inside a template literal's `${...}` still counts as code.

---

## Contributing

### Run from source

```bash
git clone https://github.com/kayden-dh/sundial.git
cd sundial
npm install                       # also compiles TypeScript into dist/
npm run scan -- ./some-project
npm test
```

### Project layout

```
data/providers/stripe.json      Stripe's settings + deprecation list
                                (one file per provider, all loaded automatically)
src/cli.ts                      command-line entry point
src/deprecations.ts             loads + validates every provider file
src/scanner.ts                  walks folders and matches patterns
src/strip.ts                    removes comments / string contents
src/html.ts                     pulls <script> blocks out of .html/.php pages
src/report.ts                   formats the terminal output
src/scanner.test.ts             tests (not included in the npm package)
test-fixtures/                  fake code used by the tests:
  legacy/                         should be flagged
  modern/                         should NOT be flagged
  ignored/                        mentions in comments/strings, or generic
                                  names in non-Stripe files
  node_modules/, dist/, *.min.js  should be skipped entirely
```

### Adding a new deprecation

1. **Find an official source first** (for Stripe:
   `https://docs.stripe.com/changelog`). If you can't find official wording
   saying it's deprecated or removed, don't add it.
2. Add an entry to the provider's `deprecations` list, for Stripe in
   `data/providers/stripe.json`:

   ```json
   {
     "id": "stripejs-redirect-to-checkout",
     "deprecated": "Stripe.js redirectToCheckout()",
     "patterns": ["\\bredirectToCheckout\\s*\\("],
     "methods": ["redirectToCheckout"],
     "replacement": "window.location.href = session.url",
     "removalDate": "2025-09-30",
     "removedInVersion": "2025-09-30.clover",
     "sourceUrl": "https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout",
     "note": "Short extra context."
   }
   ```

   | Field | Required | Meaning |
   |---|---|---|
   | `id` | yes | Unique kebab-case name (unique across all providers) |
   | `deprecated` | yes | What is deprecated, in plain words |
   | `patterns` | one of `patterns`, `stringPatterns`, `methods` | Regexes checked against code with comments **and string contents** removed. Use for method calls. |
   | `stringPatterns` | | Regexes checked against code with only comments removed. Use when the deprecated thing is inside a string: URLs (`/v1/sources`), element names (`elements.create("idealBank")`), quoted keys. |
   | `methods` | | Method names (`"handleCardPayment"`, or `"invoices.retrieveUpcoming"` for a call on that object). Bracket-call patterns (`stripe["handleCardPayment"](...)`) are generated from these. Still write the normal dot-call regex in `patterns`. |
   | `ignoreCallsOn` | no | Objects whose same-named method is fine, e.g. `["customers"]` so `stripe.customers["createSource"](...)` isn't flagged. |
   | `requireProviderMention` | no | `true` = only report in files that contain one of the provider's `mentionWords`. For generic names. |
   | `replacement` | yes | What to use instead |
   | `removalDate` | no | `YYYY-MM-DD`, or `null` if the provider hasn't published one. **Never guess.** |
   | `removedInVersion` | no | API version that removed it, or `null` |
   | `sourceUrl` | yes | An `https` link on one of the provider's `officialSources` |
   | `note` | yes | Short extra context |

3. **Writing patterns.** They're regular expressions inside JSON strings, so
   every backslash is doubled (`\\s` in JSON means `\s` in the regex).
   - Use `\\b` (word boundary) so `handleCardPayment` doesn't also match
     `myhandleCardPayment`.
   - End method patterns with `\\s*\\(` so only calls match, not mentions.
   - Put `\\s*` around dots (`\\.sources\\s*\\.\\s*create`) so calls split
     across lines still match. `\\s` includes newlines.
   - Make sure the pattern doesn't match the *modern* replacement.
4. Add a deprecated example to `test-fixtures/legacy/` and the modern
   replacement to `test-fixtures/modern/`, update the expected results in
   `src/scanner.test.ts`, and run `npm test`.

Sundial checks every provider file when it starts. A bad regex, missing
field, duplicate id, or a source URL outside the provider's official sources
stops it with an error that names the file and entry.

### Adding a new provider

Each API provider is one JSON file in `data/providers/`. Every `*.json` file
there is loaded automatically, so adding an API means adding a file. No code
changes are needed.

1. Create `data/providers/<id>.json` (the file name must match the `id`):

   ```json
   {
     "provider": {
       "id": "acme",
       "name": "Acme",
       "mentionWords": ["acme"],
       "officialSources": ["docs.acme.com", "github.com/acme"]
     },
     "deprecations": []
   }
   ```

   | Field | Meaning |
   |---|---|
   | `id` | Short kebab-case name; also the file name (`acme` -> `acme.json`) |
   | `name` | Display name shown in reports |
   | `mentionWords` | Words that count as a mention of this provider in a file (any case), used by `requireProviderMention` entries |
   | `officialSources` | Where `sourceUrl` links may point: a domain (`docs.acme.com`, exact host) or a domain plus path (`github.com/acme`, which allows `github.com/acme/...` but not `github.com/acme-other/...`). No `https://`. |

2. Add deprecation entries as described above. Prefix their ids with the
   provider id (`acme-...`) to keep them unique.
3. Add fixtures under `test-fixtures/` and expected results in
   `src/scanner.test.ts`, then run `npm test`.

### Publishing (maintainers)

The `files` list in `package.json` publishes only `dist/` (without test
files), `data/`, `README.md` and `LICENSE`.

```bash
npm pack --dry-run   # preview exactly which files would be published
npm publish          # runs the tests first (prepublishOnly)
```

## License

MIT, see [LICENSE](LICENSE).
