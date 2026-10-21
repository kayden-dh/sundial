// Loads the list of known Stripe deprecations from the JSON data file,
// checks that each entry is well-formed, and turns the pattern strings
// into real regular expressions the scanner can use. It also generates the
// bracket-call patterns (stripe["methodName"](...)) from each entry's `methods`.

import * as fs from "fs";
import * as path from "path";

/** One entry as it is written in data/stripe-deprecations.json. */
export interface DeprecationEntry {
  id: string;
  deprecated: string; // what is deprecated, in plain words
  // Regular expressions (as strings). `patterns` are checked against code with
  // comments AND string contents removed: use them for method calls.
  // `stringPatterns` are checked against code with only comments removed:
  // use them when the deprecated thing lives inside a string (URLs, names).
  // An entry needs at least one of the two.
  patterns?: string[];
  stringPatterns?: string[];
  // Method names this entry covers, e.g. "handleCardPayment", or
  // "invoices.retrieveUpcoming" when the call must be on a specific object.
  // Used to generate bracket-call patterns like stripe["handleCardPayment"](...).
  methods?: string[];
  // Objects whose same-named methods are NOT deprecated, e.g. ["customers"]
  // so stripe.customers["createSource"](...) isn't flagged.
  ignoreCallsOn?: string[];
  // When true, only report matches in files that mention "stripe" somewhere
  // (any case). For generic names like display_items that other code may use.
  requireStripeInFile?: boolean;
  replacement: string; // what to use instead
  removalDate: string | null; // YYYY-MM-DD, or null if Stripe hasn't said
  removedInVersion: string | null; // Stripe API version that removed it, if any
  sourceUrl: string; // official Stripe docs/changelog/GitHub link
  note: string;
}

/** An entry plus its compiled regexes, ready for scanning. */
export interface Deprecation extends DeprecationEntry {
  codeRegexes: RegExp[];
  stringRegexes: RegExp[]; // includes the generated bracket-call patterns
  requireStripeInFile: boolean;
}

/**
 * Official sources we accept: Stripe's docs and site, plus Stripe's own GitHub
 * organizations (some notices, like a library's deprecation, only live there).
 */
const OFFICIAL_SOURCE = /^https:\/\/((docs\.)?stripe\.com\/|github\.com\/(stripe|stripe-archive)\/)/;

/** A JavaScript identifier, e.g. handleCardPayment or $foo. */
const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const METHOD_NAME = new RegExp(`^(${IDENTIFIER}\\.)?${IDENTIFIER}$`);
const OBJECT_NAME = new RegExp(`^${IDENTIFIER}$`);

/**
 * Default location of the data file. When compiled, this code lives in
 * dist/, so the data folder is one level up.
 */
export const DEFAULT_DATA_FILE = path.join(
  __dirname,
  "..",
  "data",
  "stripe-deprecations.json"
);

/**
 * Reads and validates the deprecation list.
 * Throws an Error with a clear message if anything is wrong, so a typo in
 * the JSON is caught immediately instead of silently matching nothing.
 */
