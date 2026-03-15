import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  ensureDir,
  sanitizeFileName,
  slugify,
  writeJson,
  writeText
} from "./utils.js";

const BASE_URL = "https://moodle.herzen.spb.ru";

async function pageToMarkdown(page) {
  return page.evaluate(() => {
    const blocks = [];
    const root = document.querySelector("#region-main, main, body");
    const elements = root ? Array.from(root.querySelectorAll("h1, h2, h3, h4, p, li")) : [];

    for (const element of elements) {
      const text = element.textContent?.trim();
      if (!text) continue;

      if (element.matches("h1")) blocks.push(`# ${text}`);
      else if (element.matches("h2")) blocks.push(`## ${text}`);
      else if (element.matches("h3")) blocks.push(`### ${text}`);
      else if (element.matches("h4")) blocks.push(`#### ${text}`);
      else if (element.matches("li")) blocks.push(`- ${text}`);
      else blocks.push(text);
    }

    return blocks.join("\n\n");
  });
}

async function collectCourseSections(page) {
  return page.evaluate(() => {
    const sectionNodes = Array.from(
      document.querySelectorAll("[data-for='section'], li.section.main")
    );

    return sectionNodes.map((section, sectionIndex) => {
      const titleNode =
        section.querySelector("[data-for='section_title']") ||
        section.querySelector(".sectionname") ||
        section.querySelector("h3");

      const summaryNode =
        section.querySelector("[data-for='section_summary']") ||
        section.querySelector(".summary");

      const activityNodes = Array.from(
        section.querySelectorAll("li.activity, [data-for='cmitem']")
      );

      const activities = activityNodes.map((activity, activityIndex) => {
        const anchor = activity.querySelector("a[href*='/mod/'], a[href*='/course/']");
        const nameNode =
          activity.querySelector(".activityname") ||
          activity.querySelector("[data-region='activity-title']") ||
          anchor;
        const typeNode = activity.querySelector(".activityiconcontainer img");

        return {
          index: activityIndex + 1,
          title: nameNode?.textContent?.trim() || `activity-${activityIndex + 1}`,
          url: anchor?.href || null,
          type:
            typeNode?.getAttribute("alt")?.trim() ||
            activity.getAttribute("data-activityname") ||
            "activity"
        };
      });

      return {
        index: sectionIndex + 1,
        title: titleNode?.textContent?.trim() || `section-${sectionIndex + 1}`,
        summaryHtml: summaryNode?.innerHTML?.trim() || "",
        activities
      };
    });
  });
}

async function collectResourceLinks(page) {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    return anchors
      .map((anchor) => ({
        href: anchor.href,
        text: anchor.textContent?.trim() || anchor.getAttribute("title") || "link"
      }))
      .filter(({ href }) => {
        return (
          href.includes("/pluginfile.php/") ||
          href.includes("/draftfile.php/") ||
          href.includes("/mod/resource/") ||
          href.includes("/mod/folder/")
        );
      });
  });
}

async function savePageSnapshot(page, targetDir, name) {
  const html = await page.content();
  const markdown = await pageToMarkdown(page);

  await writeText(path.join(targetDir, `${name}.html`), html);
  await writeText(path.join(targetDir, `${name}.md`), markdown);
}

async function downloadLinks(context, links, targetDir) {
  const downloaded = [];

  for (const link of links) {
    const page = await context.newPage();
    const safeName = sanitizeFileName(link.text, "resource");

    try {
      const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
      await page.goto(link.href, { waitUntil: "domcontentloaded" });
      const download = await downloadPromise;

      if (download) {
        const suggestedName = sanitizeFileName(download.suggestedFilename(), safeName);
        const filePath = path.join(targetDir, suggestedName);
        await ensureDir(targetDir);
        await download.saveAs(filePath);
        downloaded.push({
          title: link.text,
          sourceUrl: link.href,
          savedAs: path.basename(filePath)
        });
      } else {
        downloaded.push({
          title: link.text,
          sourceUrl: link.href,
          savedAs: null,
          note: "No download event detected"
        });
      }
    } catch (error) {
      downloaded.push({
        title: link.text,
        sourceUrl: link.href,
        savedAs: null,
        error: error.message
      });
    } finally {
      await page.close();
    }
  }

  return downloaded;
}

