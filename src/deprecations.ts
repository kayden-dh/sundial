// Loads the list of known Stripe deprecations from the JSON data file,
// checks that each entry is well-formed, and turns the pattern strings
// into real regular expressions the scanner can use.

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
  replacement: string; // what to use instead
  removalDate: string | null; // YYYY-MM-DD, or null if Stripe hasn't said
  removedInVersion: string | null; // Stripe API version that removed it, if any
  sourceUrl: string; // official Stripe docs/changelog link
  note: string;
}

/** An entry plus its compiled regexes, ready for scanning. */
export interface Deprecation extends DeprecationEntry {
  codeRegexes: RegExp[];
  stringRegexes: RegExp[];
}

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
    if (!/^https:\/\/(docs\.)?stripe\.com\//.test(entry.sourceUrl)) {
      throw new Error(`${where}: sourceUrl must be an official https://stripe.com or https://docs.stripe.com link`);
    }

    // removalDate is optional, but if present it must look like a date.
    if (entry.removalDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.removalDate)) {
      throw new Error(`${where}: "removalDate" must be YYYY-MM-DD or null`);
    }

    const patterns = entry.patterns ?? [];
    const stringPatterns = entry.stringPatterns ?? [];
    if (!Array.isArray(patterns) || !Array.isArray(stringPatterns)) {
      throw new Error(`${where}: "patterns" and "stringPatterns" must be arrays`);
    }
    if (patterns.length + stringPatterns.length === 0) {
      throw new Error(`${where}: needs at least one entry in "patterns" or "stringPatterns"`);
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

    return {
      ...entry,
      removedInVersion: entry.removedInVersion ?? null,
      codeRegexes: patterns.map(compile),
      stringRegexes: stringPatterns.map(compile),
    };
  });
}
