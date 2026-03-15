import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { marked } from "marked";
import { ensureDir, getArgValue, hasFlag, sanitizeFileName } from "./utils.js";

const execFileAsync = promisify(execFile);

function printHelp() {
  console.log(`
Usage:
  npm run md:pdf -- --input ./file.md
  npm run md:pdf -- --input ./file.md --output ./file.pdf
  npm run md:pdf -- --dir ./student-project
  npm run md:pdf -- --dir ./student-project --out-dir ./pdfs

Options:
  --input, -i      Path to the source markdown file.
  --output, -o     Path to the target pdf file. Default: same name as input with .pdf
  --dir            Directory with markdown files to convert recursively.
  --out-dir        Output root for directory mode. Default: source directory.
  --format         PDF format. Default: A4
  --signature      Footer signature. Default: "Выполнил: Нахатакян Артур"
  --mermaid-theme  Mermaid theme. Default: neutral
  --help           Show this help message.
  `);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml({ title, content, signature }) {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --text: #1f2328;
        --muted: #59636e;
        --border: #d0d7de;
        --surface: #ffffff;
        --surface-soft: #f6f8fa;
        --accent: #0969da;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: var(--surface);
        color: var(--text);
        font-family: "SF Pro Text", "Segoe UI", system-ui, sans-serif;
        line-height: 1.55;
      }

      body {
        padding: 32px 40px;
      }

      main {
        max-width: 860px;
        margin: 0 auto;
      }

      .signature {
        margin-top: 40px;
        padding-top: 14px;
        border-top: 1px solid var(--border);
        font-weight: 600;
      }

      h1, h2, h3, h4, h5, h6 {
        line-height: 1.25;
        margin: 1.35em 0 0.6em;
        page-break-after: avoid;
      }

      h1, h2 {
        border-bottom: 1px solid var(--border);
        padding-bottom: 0.25em;
      }

      p, ul, ol, table, blockquote, pre {
        margin: 0 0 1em;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      code {
        font-family: "SFMono-Regular", "Menlo", "Consolas", monospace;
        background: var(--surface-soft);
        padding: 0.15em 0.35em;
        border-radius: 6px;
        font-size: 0.92em;
      }

      pre {
        background: var(--surface-soft);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 14px 16px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      pre code {
        background: transparent;
        padding: 0;
      }

      blockquote {
        margin-left: 0;
        padding: 0.2em 1em;
        color: var(--muted);
        border-left: 4px solid var(--border);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }

      th, td {
        border: 1px solid var(--border);
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: var(--surface-soft);
      }

      img {
        max-width: 100%;
      }

      hr {
        border: none;
        border-top: 1px solid var(--border);
        margin: 24px 0;
      }

      @page {
        margin: 18mm 14mm 18mm 14mm;
      }
    </style>
  </head>
  <body>
    <main>
      ${content}
      <div class="signature">${escapeHtml(signature)}</div>
    </main>
  </body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, "--help")) {
    printHelp();
    return;
  }

  const inputArg = getArgValue(args, "--input") || getArgValue(args, "-i");
  const dirArg = getArgValue(args, "--dir");
  const format = getArgValue(args, "--format", "A4");
  const signature = getArgValue(args, "--signature", "Выполнил: Нахатакян Артур");
  const mermaidTheme = getArgValue(args, "--mermaid-theme", "neutral");

  if (!inputArg && !dirArg) {
    throw new Error("Provide either --input or --dir.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    if (inputArg) {
      const inputPath = path.resolve(inputArg);
      const outputPath = path.resolve(
        getArgValue(args, "--output") ||
          getArgValue(args, "-o") ||
          inputPath.replace(/\.md$/i, ".pdf")
      );
      await renderFile(browser, inputPath, outputPath, format, signature, mermaidTheme);
      console.log(`PDF created: ${outputPath}`);
      return;
    }

    const sourceDir = path.resolve(dirArg);
    const outDir = path.resolve(getArgValue(args, "--out-dir", sourceDir));
    const files = await collectMarkdownFiles(sourceDir);

    if (!files.length) {
      throw new Error(`No markdown files found in ${sourceDir}`);
    }

    for (const file of files) {
      const relativePath = path.relative(sourceDir, file);
      const outputPath = path.join(outDir, relativePath).replace(/\.md$/i, ".pdf");
      await renderFile(browser, file, outputPath, format, signature, mermaidTheme);
      console.log(`PDF created: ${outputPath}`);
    }
  } finally {
    await browser.close();
  }
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

async function inlineLocalImages(html, inputPath) {
  const dir = path.dirname(inputPath);
  const imgRegex = /<img([^>]*)\bsrc="([^"]+)"([^>]*)>/gi;

  const replacements = [];
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const [full, before, src, after] = match;
    if (/^(https?:|data:)/i.test(src)) continue;
    const imgPath = path.resolve(dir, src);
    try {
      const data = await fs.readFile(imgPath);
      const ext = path.extname(imgPath).slice(1).toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const encoded = data.toString("base64");
      replacements.push({ full, replacement: `<img${before}src="data:${mime};base64,${encoded}"${after}>` });
    } catch {
      // skip if file not found
    }
  }

  let result = html;
  for (const { full, replacement } of replacements) {
    result = result.replace(full, replacement);
  }
  return result;
}

async function renderFile(browser, inputPath, outputPath, format, signature, mermaidTheme) {
  const markdown = await fs.readFile(inputPath, "utf8");
  const preparedMarkdown = await replaceMermaidBlocks(markdown, inputPath, mermaidTheme);
  const rawHtmlContent = marked.parse(preparedMarkdown, {
    gfm: true,
    breaks: false
  });
  const finalHtmlContent = await inlineLocalImages(rawHtmlContent, inputPath);
  const html = buildHtml({
    title: path.basename(inputPath),
    content: finalHtmlContent,
    signature
  });

  await ensureDir(path.dirname(outputPath));

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outputPath,
      format,
      printBackground: true,
      preferCSSPageSize: true
    });
  } finally {
    await page.close();
  }
}

async function replaceMermaidBlocks(markdown, inputPath, mermaidTheme) {
  const regex = /```mermaid\s*\n([\s\S]*?)```/g;
  const matches = Array.from(markdown.matchAll(regex));

  if (!matches.length) {
    return markdown;
  }

  const tempRoot = path.join(
    path.dirname(inputPath),
    ".tmp-mermaid",
    sanitizeFileName(path.basename(inputPath, ".md"), "doc")
  );
  await ensureDir(tempRoot);

  let result = markdown;

  for (const [index, match] of matches.entries()) {
    const source = match[1].trim();
    if (!source) {
      continue;
    }

    const svg = await renderMermaidToSvg({
      source,
      tempRoot,
      baseName: `diagram-${index + 1}`,
      mermaidTheme
    });

    const encodedSvg = Buffer.from(svg, "utf8").toString("base64");
    const imageHtml = `<p><img alt="Mermaid diagram" src="data:image/svg+xml;base64,${encodedSvg}" /></p>`;
    result = result.replace(match[0], imageHtml);
  }

  await fs.rm(tempRoot, { recursive: true, force: true });
  return result;
}

async function renderMermaidToSvg({ source, tempRoot, baseName, mermaidTheme }) {
  const inputFile = path.join(tempRoot, `${baseName}.mmd`);
  const outputFile = path.join(tempRoot, `${baseName}.svg`);

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
      mermaidTheme,
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

  return fs.readFile(outputFile, "utf8");
}

main().catch((error) => {
  console.error("");
  console.error("Markdown to PDF conversion failed.");
  console.error(error.message);
  process.exitCode = 1;
});
