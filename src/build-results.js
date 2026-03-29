import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, getArgValue, hasFlag } from "./utils.js";
import { convertMarkdownToPdf } from "./md-to-pdf.js";
import { convertMarkdownToPptx } from "./md-to-pptx.js";

function printHelp() {
  console.log(`
Usage:
  npm run build:results
  npm run build:results -- --source ./student-project --out-dir ./results

Options:
  --source         Source directory with markdown files. Default: ./student-project
  --out-dir        Output directory for generated files. Default: ./results
  --signature      Footer signature for PDF/PPTX. Default: "Выполнил: Нахатакян Артур"
  --format         PDF format for md:pdf. Default: A4
  --mermaid-theme  Mermaid theme for md:pdf. Default: neutral
  --help           Show this help message.

Rules:
  - If markdown starts with frontmatter containing "marp: true", it is converted to .pptx
  - Otherwise it is converted to .pdf
  - Directory structure relative to source is preserved in results/
  `);
}

async function collectMarkdownFiles(rootDir) {
  const results = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.toLowerCase().endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

function hasMarpFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return false;
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return false;
  }

  const frontmatter = normalized.slice(4, end);
  return /^\s*marp:\s*true\s*$/im.test(frontmatter);
}

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, "--help")) {
    printHelp();
    return;
  }

  const sourceDir = path.resolve(getArgValue(args, "--source", "./student-project"));
  const outDir = path.resolve(getArgValue(args, "--out-dir", "./results"));
  const signature = getArgValue(args, "--signature", "Выполнил: Нахатакян Артур");
  const format = getArgValue(args, "--format", "A4");
  const mermaidTheme = getArgValue(args, "--mermaid-theme", "neutral");

  const markdownFiles = await collectMarkdownFiles(sourceDir);

  if (!markdownFiles.length) {
    throw new Error(`No markdown files found in ${sourceDir}`);
  }

  let pdfCount = 0;
  let pptxCount = 0;

  for (const file of markdownFiles) {
    const content = await fs.readFile(file, "utf8");
    const relativePath = path.relative(sourceDir, file);
    const isMarp = hasMarpFrontmatter(content);
    const outputPath = path.join(
      outDir,
      relativePath.replace(/\.md$/i, isMarp ? ".pptx" : ".pdf")
    );

    await ensureDir(path.dirname(outputPath));

    if (isMarp) {
      await convertMarkdownToPptx(file, outputPath, signature);
      pptxCount += 1;
      console.log(`PPTX created: ${outputPath}`);
      continue;
    }

    await convertMarkdownToPdf(file, outputPath, {
      signature,
      format,
      mermaidTheme,
    });
    pdfCount += 1;
    console.log(`PDF created: ${outputPath}`);
  }

  console.log(`Done. PDF: ${pdfCount}, PPTX: ${pptxCount}, total: ${pdfCount + pptxCount}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
