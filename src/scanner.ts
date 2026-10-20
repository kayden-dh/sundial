// Walks a folder, reads every JavaScript/TypeScript file, and checks each
// line against the deprecation patterns. This is plain text matching: fast
// and easy to understand, but it can't tell code from comments or strings.

import * as fs from "fs";
import * as path from "path";
import type { Deprecation } from "./deprecations";

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

/** One place where a deprecated pattern was found. */
export interface Finding {
  file: string; // path relative to the folder that was scanned
  line: number; // 1-based line number
  code: string; // the matching line, trimmed
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
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

/** Checks one file line by line. */
function scanFile(filePath: string, baseDir: string, deprecations: Deprecation[]): Finding[] {
  const findings: Finding[] = [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach((text, index) => {
    for (const deprecation of deprecations) {
      // An entry can have several patterns; report it at most once per line.
      if (deprecation.regexes.some((regex) => regex.test(text))) {
        findings.push({
          file: path.relative(baseDir, filePath),
          line: index + 1,
          code: text.trim(),
          deprecation,
        });
      }
    }
  });

  return findings;
}
