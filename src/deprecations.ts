// Loads every provider file in data/providers/ (stripe.json, ...), checks the
// provider settings and each deprecation entry, and turns the pattern strings
// into real regular expressions the scanner can use. It also generates the
// bracket-call patterns (client["methodName"](...)) from each entry's `methods`.
//
// Adding a new API later only means adding a new JSON file to that folder.

import * as fs from "fs";
import * as path from "path";

/** The "provider" block at the top of a provider file. */
export interface ProviderSettings {
  id: string; // short kebab-case name, also the file name: stripe -> stripe.json
  name: string; // display name used in reports, e.g. "Stripe"
  // Words that count as a mention of this provider in a file (any case).
  // Used by entries with requireProviderMention.
  mentionWords: string[];
  // Where sourceUrl links may point: a domain ("docs.stripe.com"), optionally
  // followed by a path prefix ("github.com/stripe" = Stripe's GitHub org).
  officialSources: string[];
}

/** A loaded provider: its settings plus a ready-made mention regex. */
export interface ProviderInfo extends ProviderSettings {
  mentionRegex: RegExp;
}

/** One deprecation entry as it is written in a provider file. */
export interface DeprecationEntry {
  id: string;
  deprecated: string; // what is deprecated, in plain words
  // Regular expressions (as strings). `patterns` are checked against code with
  // comments AND string contents removed: use them for method calls.
  // `stringPatterns` are checked against code with only comments removed:
  // use them when the deprecated thing lives inside a string (URLs, names).
  patterns?: string[];
  stringPatterns?: string[];
  // Method names this entry covers, e.g. "handleCardPayment", or
  // "invoices.retrieveUpcoming" when the call must be on a specific object.
  // Used to generate bracket-call patterns like stripe["handleCardPayment"](...).
  methods?: string[];
  // Objects whose same-named methods are NOT deprecated, e.g. ["customers"]
  // so stripe.customers["createSource"](...) isn't flagged.
  ignoreCallsOn?: string[];
  // When true, only report matches in files that contain one of the
  // provider's mentionWords. For generic names like display_items.
  requireProviderMention?: boolean;
  replacement: string; // what to use instead
  removalDate: string | null; // YYYY-MM-DD, or null if the provider hasn't said
  removedInVersion: string | null; // API version that removed it, if any
  sourceUrl: string; // official link, checked against provider.officialSources
  note: string;
}

/** An entry plus its provider and compiled regexes, ready for scanning. */
export interface Deprecation extends DeprecationEntry {
  provider: ProviderInfo;
  codeRegexes: RegExp[];
  stringRegexes: RegExp[]; // includes the generated bracket-call patterns
  requireProviderMention: boolean;
}

/** A provider with all of its deprecations. */
export interface Provider extends ProviderInfo {
  file: string;
  deprecations: Deprecation[];
}

/** A JavaScript identifier, e.g. handleCardPayment or $foo. */
const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const METHOD_NAME = new RegExp(`^(${IDENTIFIER}\\.)?${IDENTIFIER}$`);
const OBJECT_NAME = new RegExp(`^${IDENTIFIER}$`);

const PROVIDER_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// "docs.stripe.com" or "github.com/stripe": a host, then optional /path parts.
const SOURCE_PREFIX = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[A-Za-z0-9._-]+)*$/i;

/**
 * Default folder of provider files. When compiled, this code lives in dist/,
 * so the data folder is one level up.
 */
export const DEFAULT_PROVIDERS_DIR = path.join(__dirname, "..", "data", "providers");

/** All deprecations from every provider, in file then entry order. */
export function loadDeprecations(dir = DEFAULT_PROVIDERS_DIR): Deprecation[] {
  return loadProviders(dir).flatMap((provider) => provider.deprecations);
}

/**
 * Reads and validates every *.json file in `dir`, sorted by file name.
 * Throws an Error with a clear message if anything is wrong, so a typo in
 * the JSON is caught immediately instead of silently matching nothing.
 */
export function loadProviders(dir = DEFAULT_PROVIDERS_DIR): Provider[] {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`${dir}: no provider files (*.json) found`);
  }

  // Deprecation ids appear in reports, so they must be unique across providers.
  const seenIds = new Set<string>();
  return files.map((name) => loadProviderFile(path.join(dir, name), seenIds));
}

