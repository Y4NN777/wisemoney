// Renders a page in real Chrome and prints its visible text, then its links.
// Usage: node render.mjs <url> [--links] [--wait=ms] [--max=chars]
import { createRequire } from "node:module";
const require = createRequire("/home/aiobi6/Personal_Temp/projects/WiseMoney/apps/web/package.json");
const { chromium } = require("playwright-core");
const [url, ...flags] = process.argv.slice(2);
const opt = (name, fallback) => { const f = flags.find((x) => x.startsWith(`--${name}=`)); return f ? Number(f.split("=")[1]) : fallback; };
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const context = await browser.newContext({ locale: "fr-FR", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" });
const page = await context.newPage();
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(opt("wait", 1500));
  console.log(`# ${response?.status()} ${page.url()}\n# title: ${await page.title()}\n`);
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  console.log(text.replace(/\n{3,}/g, "\n\n").slice(0, opt("max", 20000)));
  if (flags.includes("--links")) {
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => `${(a.innerText || a.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 90)} -> ${a.href}`));
    console.log("\n# LINKS\n" + [...new Set(links)].filter((l) => !l.startsWith(" ->")).slice(0, 400).join("\n"));
  }
} catch (error) {
  console.log(`# ERROR ${String(error).split("\n")[0]}`);
} finally {
  await browser.close();
}
