import fs from "node:fs/promises";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { ensureDir, getArgValue, hasFlag } from "./utils.js";

function printHelp() {
  console.log(`
Usage:
  npm run md:pptx -- --input ./slides.md
  npm run md:pptx -- --input ./slides.md --output ./slides.pptx
  npm run md:pptx -- --dir ./slides --out-dir ./presentations

Options:
  --input, -i       Path to one markdown file.
  --output, -o      Output .pptx path for single-file mode.
  --dir             Directory with markdown files.
  --out-dir         Output directory for directory mode.
  --all-md          Convert all markdown files, even non-slide docs.
  --signature       Footer signature. Default: "Выполнил: Нахатакян Артур"
  --help            Show this help.

Notes:
  Recommended slide markdown format:
  - optional frontmatter with marp: true
  - slide separator as line with three dashes: ---
  `);
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n");
}

function stripFrontmatter(markdown) {
  const md = normalizeLineEndings(markdown);
  if (!md.startsWith("---\n")) return md;

  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return md;
  return md.slice(end + 5);
}

function splitSlides(markdown) {
  const md = stripFrontmatter(markdown);
  return md
    .split(/\n-{3,}\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function looksLikeSlideDeck(markdown) {
  const md = normalizeLineEndings(markdown);
  if (/---[\s\S]*?\bmarp:\s*true\b[\s\S]*?---/i.test(md)) {
    return true;
  }
  return splitSlides(md).length > 1;
}

function cleanInlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function parseSlide(slideMarkdown) {
  const lines = normalizeLineEndings(slideMarkdown).split("\n");
  let title = "";
  let subtitle = "";
  const bullets = [];
  const paragraphs = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const h1 = line.match(/^#\s+(.+)/);
    if (h1) {
      title = cleanInlineMarkdown(h1[1]);
      continue;
    }

    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      subtitle = cleanInlineMarkdown(h2[1]);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)/) || line.match(/^\d+\.\s+(.+)/);
    if (bullet) {
      bullets.push(cleanInlineMarkdown(bullet[1]));
      continue;
    }

    paragraphs.push(cleanInlineMarkdown(line));
  }

  if (!title && paragraphs.length) {
    title = paragraphs.shift();
  }
  if (!subtitle && paragraphs.length) {
    subtitle = paragraphs.shift();
  }

  return { title, subtitle, bullets, paragraphs };
}

function addSlideContent(slide, parsed, signature) {
  const { title, subtitle, bullets, paragraphs } = parsed;

  // Header band
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.45,
    fill: { color: "F3F7FB" },
    line: { color: "F3F7FB" },
  });

  if (title) {
    slide.addText(title, {
      x: 0.7,
      y: 0.62,
      w: 12.0,
      h: 0.7,
      fontFace: "Calibri",
      fontSize: 30,
      bold: true,
      color: "0F172A",
      valign: "mid",
      fit: "shrink",
    });
  }

  let y = 1.45;

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.75,
      y,
      w: 11.9,
      h: 0.55,
      fontFace: "Calibri",
      fontSize: 18,
      color: "334155",
      valign: "mid",
      fit: "shrink",
    });
    y += 0.65;
  }

  for (const bullet of bullets) {
    slide.addText(`• ${bullet}`, {
      x: 0.95,
      y,
      w: 11.8,
      h: 0.45,
      fontFace: "Calibri",
      fontSize: 20,
      color: "111827",
      valign: "mid",
      fit: "shrink",
    });
    y += 0.5;
  }

  if (paragraphs.length) {
    const text = paragraphs.join("\n");
    slide.addText(text, {
      x: 0.95,
      y,
      w: 11.8,
      h: 2.2,
      fontFace: "Calibri",
      fontSize: 17,
      color: "111827",
      valign: "top",
      fit: "shrink",
    });
  }

  slide.addText(signature, {
    x: 8.6,
    y: 7.05,
    w: 4.5,
    h: 0.25,
    fontFace: "Calibri",
    fontSize: 9,
    color: "6B7280",
    align: "right",
  });
}

async function collectMarkdownFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath)));
    } else if (entry.isFile() && fullPath.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function convertFile(inputPath, outputPath, signature) {
  const markdown = await fs.readFile(inputPath, "utf8");
  const rawSlides = splitSlides(markdown);
  const slides = rawSlides.length ? rawSlides : [markdown];

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Nahatakyan Artur";
  pptx.company = "RGPU";
  pptx.subject = "Course presentation";
  pptx.title = path.basename(inputPath, path.extname(inputPath));
  pptx.lang = "ru-RU";

  for (const slideMarkdown of slides) {
    const slide = pptx.addSlide();
    const parsed = parseSlide(slideMarkdown);
    addSlideContent(slide, parsed, signature);
  }

  await ensureDir(path.dirname(outputPath));
  await pptx.writeFile({ fileName: outputPath });
}

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, "--help")) {
    printHelp();
    return;
  }

  const inputArg = getArgValue(args, "--input") || getArgValue(args, "-i");
  const dirArg = getArgValue(args, "--dir");
  const convertAllMd = hasFlag(args, "--all-md");
  const signature = getArgValue(args, "--signature", "Выполнил: Нахатакян Артур");

  if (!inputArg && !dirArg) {
    throw new Error("Provide either --input or --dir.");
  }

  if (inputArg) {
    const inputPath = path.resolve(inputArg);
    const outputPath = path.resolve(
      getArgValue(args, "--output") ||
        getArgValue(args, "-o") ||
        inputPath.replace(/\.md$/i, ".pptx")
    );

    await convertFile(inputPath, outputPath, signature);
    console.log(`PPTX created: ${outputPath}`);
    return;
  }

  const sourceDir = path.resolve(dirArg);
  const outDir = path.resolve(getArgValue(args, "--out-dir", sourceDir));
  const files = await collectMarkdownFiles(sourceDir);

  if (!files.length) {
    throw new Error(`No markdown files found in ${sourceDir}`);
  }

  let converted = 0;
  for (const file of files) {
    const markdown = await fs.readFile(file, "utf8");
    if (!convertAllMd && !looksLikeSlideDeck(markdown)) {
      continue;
    }

    const relativePath = path.relative(sourceDir, file);
    const outputPath = path.join(outDir, relativePath).replace(/\.md$/i, ".pptx");
    await convertFile(file, outputPath, signature);
    console.log(`PPTX created: ${outputPath}`);
    converted += 1;
  }

  if (!converted) {
    throw new Error(
      `No slide-like markdown files found in ${sourceDir}. Use --all-md to force conversion.`
    );
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});

