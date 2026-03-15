import path from "node:path";
import { runExport } from "./exporter.js";
import { getArgValue, hasFlag, parseCourseIds } from "./utils.js";

function printHelp() {
  console.log(`
Usage:
  npm run export -- --course=6086 --course=6087

Options:
  --course=<id>                 Moodle course ID. Repeat for multiple courses.
  --output=<dir>                Output directory. Default: ./exports
  --storage=<path>              Playwright storage state. Default: ./playwright/.auth/herzen.json
  --no-downloads                Skip attached file downloads and keep page snapshots only.
  --headed                      Run browser in visible mode.
  --help                        Show this help message.

Example auth flow:
  npm run auth
  npm run export -- --course=6086 --course=6087
  `);
}

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, "--help")) {
    printHelp();
    return;
  }

  const courseIds = parseCourseIds(args);
  const outputDir = path.resolve(getArgValue(args, "--output", "./exports"));
  const storageStatePath = path.resolve(
    getArgValue(args, "--storage", "./playwright/.auth/herzen.json")
  );
  const downloadFiles = !hasFlag(args, "--no-downloads");
  const headless = !hasFlag(args, "--headed");

  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Export started for courses: ${courseIds.join(", ")}`);
  console.log(`Storage state: ${storageStatePath}`);
  console.log(`Output dir: ${outputDir}`);

  const results = await runExport({
    courseIds,
    outputDir,
    storageStatePath,
    downloadFiles,
    headless
  });

  console.log("");
  console.log("Export completed:");
  for (const result of results) {
    console.log(`- ${result.id}: ${result.title}`);
  }
}

main().catch((error) => {
  console.error("");
  console.error("Export failed.");
  console.error(error.message);
  process.exitCode = 1;
});
