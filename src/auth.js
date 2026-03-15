import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import { ensureDir } from "./utils.js";

const BASE_URL = "https://moodle.herzen.spb.ru/";
const storageStatePath = path.resolve("./playwright/.auth/herzen.json");

async function main() {
  await ensureDir(path.dirname(storageStatePath));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  const rl = readline.createInterface({ input, output });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    console.log("");
    console.log("Browser opened for Moodle login.");
    console.log("1. Log in to Moodle in the opened window.");
    console.log("2. Open any course or make sure your dashboard is visible.");
    console.log("3. Return here and press Enter to save the session.");
    console.log("");

    await rl.question("Press Enter after the login is complete...");

    await context.storageState({ path: storageStatePath });

    console.log("");
    console.log(`Session saved to ${storageStatePath}`);
  } finally {
    rl.close();
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("");
  console.error("Auth failed.");
  console.error(error.message);
  process.exitCode = 1;
});