function loadProviderFile(filePath: string, seenIds: Set<string>): Provider {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed.provider !== "object" || !Array.isArray(parsed.deprecations)) {
    throw new Error(`${filePath}: expected an object with a "provider" block and a "deprecations" array`);
  }

  const provider = validateProvider(parsed.provider, filePath);
  const deprecations = parsed.deprecations.map((entry: DeprecationEntry, index: number) =>
    compileEntry(entry, provider, `${filePath}, entry #${index + 1} (${entry.id ?? "no id"})`, seenIds)
  );
  return { ...provider, file: filePath, deprecations };
}

/** Checks the provider block and builds its mention regex. */
function validateProvider(settings: ProviderSettings, filePath: string): ProviderInfo {
  const where = `${filePath}, provider block`;

  if (typeof settings.id !== "string" || !PROVIDER_ID.test(settings.id)) {
    throw new Error(`${where}: "id" must be a kebab-case name like "stripe"`);
  }
  // One predictable place per provider: stripe -> stripe.json.
  if (path.basename(filePath) !== `${settings.id}.json`) {
    throw new Error(`${where}: provider "${settings.id}" must live in ${settings.id}.json`);
  }
  if (typeof settings.name !== "string" || settings.name.trim() === "") {
    throw new Error(`${where}: "name" must be a non-empty string`);
  }
  for (const field of ["mentionWords", "officialSources"] as const) {
    const list = settings[field];
    if (!Array.isArray(list) || list.length === 0 || list.some((x) => typeof x !== "string" || x.trim() === "")) {
      throw new Error(`${where}: "${field}" must be a non-empty array of non-empty strings`);
    }
  }
  for (const source of settings.officialSources) {
    if (!SOURCE_PREFIX.test(source)) {
      throw new Error(`${where}: officialSources entry ${JSON.stringify(source)} must look like "docs.example.com" or "github.com/example" (no https://)`);
    }
  }

  // "stripe" -> /stripe/i. Words are escaped so a "." in one is literal.
  const mentionRegex = new RegExp(settings.mentionWords.map(escapeRegExp).join("|"), "i");
  return {
    id: settings.id,
    name: settings.name,
    mentionWords: settings.mentionWords,
    officialSources: settings.officialSources,
    mentionRegex,
  };
}

/** Checks one deprecation entry and compiles its patterns. */
function compileEntry(
  entry: DeprecationEntry,
  provider: ProviderInfo,
  where: string,
  seenIds: Set<string>
): Deprecation {
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

  // We only trust the provider's official sources.
  if (!isOfficialSource(entry.sourceUrl, provider.officialSources)) {
    throw new Error(
      `${where}: sourceUrl must be an https link on one of ${provider.name}'s official sources: ${provider.officialSources.join(", ")}`
    );
  }

  if (entry.requireProviderMention !== undefined && typeof entry.requireProviderMention !== "boolean") {
    throw new Error(`${where}: "requireProviderMention" must be true or false`);
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
    provider,
    removedInVersion: entry.removedInVersion ?? null,
    requireProviderMention: entry.requireProviderMention ?? false,
    codeRegexes: patterns.map(compile),
    stringRegexes: [...stringPatterns, ...bracketPatterns].map(compile),
  };
}

/**
 * True if `url` is an https link on one of `officialSources`.
 *
 *   "docs.stripe.com"    allows https://docs.stripe.com/anything (exact host)
 *   "github.com/stripe"  allows https://github.com/stripe/... but NOT
 *                        https://github.com/stripe-evil/... (whole path parts)
 */
export function isOfficialSource(url: string, officialSources: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;

  return officialSources.some((source) => {
    const [host, ...pathParts] = source.toLowerCase().split("/");
    if (parsed.hostname !== host) return false;
    if (pathParts.length === 0) return true;
    const prefix = "/" + pathParts.join("/");
    const pathname = parsed.pathname.toLowerCase();
    return pathname === prefix || pathname.startsWith(prefix + "/");
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
