# Sundial

Sundial warns you when your code uses Stripe API features that are deprecated
or already removed, and tells you what to use instead.

**Stage 1** is a small command-line tool: it scans a folder of
JavaScript/TypeScript code using simple text matching against a hand-checked
list of Stripe deprecations.

## Install

Requires Node.js 18 or newer.

```bash
git clone <this repo> sundial
cd sundial
npm install      # also compiles the TypeScript into dist/
npm link         # makes the `sundial` command available on your machine
```

## Run

```bash
npx sundial scan ./some-project
```

Without `npm link`, you can run it straight from the repo:

```bash
npm run scan -- ./some-project
```

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
- Skipped folders: `node_modules`, `dist`, `build`, `out`, `coverage`,
  `vendor`, `.git`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`,
  `.vercel`, `.output` (see `SKIPPED_FOLDERS` in `src/scanner.ts`)

### Known limitations (Stage 1)

- It's line-by-line text matching. It can't tell code from comments or
  strings, and it won't catch a call split across several lines.
- A **removal date** means Stripe removed the feature in that API version.
  Accounts pinned to an older API version may still have it working, but
  upgrading will break it.

## Project layout

```
data/stripe-deprecations.json   the deprecation list (edit this to add rules)
src/cli.ts                      command-line entry point
src/deprecations.ts             loads + validates the JSON list
src/scanner.ts                  walks folders and matches patterns
src/report.ts                   formats the terminal output
src/scanner.test.ts             tests against test-fixtures/
test-fixtures/                  fake code: legacy/ (should be flagged),
                                modern/ (should not), plus node_modules/
                                and dist/ (should be skipped)
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
   | `patterns` | yes | One or more JavaScript regular expressions |
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
   - Make sure the pattern doesn't match the *modern* replacement.
4. Add a deprecated example to `test-fixtures/legacy/` and the modern
   replacement to `test-fixtures/modern/`, then update the expected results in
   `src/scanner.test.ts` and run `npm test`.

Sundial checks the file when it starts. A bad regex, missing field,
duplicate id or non-Stripe source URL stops it with an error that names
the entry.

## Sources for the current list

- Sources API: https://docs.stripe.com/sources
- Legacy Stripe.js methods (2026-03-25.dahlia): https://docs.stripe.com/changelog/dahlia/2026-03-25/remove-legacy-stripejs-methods
- redirectToCheckout (2025-09-30.clover): https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout
- Legacy bank & messaging Elements (2025-09-30.clover): https://docs.stripe.com/changelog/clover/2025-09-30/stripejs-deprecated-elements-removal
- Legacy usage records (2025-03-31.basil): https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing
- Upcoming Invoice API (2025-03-31.basil): https://docs.stripe.com/changelog/basil/2025-03-31/invoice-preview-api-deprecations
