# Sundial

Sundial warns you when your code uses Stripe API features that are deprecated
or already removed, and tells you what to use instead.

**Stage 1** is a small command-line tool: it scans a folder of
JavaScript/TypeScript code using pattern matching against a hand-checked
list of Stripe deprecations.

## Quick start (npx)

Requires Node.js 18 or newer. No install needed: `npx` downloads and runs it.

```bash
npx @kayden-dh/sundial scan ./some-project
```

Or install it globally to get a shorter `sundial` command:

```bash
npm install -g @kayden-dh/sundial
sundial scan ./some-project
```

> These work once the package is published to npm (see
> [Publishing](#publishing-to-npm)). Until then, use the steps below.

## Run from source

```bash
git clone https://github.com/kayden-dh/sundial.git
cd sundial
npm install                       # also compiles the TypeScript into dist/
npm run scan -- ./some-project    # run it straight from the repo
```

To get the `sundial` command on your machine from this checkout, run
`npm link` once, then `sundial scan ./some-project`.

Example output:

```
legacy/checkout.ts
  Line 10: return stripe.handleCardPayment(clientSecret, card);
    Deprecated:  Stripe.js handleCardPayment() / confirmPaymentIntent()
    Use instead: stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement } })
    Removed:     2026-03-25 (API version 2026-03-25.dahlia)
    Docs:        https://docs.stripe.com/changelog/dahlia/2026-03-25/remove-legacy-stripejs-methods
    Rule:        stripejs-legacy-payment-intent-methods
```

**Exit codes**: `0` = nothing found, `1` = deprecated usage found, `2` = error.
This lets you fail a CI build when deprecated calls appear.

### What gets scanned

- Files ending in `.js .jsx .mjs .cjs .ts .tsx .mts .cts`
- Skipped files: minified files (`*.min.js`, `*.min.mjs`, `*.min.cjs`)
- Skipped folders: `node_modules`, `dist`, `build`, `out`, `coverage`,
  `vendor`, `.git`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`,
  `.vercel`, `.output` (see `SKIPPED_FOLDERS` in `src/scanner.ts`)

### How matching works

1. Comments are removed first (`//`, `/* */` and `/** */` doc blocks), so
   mentioning `handleCardPayment()` in a comment is never flagged.
2. Method-call `patterns` also ignore string contents, so
   `"we replaced stripe.sources.create()"` in a message isn't flagged.
   Code inside a template literal's `${...}` still counts as code.
3. Each pattern runs over the whole file, not line by line. That means
   chained calls split across lines are caught:

   ```js
   stripe.sources
     .create({ type: "card" });   // reported at line 1
   ```

### Known limitations (Stage 1)

- This is pattern matching, not a real JavaScript parser. Quotes or `//`
  inside regex literals (like `/"/`) and apostrophes in JSX text
  (`<p>Don't</p>`) can confuse comment/string detection. The effect stops at
  the end of that line.
- A stray backtick (`` /`/ `` in a regex, or a lone backtick in JSX text)
  looks like the start of a template string. If that "template" is still
  open at the end of the file, Sundial retries with the backtick treated as
  plain code, so the rest of the file is still scanned. But if a later
  backtick pairs up with the stray one, code between the two can be missed.
- `stringPatterns` (URLs like `/v1/sources`) also match inside log messages.
- It can't tell whether `stripe` really is a Stripe client. Any object with a
  matching method name is flagged.
- A **removal date** means Stripe removed the feature in that API version.
  Accounts pinned to an older API version may still have it working, but
  upgrading will break it.

## Project layout

```
data/stripe-deprecations.json   the deprecation list (edit this to add rules)
src/cli.ts                      command-line entry point
src/deprecations.ts             loads + validates the JSON list
src/scanner.ts                  walks folders and matches patterns
src/strip.ts                    removes comments / string contents
src/report.ts                   formats the terminal output
src/scanner.test.ts             tests (not included in the npm package)
test-fixtures/                  fake code used by the tests:
  legacy/                         should be flagged (incl. multi-line calls)
  modern/                         should NOT be flagged
  ignored/                        deprecated names only in comments/strings
  node_modules/, dist/, *.min.js  should be skipped entirely
```

## Run the tests

```bash
npm test
```

## Adding a new deprecation

1. **Find an official source first.** Use Stripe's docs or changelog
   (`https://docs.stripe.com/changelog`). If you can't find official wording
   saying it's deprecated or removed, don't add it.
2. Add an entry to `data/stripe-deprecations.json`:

   ```json
   {
     "id": "stripejs-redirect-to-checkout",
     "deprecated": "Stripe.js redirectToCheckout()",
     "patterns": ["\\bredirectToCheckout\\s*\\("],
     "stringPatterns": [],
     "replacement": "window.location.href = session.url",
     "removalDate": "2025-09-30",
     "removedInVersion": "2025-09-30.clover",
     "sourceUrl": "https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout",
     "note": "Short extra context."
   }
   ```

   | Field | Required | Meaning |
   |---|---|---|
   | `id` | yes | Unique kebab-case name |
   | `deprecated` | yes | What is deprecated, in plain words |
   | `patterns` | one of these two | Regexes checked against code with comments **and string contents** removed. Use for method calls. |
   | `stringPatterns` | one of these two | Regexes checked against code with only comments removed. Use when the deprecated thing is inside a string: URLs (`/v1/sources`), element names (`elements.create("idealBank")`), quoted keys. |
   | `replacement` | yes | What to use instead |
   | `removalDate` | no | `YYYY-MM-DD`, or `null` if Stripe hasn't published one. **Never guess.** |
   | `removedInVersion` | no | Stripe API version that removed it, or `null` |
   | `sourceUrl` | yes | Must be on `stripe.com` / `docs.stripe.com` |
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
   replacement to `test-fixtures/modern/`, then update the expected results in
   `src/scanner.test.ts` and run `npm test`.

Sundial checks the file when it starts. A bad regex, missing field,
duplicate id or non-Stripe source URL stops it with an error that names
the entry.

## Publishing to npm

The package is set up for npm as `@kayden-dh/sundial` (the command is still
`sundial`). The `files` list in `package.json` publishes only `dist/`
(without test files), `data/`, `README.md` and `LICENSE`.

```bash
npm pack --dry-run   # preview exactly which files would be published
npm login
npm publish          # runs the tests first (prepublishOnly)
```

Scoped packages are private by default on npm, so
`"publishConfig": { "access": "public" }` makes it public.

## License

MIT, see [LICENSE](LICENSE).

## Sources for the current list

- Sources API: https://docs.stripe.com/sources
- Legacy Stripe.js methods (2026-03-25.dahlia): https://docs.stripe.com/changelog/dahlia/2026-03-25/remove-legacy-stripejs-methods
- redirectToCheckout (2025-09-30.clover): https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout
- Legacy bank & messaging Elements (2025-09-30.clover): https://docs.stripe.com/changelog/clover/2025-09-30/stripejs-deprecated-elements-removal
- Legacy usage records (2025-03-31.basil): https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing
- Upcoming Invoice API (2025-03-31.basil): https://docs.stripe.com/changelog/basil/2025-03-31/invoice-preview-api-deprecations
