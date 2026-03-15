import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureDir, getArgValue, hasFlag, sanitizeFileName } from "./utils.js";

const execFileAsync = promisify(execFile);

function printHelp() {
  console.log(`
Usage:
  npm run mermaid:render -- --dir ./student-project
  npm run mermaid:render -- --dir ./student-project --out-dir ./diagrams

Options:
  --dir            Root directory to scan for markdown files.
  --out-dir        Output root for rendered diagrams. Default: ./diagrams
  --format         Output format: svg or png. Default: svg
  --theme          Mermaid theme. Default: neutral
  --help           Show this help message.
  `);
}

async function collectMarkdownFiles(rootDir) {
  const results = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMarkdownFiles(fullPath)));
    } else if (entry.isFile() && fullPath.toLowerCase().endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function extractMermaidBlocks(markdown) {
  const blocks = [];
  const regex = /```mermaid\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const source = match[1].trim();
    if (source) {
      blocks.push(source);
    }
  }

  return blocks;
}

async function renderBlock({ source, outputFile, theme, tempDir }) {
  const inputFile = path.join(
    tempDir,
    `${path.basename(outputFile, path.extname(outputFile))}.mmd`
  );

  await fs.writeFile(inputFile, source, "utf8");

  await execFileAsync(
    "npx",
    [
      "mmdc",
      "-i",
      inputFile,
      "-o",
      outputFile,
      "-t",
      theme,
      "-b",
      "transparent",
      "-s",
      "2"
    ],
    {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024
    }
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, "--help")) {
    printHelp();
    return;
  }

  const dirArg = getArgValue(args, "--dir");
  if (!dirArg) {
    throw new Error("Missing required --dir argument.");
  }

  const sourceDir = path.resolve(dirArg);
  const outDir = path.resolve(getArgValue(args, "--out-dir", "./diagrams"));
  const format = getArgValue(args, "--format", "svg");
  const theme = getArgValue(args, "--theme", "neutral");
  const tempDir = path.join(outDir, ".tmp");

  const files = await collectMarkdownFiles(sourceDir);
  if (!files.length) {
    throw new Error(`No markdown files found in ${sourceDir}`);
  }

  await ensureDir(outDir);
  await ensureDir(tempDir);

  let renderedCount = 0;

  for (const file of files) {
    const markdown = await fs.readFile(file, "utf8");
    const blocks = extractMermaidBlocks(markdown);
    if (!blocks.length) {
      continue;
    }

    const relativeDir = path.relative(sourceDir, path.dirname(file));
    const baseName = sanitizeFileName(path.basename(file, ".md"), "diagram");
    const targetDir = path.join(outDir, relativeDir, `${baseName}-diagrams`);
    await ensureDir(targetDir);

    for (const [index, block] of blocks.entries()) {
      const outputFile = path.join(targetDir, `diagram-${index + 1}.${format}`);
      await renderBlock({
        source: block,
        outputFile,
        theme,
        tempDir
      });
      renderedCount += 1;
      console.log(`Rendered: ${outputFile}`);
    }
  }

  await fs.rm(tempDir, { recursive: true, force: true });

  if (!renderedCount) {
    console.log("No Mermaid blocks found.");
    return;
  }

  console.log(`Done. Rendered ${renderedCount} diagram(s).`);
}

main().catch((error) => {
  console.error("");
  console.error("Mermaid render failed.");
  console.error(error.message);
  process.exitCode = 1;
});
