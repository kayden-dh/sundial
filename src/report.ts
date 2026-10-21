// Turns scan results into readable text for the terminal.
// Kept separate from the scanner so we can add other formats (like JSON) later.

import type { ScanResult } from "./scanner";

/** Long lines are cut so the report stays readable. */
const MAX_CODE_LENGTH = 120;

/**
 * @param providerNames display names of the providers that were checked,
 *   e.g. ["Stripe"]. Shown in the header so it's clear what was scanned for.
 */
export function formatReport(result: ScanResult, target: string, providerNames: string[]): string {
  const { findings, filesScanned } = result;
  const out: string[] = [];

  out.push(`Sundial: scanned ${filesScanned} file(s) in ${target} for ${providerNames.join(", ")} deprecations`);
  out.push("");

  if (findings.length === 0) {
    out.push("No deprecated API usage found.");
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
      out.push(`    Provider:    ${d.provider.name}`);
      out.push(`    Deprecated:  ${d.deprecated}`);
      out.push(`    Use instead: ${d.replacement}`);
      out.push(`    Removed:     ${describeRemoval(d.removalDate, d.removedInVersion)}`);
      out.push(`    Docs:        ${d.sourceUrl}`);
      out.push(`    Rule:        ${d.id}`);
      out.push("");
    }
  }

  // Count findings per provider, in the order providers first appear.
  const perProvider = new Map<string, number>();
  for (const f of findings) {
    perProvider.set(f.deprecation.provider.name, (perProvider.get(f.deprecation.provider.name) ?? 0) + 1);
  }
  const breakdown = [...perProvider].map(([name, count]) => `${name}: ${count}`).join(", ");

  out.push(`Found ${findings.length} deprecated API usage(s) in ${byFile.size} file(s) (${breakdown}).`);
  return out.join("\n");
}

function describeRemoval(date: string | null, version: string | null): string {
  if (!date) return "no removal date announced yet";
  // Removals are often tied to API versions (e.g. Stripe's): accounts pinned
  // to an older version may still work, so say which version removed it.
  return version ? `${date} (API version ${version})` : date;
}

function truncate(text: string): string {
  return text.length > MAX_CODE_LENGTH ? text.slice(0, MAX_CODE_LENGTH - 1) + "…" : text;
}
