// Walks a folder, reads every JavaScript/TypeScript file (plus inline
// <script> blocks in .html/.htm/.php pages), and checks it
// against the deprecation patterns of every provider. Comments are removed first (see strip.ts),
// and each pattern runs over the whole file, so a call split across several
// lines (stripe.sources\n  .create(...)) is still found.

import * as fs from "fs";
import * as path from "path";
import type { Deprecation } from "./deprecations";
import { stripSource } from "./strip";
import { extractScripts, PAGE_EXTENSIONS } from "./html";

/** File extensions we treat as JS/TS source code. */
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);

/**
 * Folder names we never look inside: installed packages, build output,
 * caches and version-control data. None of it is code the user wrote.
 */
const SKIPPED_FOLDERS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".vercel",
  ".output",
]);

/** Minified files like app.min.js are generated, not hand-written. */
const MINIFIED_FILE = /\.min\.[cm]?js$/;

function isSourceFile(name: string): boolean {
  const ext = path.extname(name);
  return (SOURCE_EXTENSIONS.has(ext) || PAGE_EXTENSIONS.has(ext)) && !MINIFIED_FILE.test(name);
}

/** One place where a deprecated pattern was found. */
export interface Finding {
  file: string; // path relative to the folder that was scanned
  line: number; // 1-based line number
  code: string; // the matching line(s), trimmed and joined
  deprecation: Deprecation;
}

export interface ScanResult {
  findings: Finding[];
  filesScanned: number;
}

/** Scans a file or folder and returns every match. */
export function scan(target: string, deprecations: Deprecation[]): ScanResult {
  const root = path.resolve(target);
  const stats = fs.statSync(root); // throws a clear error if the path doesn't exist

  // If we were pointed at a single file, report paths relative to its folder.
  const baseDir = stats.isDirectory() ? root : path.dirname(root);
  const files = stats.isDirectory() ? listSourceFiles(root) : [root];

  const findings: Finding[] = [];
  for (const file of files) {
    findings.push(...scanFile(file, baseDir, deprecations));
  }

  return { findings, filesScanned: files.length };
}

/**
 * Recursively collects source files under `dir`, skipping ignored folders.
 * Results are sorted so the report order is stable from run to run.
 */
export function listSourceFiles(dir: string): string[] {
  const results: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Don't follow symlinks: they can point outside the project or loop forever.
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) {
        results.push(...listSourceFiles(fullPath));
      }
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/** Checks one file and returns its findings, sorted by line. */
function scanFile(filePath: string, baseDir: string, deprecations: Deprecation[]): Finding[] {
  const source = fs.readFileSync(filePath, "utf8");

  // For HTML/PHP pages, only the inline <script> blocks are JavaScript.
  // extractScripts keeps every character in place, so positions still line up.
  const isPage = PAGE_EXTENSIONS.has(path.extname(filePath));
  const stripped = stripSource(isPage ? extractScripts(source) : source);
  const lines = source.split(/\r?\n/);
  const codeLines = stripped.code.split(/\r?\n/); // same line count as `lines`
  const lineStarts = findLineStarts(source);
  const findings: Finding[] = [];

  // Some entries match generic names (like display_items) and only count in
  // files that mention their provider (e.g. "stripe"). Checked once per
  // provider on the raw text, so an import, comment or string counts.
  const mentions = new Map<string, boolean>();
  const mentionsProvider = (d: Deprecation) => {
    if (!mentions.has(d.provider.id)) mentions.set(d.provider.id, d.provider.mentionRegex.test(source));
    return mentions.get(d.provider.id)!;
  };

  for (const deprecation of deprecations) {
    if (deprecation.requireProviderMention && !mentionsProvider(deprecation)) continue;

    // Several patterns of one entry may hit the same line; report it once.
    const linesSeen = new Set<number>();

    const check = (regexes: RegExp[], text: string) => {
      for (const regex of regexes) {
        // matchAll finds every match in the whole file, across line breaks.
        for (const match of text.matchAll(regex)) {
          const start = match.index ?? 0;
          const firstLine = lineNumberAt(lineStarts, start);
          if (linesSeen.has(firstLine)) continue;
          linesSeen.add(firstLine);

          // For a multi-line match, show every line it covers, joined up.
          const lastLine = lineNumberAt(lineStarts, start + Math.max(match[0].length - 1, 0));

          // A chained call like "stripe\n  .redirectToCheckout(" starts its
          // line with a dot, so the object it's called on is on the line
          // above. Show that line too, so the report reads "stripe .redirectToCheckout(".
          let displayStart = firstLine;
          const before = stripped.code.slice(lineStarts[firstLine - 1], start);
          if (isChainContinuation(before, match[0])) {
            let prev = firstLine - 1;
            while (prev >= 1 && codeLines[prev - 1].trim() === "") prev--; // skip blank/comment-only lines
            if (prev >= 1) displayStart = prev;
          }

          // The object's line (if any), then the lines the match itself covers.
          const shown = lines.slice(firstLine - 1, lastLine);
          if (displayStart !== firstLine) shown.unshift(lines[displayStart - 1]);
          const code = shown.map((l) => l.trim()).join(" ");

          findings.push({ file: path.relative(baseDir, filePath), line: firstLine, code, deprecation });
        }
      }
    };

    check(deprecation.codeRegexes, stripped.code);
    check(deprecation.stringRegexes, stripped.codeWithStrings);
  }

  // Sort by line. Array.sort is stable, so entries on the same line keep data-file order.
  return findings.sort((a, b) => a.line - b.line);
}

/**
 * True when a match continues a chain from the previous line: the line holds
 * nothing before the match except an optional "." or "?.", and the match
 * starts with ".", "?." or "[".
 */
function isChainContinuation(before: string, matchText: string): boolean {
  const lead = before.trim();
  if (lead !== "" && lead !== "." && lead !== "?.") return false;
  return /^(\?\.|\.|\[)/.test(lead + matchText.trimStart());
}

/** Character position where each line starts (line 1 starts at 0). */
function findLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Converts a character position into a 1-based line number (binary search). */
function lineNumberAt(lineStarts: number[], position: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}
