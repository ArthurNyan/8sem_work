import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJson, writeText } from "./utils.js";

const exportsDir = path.resolve("./exports");
const reportsDir = path.resolve("./reports");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTitleAndBody(markdown, fallbackTitle = "Untitled") {
  const text = normalizeText(markdown);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const stateIndex = lines.findIndex((line) => line.startsWith("### Состояние ответа"));

  let title = fallbackTitle;
  let bodyLines = [];

  const headingLine = lines.find((line) => line.startsWith("## "));
  if (headingLine) {
    const headingText = headingLine.replace(/^##\s+/, "").trim();
    title = headingText || fallbackTitle;
  }

  const startIndex = headingLine ? lines.indexOf(headingLine) + 1 : 0;
  const endIndex = stateIndex >= 0 ? stateIndex : lines.length;

  for (const line of lines.slice(startIndex, endIndex)) {
    if (
      line.startsWith("### ") ||
      line === title ||
      line.startsWith("- Личный кабинет") ||
      line.startsWith("Личный кабинет") ||
      line.startsWith("Домашняя страница")
    ) {
      continue;
    }

    if (line.length < 2) continue;
    bodyLines.push(line);
  }

  const dedupedBody = [];
  for (const line of bodyLines) {
    if (dedupedBody[dedupedBody.length - 1] !== line) {
      dedupedBody.push(line);
    }
  }

  return {
    extractedTitle: title,
    description: dedupedBody.slice(0, 8).join("\n")
  };
}

function inferCourseTitle(course) {
  const firstSection = course.sections?.[0];
  if (
    course.title &&
    !/^course-\d+$/.test(course.title)
  ) {
    return course.title;
  }

  if (firstSection?.activities?.length) {
    const firstRich = firstSection.activities.find((activity) => activity.title && !activity.title.startsWith("activity-"));
    if (firstRich) {
      return `${course.id}`;
    }
  }

  return `${course.id}`;
}

async function collectCourses() {
  const entries = await fs.readdir(exportsDir, { withFileTypes: true });
  const courseDirs = entries.filter((entry) => entry.isDirectory());
  const courses = [];

  for (const entry of courseDirs) {
    const courseJsonPath = path.join(exportsDir, entry.name, "course.json");
    if (!(await pathExists(courseJsonPath))) continue;
    const course = await readJson(courseJsonPath);
    courses.push({
      dirName: entry.name,
      dirPath: path.join(exportsDir, entry.name),
      data: course
    });
  }

  return courses.sort((a, b) => a.data.id - b.data.id);
}

async function buildAssignmentsIndex(courses) {
  const assignments = [];
  const coursesSummary = [];

  for (const courseEntry of courses) {
    const { data: course, dirPath } = courseEntry;
    let totalActivities = 0;
    let totalAssignments = 0;

    for (const section of course.sections || []) {
      for (const activity of section.activities || []) {
        totalActivities += 1;
        const type = String(activity.type || "").toLowerCase();
        const isAssignment =
          type.includes("assign") ||
          /задание|практическая работа|лабораторн|иср|вср|инвариант|вариатив/i.test(activity.title || "");

        if (!isAssignment) continue;

        totalAssignments += 1;
        const activityDirs = await fs.readdir(path.join(dirPath, "activities"), { withFileTypes: true }).catch(() => []);
        const matchingDir = activityDirs.find((entry) => entry.isDirectory() && entry.name.includes(path.basename(activity.url || "").replace(/\D+/g, "")) );

        let pagePath = null;
        if (await pathExists(path.join(dirPath, "activities"))) {
          const directEntries = await fs.readdir(path.join(dirPath, "activities"), { withFileTypes: true });
          const byTitle = directEntries.find(
            (entry) => entry.isDirectory() && activity.title && entry.name.includes(activity.title.slice(0, 12).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-"))
          );
          const selected = matchingDir || byTitle;
          if (selected) {
            const candidate = path.join(dirPath, "activities", selected.name, "page.md");
            if (await pathExists(candidate)) pagePath = candidate;
          }
        }

        let extractedTitle = activity.title;
        let description = "";

        if (pagePath) {
          const markdown = await readText(pagePath);
          const extracted = extractTitleAndBody(markdown, activity.title);
          extractedTitle = extracted.extractedTitle;
          description = extracted.description;
        }

        assignments.push({
          courseId: course.id,
          courseTitle: inferCourseTitle(course),
          sectionIndex: section.index,
          sectionTitle: section.title,
          activityIndex: activity.index,
          activityTitle: activity.title,
          extractedTitle,
          type: activity.type,
          url: activity.url,
          description,
          exportedAt: activity.exportedAt || null
        });
      }
    }

    coursesSummary.push({
      courseId: course.id,
      courseTitle: inferCourseTitle(course),
      sections: course.sections?.length || 0,
      activities: totalActivities,
      assignments: totalAssignments
    });
  }

  assignments.sort((a, b) => {
    return (
      a.courseId - b.courseId ||
      a.sectionIndex - b.sectionIndex ||
      a.activityIndex - b.activityIndex
    );
  });

  return { assignments, coursesSummary };
}

function toMarkdownReport(coursesSummary, assignments) {
  const lines = [];
  lines.push("# Moodle Export Analysis");
  lines.push("");
  lines.push("## Courses");
  lines.push("");

  for (const course of coursesSummary) {
    lines.push(
      `- ${course.courseId}: activities=${course.activities}, assignments=${course.assignments}`
    );
  }

  lines.push("");
  lines.push("## Assignments");
  lines.push("");

  for (const item of assignments) {
    lines.push(`### ${item.courseId} :: ${item.activityTitle}`);
    lines.push(`- Section: ${item.sectionTitle}`);
    lines.push(`- Type: ${item.type}`);
    if (item.description) {
      lines.push("- Description:");
      lines.push(item.description);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const courses = await collectCourses();

  if (!courses.length) {
    throw new Error("No exported courses found in ./exports");
  }

  const { assignments, coursesSummary } = await buildAssignmentsIndex(courses);
  await ensureDir(reportsDir);

  await writeJson(path.join(reportsDir, "courses-summary.json"), coursesSummary);
  await writeJson(path.join(reportsDir, "assignments.json"), assignments);
  await writeText(
    path.join(reportsDir, "assignments.md"),
    toMarkdownReport(coursesSummary, assignments)
  );

  console.log(`Courses analyzed: ${coursesSummary.length}`);
  console.log(`Assignments indexed: ${assignments.length}`);
  console.log(`Reports saved to ${reportsDir}`);
}

main().catch((error) => {
  console.error("");
  console.error("Analyze failed.");
  console.error(error.message);
  process.exitCode = 1;
});