export function loadDeprecations(filePath = DEFAULT_DATA_FILE): Deprecation[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || !Array.isArray(parsed.deprecations)) {
    throw new Error(`${filePath}: expected an object with a "deprecations" array`);
  }

  const seenIds = new Set<string>();

  return parsed.deprecations.map((entry: DeprecationEntry, index: number) => {
    const where = `${filePath}, entry #${index + 1} (${entry.id ?? "no id"})`;

    // Required text fields must be non-empty strings.
    for (const field of ["id", "deprecated", "replacement", "sourceUrl", "note"] as const) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        throw new Error(`${where}: "${field}" must be a non-empty string`);
      }
    }

    if (seenIds.has(entry.id)) {
      throw new Error(`${where}: duplicate id "${entry.id}"`);
    }
    seenIds.add(entry.id);

    // We only trust official Stripe sources.
    if (!OFFICIAL_SOURCE.test(entry.sourceUrl)) {
      throw new Error(
        `${where}: sourceUrl must be an official link: https://stripe.com, https://docs.stripe.com, or https://github.com/stripe(-archive)/`
      );
    }

    if (entry.requireStripeInFile !== undefined && typeof entry.requireStripeInFile !== "boolean") {
      throw new Error(`${where}: "requireStripeInFile" must be true or false`);
    }

    // removalDate is optional, but if present it must look like a date.
    if (entry.removalDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.removalDate)) {
      throw new Error(`${where}: "removalDate" must be YYYY-MM-DD or null`);
    }

    const patterns = entry.patterns ?? [];
    const stringPatterns = entry.stringPatterns ?? [];
    const methods = entry.methods ?? [];
    const ignoreCallsOn = entry.ignoreCallsOn ?? [];
    for (const [name, list] of Object.entries({ patterns, stringPatterns, methods, ignoreCallsOn })) {
      if (!Array.isArray(list)) throw new Error(`${where}: "${name}" must be an array`);
    }
    if (patterns.length + stringPatterns.length + methods.length === 0) {
      throw new Error(`${where}: needs at least one entry in "patterns", "stringPatterns" or "methods"`);
    }
    for (const method of methods) {
      if (!METHOD_NAME.test(method)) {
        throw new Error(`${where}: method ${JSON.stringify(method)} must look like "name" or "object.name"`);
      }
    }
    for (const object of ignoreCallsOn) {
      if (!OBJECT_NAME.test(object)) {
        throw new Error(`${where}: ignoreCallsOn ${JSON.stringify(object)} must be a plain name`);
      }
    }

    // Compile each pattern now, so a bad regex fails loudly at startup.
    // The "g" (global) flag lets us find every match in a whole file.
    const compile = (pattern: string) => {
      try {
        return new RegExp(pattern, "g");
      } catch (err) {
        throw new Error(`${where}: invalid pattern ${JSON.stringify(pattern)}: ${(err as Error).message}`);
      }
    };

    // The method name in a bracket call is inside quotes, so these patterns
    // must run on the view that keeps string contents (stringRegexes).
    const bracketPatterns = methods.map((method) => bracketCallPattern(method, ignoreCallsOn));

    return {
      ...entry,
      removedInVersion: entry.removedInVersion ?? null,
      requireStripeInFile: entry.requireStripeInFile ?? false,
      codeRegexes: patterns.map(compile),
      stringRegexes: [...stringPatterns, ...bracketPatterns].map(compile),
    };
  });
}

/**
 * Builds a regex (as a string) that matches a bracket call of `method`.
 *
 *   "handleCardPayment"        matches  stripe["handleCardPayment"](...)
 *                                       stripe?.['handleCardPayment']?.(...)
 *   "invoices.retrieveUpcoming" matches stripe.invoices[`retrieveUpcoming`](...)
 *
 * With ignoreCallsOn = ["customers"], stripe.customers["createSource"](...)
 * is skipped (a lookbehind checks the object before the "[").
 */
export function bracketCallPattern(method: string, ignoreCallsOn: string[] = []): string {
  const quote = "['\"`]";
  const optionalChain = "(?:\\?\\.)?"; // an optional "?."
  const [object, name] = method.includes(".") ? method.split(".") : [null, method];

  // ".invoices" then optional "?." before the "[".
  const objectPart = object ? `\\.${object}\\s*${optionalChain}\\s*` : "";

  // "Not right after customers / customers?." (only needed without an object).
  const guard =
    !object && ignoreCallsOn.length > 0
      ? `(?<!\\b(?:${ignoreCallsOn.join("|")})\\s*${optionalChain}\\s*)`
      : "";

  return `${guard}${objectPart}\\[\\s*${quote}${name}${quote}\\s*\\]\\s*${optionalChain}\\s*\\(`;
}
