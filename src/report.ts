// Turns scan results into readable text for the terminal.
// Kept separate from the scanner so we can add other formats (like JSON) later.

import type { ScanResult } from "./scanner";

/** Long lines are cut so the report stays readable. */
const MAX_CODE_LENGTH = 120;

export function formatReport(result: ScanResult, target: string): string {
  const { findings, filesScanned } = result;
  const out: string[] = [];

  out.push(`Sundial: scanned ${filesScanned} file(s) in ${target}`);
  out.push("");

  if (findings.length === 0) {
    out.push("No deprecated Stripe usage found.");
    return out.join("\n");
  }

  // Group findings by file so each file name is printed once.
  const byFile = new Map<string, typeof findings>();
  for (const finding of findings) {
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }

  for (const [file, fileFindings] of byFile) {
    out.push(file);
    for (const f of fileFindings) {
      const d = f.deprecation;
      out.push(`  Line ${f.line}: ${truncate(f.code)}`);
      out.push(`    Deprecated:  ${d.deprecated}`);
      out.push(`    Use instead: ${d.replacement}`);
      out.push(`    Removed:     ${describeRemoval(d.removalDate, d.removedInVersion)}`);
      out.push(`    Docs:        ${d.sourceUrl}`);
      out.push(`    Rule:        ${d.id}`);
      out.push("");
    }
  }

  const fileCount = byFile.size;
  out.push(`Found ${findings.length} deprecated usage(s) in ${fileCount} file(s).`);
  return out.join("\n");
}

function describeRemoval(date: string | null, version: string | null): string {
  if (!date) return "no removal date announced yet";
  // Stripe removals are tied to API versions: accounts pinned to an older
  // version may still work, so say which version removed it.
  return version ? `${date} (API version ${version})` : date;
}

function truncate(text: string): string {
  return text.length > MAX_CODE_LENGTH ? text.slice(0, MAX_CODE_LENGTH - 1) + "…" : text;
}
