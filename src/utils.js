import fs from "node:fs/promises";
import path from "node:path";

export function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .toLowerCase();
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function writeText(filePath, text) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, "utf8");
}

export function sanitizeFileName(value, fallback = "file") {
  const cleaned = String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();
  return cleaned || fallback;
}

export function parseCourseIds(args) {
  const ids = [];

  for (const arg of args) {
    if (arg.startsWith("--course=")) {
      ids.push(Number(arg.slice("--course=".length)));
    }
  }

  return ids.filter(Number.isFinite);
}

export function getArgValue(args, name, defaultValue = undefined) {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }

  return defaultValue;
}

export function hasFlag(args, name) {
  return args.includes(name);
}
