import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCatalogManifest } from "./manifest.js";
import { checkCatalogBalance } from "./catalog-balance.js";

function usage(): string {
  return [
    "usage: pnpm --filter @auracle/catalog catalog-balance-check [--goal <n>] [--report <path>] [--fail-on warn]",
    "",
    "  Validates catalog metadata balance for mood/scene retrieval and structured taste.",
    "  Thresholds scale with trackCount/goal (default goal=100).",
    "  --fail-on warn   exit 1 on warnings as well as failures",
  ].join("\n");
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const goal = Number(optionValue(args, "--goal") ?? "100");
  if (!Number.isFinite(goal) || goal < 1) throw new Error("--goal must be a positive number");

  const manifest = loadCatalogManifest();
  const report = checkCatalogBalance(manifest, { goal });
  const json = `${JSON.stringify(report, null, 2)}\n`;

  const reportPath = optionValue(args, "--report");
  if (reportPath) writeFileSync(resolve(reportPath), json);
  process.stdout.write(json);

  const failOnWarn = args.includes("--fail-on") && args[args.indexOf("--fail-on") + 1] === "warn";
  if (report.failed > 0 || (failOnWarn && report.warned > 0)) process.exitCode = 1;

  const levelIcon = { pass: "✓", warn: "⚠", fail: "✗" } as const;
  console.error(
    `\ncatalog-balance: ${report.trackCount} tracks (goal ${report.goal}) — ` +
      `${report.passed} pass, ${report.warned} warn, ${report.failed} fail`,
  );
  for (const c of report.checks.filter((x) => x.level !== "pass")) {
    console.error(`  ${levelIcon[c.level]} ${c.message}`);
  }
}

main();