async function exportActivity(context, activity, activitiesDir, options) {
  if (!activity.url) {
    return {
      ...activity,
      exported: false,
      reason: "Missing URL"
    };
  }

  const page = await context.newPage();
  const activitySlug = `${String(activity.index).padStart(2, "0")}-${slugify(activity.title) || "activity"}`;
  const activityDir = path.join(activitiesDir, activitySlug);

  try {
    await page.goto(activity.url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await ensureDir(activityDir);
    await savePageSnapshot(page, activityDir, "page");

    const links = options.downloadFiles ? await collectResourceLinks(page) : [];
    const downloads = options.downloadFiles
      ? await downloadLinks(context, links, path.join(activityDir, "files"))
      : [];

    const metadata = {
      ...activity,
      exportedAt: new Date().toISOString(),
      downloads
    };

    await writeJson(path.join(activityDir, "metadata.json"), metadata);
    return metadata;
  } catch (error) {
    const metadata = {
      ...activity,
      exportedAt: new Date().toISOString(),
      error: error.message
    };
    await writeJson(path.join(activityDir, "metadata.json"), metadata);
    return metadata;
  } finally {
    await page.close();
  }
}

async function exportCourse(context, courseId, outputDir, options) {
  const page = await context.newPage();
  const courseUrl = `${BASE_URL}/course/view.php?id=${courseId}`;

  try {
    await page.goto(courseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    const loginRequired = await page
      .locator("form input[name='username'], form#login")
      .count()
      .then((count) => count > 0);

    if (loginRequired) {
      throw new Error("Authentication required. Create a Playwright storage state first.");
    }

    const title =
      (await page.locator("h1").first().textContent().catch(() => null))?.trim() ||
      `course-${courseId}`;
    const courseSlug = `${courseId}-${slugify(title) || `course-${courseId}`}`;
    const courseDir = path.join(outputDir, courseSlug);
    const activitiesDir = path.join(courseDir, "activities");

    await ensureDir(courseDir);
    await savePageSnapshot(page, courseDir, "course");

    const sections = await collectCourseSections(page);
    const resources = options.downloadFiles ? await collectResourceLinks(page) : [];
    const rootDownloads = options.downloadFiles
      ? await downloadLinks(context, resources, path.join(courseDir, "files"))
      : [];

    const exportedSections = [];
    for (const section of sections) {
      const exportedActivities = [];

      for (const activity of section.activities) {
        const exported = await exportActivity(context, activity, activitiesDir, options);
        exportedActivities.push(exported);
      }

      exportedSections.push({
        ...section,
        activities: exportedActivities
      });
    }

    const metadata = {
      id: courseId,
      title,
      url: courseUrl,
      exportedAt: new Date().toISOString(),
      sections: exportedSections,
      rootDownloads
    };

    await writeJson(path.join(courseDir, "course.json"), metadata);
    return metadata;
  } finally {
    await page.close();
  }
}

export async function runExport({
  courseIds,
  outputDir,
  storageStatePath,
  downloadFiles = true,
  headless = true
}) {
  if (!courseIds.length) {
    throw new Error("No course IDs provided.");
  }

  await fs.access(storageStatePath);
  await ensureDir(outputDir);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    storageState: storageStatePath,
    acceptDownloads: true
  });

  const results = [];

  try {
    for (const courseId of courseIds) {
      const result = await exportCourse(context, courseId, outputDir, { downloadFiles });
      results.push(result);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  await writeJson(path.join(outputDir, "index.json"), {
    exportedAt: new Date().toISOString(),
    courses: results.map((course) => ({
      id: course.id,
      title: course.title,
      url: course.url
    }))
  });

  return results;
}
