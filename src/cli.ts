#!/usr/bin/env node
// Command-line entry point:  sundial scan <path>
//
// Exit codes (useful later for CI pipelines):
//   0 = scan finished, nothing deprecated found
//   1 = scan finished, deprecated usage found
//   2 = usage error or something went wrong

import { loadProviders } from "./deprecations";
import { scan } from "./scanner";
import { formatReport } from "./report";

const USAGE = `Usage: sundial scan <path>

Scans JavaScript/TypeScript files (and inline scripts in .html/.php pages)
under <path> for deprecated API usage. Providers are loaded from
data/providers/*.json.`;

function main(argv: string[]): number {
  const [command, target] = argv;

  if (command === "--help" || command === "-h" || command === "help") {
    console.log(USAGE);
    return 0;
  }

  if (command !== "scan" || !target) {
    console.error(USAGE);
    return 2;
  }

  try {
    // Every provider file in data/providers is loaded automatically.
    const providers = loadProviders();
    const deprecations = providers.flatMap((p) => p.deprecations);
    const result = scan(target, deprecations);
    console.log(formatReport(result, target, providers.map((p) => p.name)));
    return result.findings.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(`sundial: ${(err as Error).message}`);
    return 2;
  }
}

// process.argv is [node, script, ...args]; we only want the args.
process.exitCode = main(process.argv.slice(2));
