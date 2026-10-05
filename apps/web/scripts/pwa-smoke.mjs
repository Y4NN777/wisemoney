import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.WISEMONEY_SMOKE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.WISEMONEY_SMOKE_OUTPUT ?? "/tmp/wisemoney-playwright";
const smokeDate = new Date();
const smokeMonthName = smokeDate.toLocaleDateString("en", { month: "long" });
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});

try {
  const migrationContext = await browser.newContext();
  const migrationPage = await migrationContext.newPage();
  await migrationPage.goto(`${baseURL}/logo.svg`);
  await migrationPage.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("WiseMoney");
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("WiseMoney", 4);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of [
          "financialEvents", "accounts", "transactions", "categories", "budgets",
          "goals", "goalContributions", "recurringItems", "financialStateSnapshot",
          "fxRates", "keyMeta", "byoProviderKeys", "authSession",
        ]) {
          database.createObjectStore(name, { keyPath: "id" });
        }
        request.transaction.objectStore("financialEvents").put({ id: "migration-marker" });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve(undefined);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await migrationPage.goto(baseURL, { waitUntil: "networkidle" });
  const migratedDatabase = await migrationPage.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open("WiseMoney");
      request.onsuccess = () => {
        const database = request.result;
        const stores = [...database.objectStoreNames];
        const transaction = database.transaction("financialEvents", "readonly");
        const markerRequest = transaction.objectStore("financialEvents").get("migration-marker");
        markerRequest.onsuccess = () => {
          resolve({ version: database.version, stores, marker: markerRequest.result?.id ?? null });
          database.close();
        };
        markerRequest.onerror = () => reject(markerRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  // Dexie stores schema version N as native IndexedDB version N * 10.
  assert.equal(migratedDatabase.version, 60);
  assert.equal(migratedDatabase.marker, "migration-marker");
  assert.ok(migratedDatabase.stores.includes("appSettings"), "appSettings missing after v6 migration");
  for (const removedStore of [
    "accounts", "transactions", "categories", "budgets", "goals",
    "goalContributions", "recurringItems",
  ]) {
    assert.ok(!migratedDatabase.stores.includes(removedStore), `${removedStore} survived v5 migration`);
  }
  await migrationContext.close();

  const reducedMotionContext = await browser.newContext({ reducedMotion: "reduce" });
  const reducedMotionPage = await reducedMotionContext.newPage();
  // The setup card plays an entrance animation; with reduced motion it must not.
  await reducedMotionPage.goto(baseURL, { waitUntil: "networkidle" });
  await reducedMotionPage.getByRole("button", { name: "Start", exact: true }).last().click();
  const entranceAnimation = await reducedMotionPage.locator("main .metric-surface").first().evaluate((element) =>
    getComputedStyle(element).animationName);
  assert.equal(entranceAnimation, "none", "reduced motion did not stop the entrance animation");
  await reducedMotionContext.close();

  for (const device of [
    { name: "desktop", viewport: { width: 1440, height: 1000 } },
    { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
    // iPhone 12 mini: the narrowest current iPhone (Y4NN's device, 2026-09-24).
    { name: "mini", viewport: { width: 375, height: 812 }, isMobile: true },
  ]) {
    const context = await browser.newContext({
      viewport: device.viewport,
      isMobile: device.isMobile ?? false,
      serviceWorkers: "allow",
    });
    const page = await context.newPage();
    const errors = [];
    let offline = false;
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !(offline && message.text().includes("ERR_INTERNET_DISCONNECTED"))
      ) {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on("requestfailed", (request) => {
      if (!offline && request.url().startsWith(baseURL)) {
        errors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`);
      }
    });

    const response = await page.goto(baseURL, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, `${device.name}: home did not return 200`);
    await page.waitForFunction(() => !document.body.innerText.includes("Loading"), undefined, { timeout: 10_000 });
    await page.getByRole("heading", { name: /Manage your money\. Stay in control\./i }).waitFor();
    await page.evaluate(() => localStorage.setItem("wisemoney.theme.preference.v1", "dark"));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Manage your money\. Stay in control\./i }).waitFor();
    const darkLandingBackground = await page.locator(".landing-grid").evaluate((element) =>
      getComputedStyle(element).backgroundImage);
    assert.match(darkLandingBackground, /rgba\(22, 48, 58/,
      `${device.name}: landing still uses the light theme glow in dark mode`);
    assert.doesNotMatch(darkLandingBackground, /rgba\(237, 241, 255/,
      `${device.name}: light landing glow leaked into dark mode`);
    const darkPrimaryAction = await page.getByRole("button", { name: "Start", exact: true }).last().evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, foreground: style.color };
    });
    assert.deepEqual(darkPrimaryAction, { background: "rgb(0, 119, 182)", foreground: "rgb(255, 255, 255)" },
      `${device.name}: dark theme primary action drifted from WiseMoney blue`);
    const darkLanguageIcon = await page.getByRole("combobox", { name: /^Choose language/ })
      .locator("svg").first().evaluate((element) => getComputedStyle(element).color);
    assert.equal(darkLanguageIcon, "rgb(0, 119, 182)",
      `${device.name}: language switcher drifted from WiseMoney blue`);
    await page.screenshot({ path: `${outputDir}/${device.name}-landing-dark.png`, fullPage: true });
    await page.evaluate(() => localStorage.setItem("wisemoney.theme.preference.v1", "light"));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Manage your money\. Stay in control\./i }).waitFor();
    await page.getByRole("button", { name: "Open help", exact: true }).click();
    await page.getByRole("heading", { name: "WiseMoney guide", exact: true }).waitFor();
    await page.getByRole("button", { name: device.name === "mobile" ? "Ask WiseBot" : "Open WiseBot", exact: true }).click();
    const wiseBotDialog = page.getByRole("dialog", { name: "WiseBot", exact: true });
    await wiseBotDialog.waitFor();
    const wiseBotOverlay = page.locator(".wisebot-overlay");
    await wiseBotOverlay.waitFor();
    const wiseBotMotion = await wiseBotDialog.evaluate((element) => ({
      animation: getComputedStyle(element).animationName,
      overlayBlur: getComputedStyle(document.querySelector(".wisebot-overlay")).backdropFilter,
    }));
    assert.equal(wiseBotMotion.animation, "wisebot-panel-in", `${device.name}: WiseBot panel has no entrance motion`);
    assert.match(wiseBotMotion.overlayBlur, /blur\((?!0px\))/, `${device.name}: WiseBot overlay has no background blur`);
    await wiseBotDialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const wiseBotBox = await wiseBotDialog.boundingBox();
    assert.ok(wiseBotBox != null, `${device.name}: WiseBot dialog has no layout box`);
    if (device.name === "mobile") {
      assert.ok(Math.abs(wiseBotBox.width - device.viewport.width) <= 1, "mobile: WiseBot is not full width");
      assert.ok(Math.abs(wiseBotBox.height - device.viewport.height) <= 1, "mobile: WiseBot is not full height");
    } else {
      assert.ok(wiseBotBox.width <= 410, "desktop: WiseBot exceeded its floating-panel width");
    }
    await page.screenshot({ path: `${outputDir}/${device.name}-wisebot.png`, fullPage: true });
    await page.getByText("Questions go to Google. Nothing from your vault.", { exact: true }).waitFor();
    const suggestedQuestions = page.getByRole("list", { name: "Suggested questions", exact: true }).getByRole("button");
    assert.equal(await suggestedQuestions.count(), 3, `${device.name}: WiseBot offers no suggested questions`);
    assert.equal(await page.getByRole("button", { name: "Send question", exact: true }).isDisabled(), true, `${device.name}: send is enabled before consent`);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Review WiseBot information", exact: true }).click();
    await page.getByText("Your question and optional image are sent to Google to generate the answer.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Hide WiseBot information", exact: true }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Send question", exact: true }).isDisabled(), true, `${device.name}: send is enabled with an empty question`);
    await page.getByRole("dialog", { name: "WiseBot", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
    await page.getByLabel("Quick search").fill("backup");
    await page.getByText("Back up, export, and start a new cycle", { exact: true }).waitFor();
    await page.getByRole("button", { name: "See what’s new", exact: true }).click();
    await page.getByRole("heading", { name: "What’s new", exact: true }).waitFor();
    await page.getByText("1.0.0", { exact: true }).first().waitFor();
    await page.getByRole("combobox", { name: /^Choose language/ }).click();
    await page.getByRole("option", { name: "Français", exact: true }).click();
    await page.getByRole("heading", { name: "Nouveautés", exact: true }).waitFor();
    await page.screenshot({ path: `${outputDir}/${device.name}-updates-fr.png`, fullPage: true });
    await page.getByRole("combobox", { name: /^Choisir la langue/ }).click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("heading", { name: "WiseMoney guide", exact: true }).waitFor();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("heading", { name: /Manage your money\. Stay in control\./i }).waitFor();
    await page.screenshot({ path: `${outputDir}/${device.name}.png`, fullPage: true });
    await page.getByRole("combobox", { name: /^Choose language/ }).click();
    await page.getByRole("option", { name: "Français", exact: true }).click();
    await page.getByRole("heading", { name: "Gérez votre argent. Gardez le contrôle.", exact: true }).waitFor();
    await page.getByText("Chiffré sur cet appareil", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      `${device.name}: French landing has horizontal overflow`);
    await page.screenshot({ path: `${outputDir}/${device.name}-landing-fr.png`, fullPage: true });
    await page.getByRole("combobox", { name: /^Choisir la langue/ }).click();
    await page.getByRole("option", { name: "English", exact: true }).click();

    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { scope: ready.scope, scriptURL: ready.active?.scriptURL ?? "" };
    });
    assert.equal(registration.scope, `${baseURL}/`);
    assert.match(registration.scriptURL, /\/sw\.js$/);

    for (const path of ["/settings", "/debts", "/goals"]) {
      const routeResponse = await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
      assert.equal(routeResponse?.status(), 200, `${device.name}: ${path} did not return 200`);
      await page.waitForFunction(() => !document.body.innerText.includes("Loading"), undefined, { timeout: 10_000 });
    }

    offline = true;
    await context.setOffline(true);
    await page.goto(`${baseURL}/help`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.innerText.includes("Loading"), undefined, { timeout: 10_000 });
    await page.getByRole("heading", { name: "WiseMoney guide", exact: true }).waitFor();
    await page.getByLabel("Quick search").fill("offline");
    await page.getByText("Use WiseMoney offline and recover from a problem", { exact: true }).waitFor();
    await page.screenshot({ path: `${outputDir}/${device.name}-offline.png`, fullPage: true });
    await page.goto(`${baseURL}/updates`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "What’s new", exact: true }).waitFor();
    await page.getByText("1.0.0", { exact: true }).first().waitFor();

    assert.deepEqual(errors, [], `${device.name} runtime errors:\n${errors.join("\n")}`);
    await context.close();
  }

  const appContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "allow",
  });
  const appPage = await appContext.newPage();
  const appErrors = [];
  appPage.on("pageerror", (error) => appErrors.push(`pageerror: ${error.message}`));
  appPage.on("console", (message) => {
    if (message.type() === "error") appErrors.push(`console: ${message.text()}`);
  });
  await appPage.goto(baseURL, { waitUntil: "networkidle" });
  // A backup can be restored from the landing page, and the way back returns to it.
  await appPage.getByRole("button", { name: "I have a backup: restore it", exact: true }).click();
  await appPage.getByRole("heading", { name: "Bring your saved space to this device", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Back to overview", exact: true }).click();
  await appPage.getByRole("button", { name: "Start", exact: true }).last().waitFor();
  await appPage.getByRole("button", { name: "Start", exact: true }).last().click();
  // Start leads straight to the passphrase form: no intro screens.
  const passphrase = "WiseMoney-Smoke-Test-Only-2026";
  await appPage.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await appPage.getByLabel("Confirm private passphrase").fill(passphrase);
  await appPage.locator("form").getByRole("button", { name: "Create private space", exact: true }).click();
  try {
    await appPage.getByRole("heading", { name: "Currency and accounts", exact: true }).waitFor({ timeout: 90_000 });
  } catch (error) {
    await appPage.screenshot({ path: `${outputDir}/setup-failure.png`, fullPage: true });
    throw new Error(`Vault setup did not reach Dashboard. Body:\n${await appPage.locator("body").innerText()}`, { cause: error });
  }
  // First session, step 1: the currency is guessed from the browser locale (en-US -> USD); switch it
  // to XOF, which swaps the empty default account, then add a second account and continue.
  const currencyPicker = appPage.getByRole("button", { name: "Main currency", exact: true });
  await currencyPicker.filter({ hasText: "USD — US Dollar" }).waitFor();
  await currencyPicker.click();
  await appPage.getByPlaceholder(/Search currency/).fill("XOF");
  await appPage.getByRole("option", { name: /^XOF/ }).click();
  await currencyPicker.filter({ hasText: "XOF — " }).waitFor();
  await appPage.getByRole("button", { name: "Add another account", exact: true }).click();
  await appPage.getByLabel("Account name", { exact: true }).fill("Smoke Cash");
  await appPage.getByLabel("Opening balance", { exact: true }).fill("50000");
  await appPage.getByRole("button", { name: "Add account", exact: true }).click();
  await appPage.getByText("Accounts ready.", { exact: true }).waitFor({ timeout: 30_000 });
  await appPage.getByRole("button", { name: "Continue", exact: true }).click();
  // Step 2: the first movement, recorded through the sheet from the step's own button.
  await appPage.getByRole("heading", { name: "Your first movement", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Record a movement", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("Amount", { exact: true }).fill("700");
  await appPage.getByRole("dialog").getByLabel("Category", { exact: true }).click();
  await appPage.getByRole("option", { name: "Food & Dining", exact: true }).click();
  await appPage.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await appPage.getByRole("dialog").waitFor({ state: "detached" });
  await appPage.getByText("Recorded. Find it in Activity.", { exact: true }).waitFor({ timeout: 30_000 });
  await appPage.getByRole("button", { name: "Continue", exact: true }).click();
  // Step 3: planning is optional here; "Later" ends the first session and reveals the dashboard.
  await appPage.getByRole("heading", { name: "One plan", exact: true }).waitFor();
  assert.equal(await appPage.getByRole("button", { name: "Finish", exact: true }).isDisabled(), true, "Finish is offered before a plan exists");
  await appPage.getByRole("button", { name: "Later", exact: true }).click();
  await appPage.getByRole("region", { name: "Your money at a glance", exact: true }).getByText("Money available today", { exact: true }).waitFor({ timeout: 90_000 });
  // The coach shows its single per-session tip about 20 s in. It is a card beside the page (no
  // backdrop), announced as a status, and it stays on the page it was chosen for.
  const coachTip = appPage.getByLabel("WiseBot tip", { exact: true });
  await coachTip.waitFor({ timeout: 25_000 });
  assert.equal(await appPage.locator(".coach-overlay").count(), 0, "coach tip still covers the page with a backdrop");
  assert.equal(await coachTip.getAttribute("role"), "status", "coach tip is not announced as a status");
  await appPage.getByRole("link", { name: "Activity", exact: true }).click();
  await appPage.getByRole("heading", { name: "Activity", exact: true }).waitFor();
  await coachTip.waitFor({ state: "detached" });
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByText("Money available today", { exact: true }).first().waitFor();
  assert.equal(await coachTip.count(), 0, "coach tip came back after the user left its page");
  // Literacy pillar: lessons are readable with no provider, and without the tutor notice accepted a
  // question is answered from the lesson on this device (no request leaves the browser).
  const learnRequests = [];
  appPage.on("request", (request) => { if (request.url().includes("/api/learn/")) learnRequests.push(request.url()); });
  await appPage.getByRole("link", { name: "Learn about money", exact: true }).click();
  await appPage.getByRole("heading", { name: "Learn", exact: true }).waitFor();
  await appPage.getByText("Education, not advice.", { exact: true }).waitFor();
  assert.equal(await appPage.getByRole("button", { name: "Open WiseBot", exact: true }).count(), 1, "inside the app WiseBot has one entry, the header help button, and no floating launcher");
  await appPage.getByText(/Portfolio and the long term/).waitFor();
  await appPage.getByRole("button", { name: "Turn a wish into a goal", exact: true }).click();
  const lessonDialog = appPage.getByRole("dialog", { name: "Turn a wish into a goal", exact: true });
  await lessonDialog.getByText("Example", { exact: true }).waitFor();
  await lessonDialog.getByText("Do this week", { exact: true }).waitFor();
  await lessonDialog.getByText("Sources", { exact: true }).waitFor();
  assert.ok(await lessonDialog.getByRole("link").count() >= 1, "a lesson shows no linked source");
  await lessonDialog.getByRole("button", { name: "Close", exact: true }).click();
  await appPage.getByText("Tutor answers go through Google. Nothing from your vault.", { exact: true }).waitFor();
  await appPage.getByText("Questions asked by readers in Burkina Faso (LeFaso.net).", { exact: true }).waitFor();
  const starters = appPage.getByRole("list", { name: "Questions to start with", exact: true }).getByRole("button");
  assert.equal(await starters.count(), 5, "learn page does not offer the five readers' questions");
  await starters.filter({ hasText: "Lending at 15%: is that allowed?" }).click();
  await appPage.getByText(/14% for banks and 24% for other lenders/).first().waitFor();
  await appPage.getByText("Lesson on this device", { exact: true }).waitFor();
  assert.deepEqual(learnRequests, [], "a question left the browser before the tutor notice was accepted");
  await appPage.getByLabel("Ask a money question").fill("zzzz qqqq");
  await appPage.getByRole("button", { name: "Ask the tutor", exact: true }).click();
  await appPage.getByText("No lesson covers this. Accept the tutor notice to ask the tutor.", { exact: true }).waitFor();
  assert.equal(await appPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "learn page has horizontal overflow");
  await appPage.screenshot({ path: `${outputDir}/learn.png`, fullPage: true });
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByRole("region", { name: "Your money at a glance", exact: true }).waitFor();
  // The header's help button opens the WiseBot panel.
  assert.equal(await appPage.getByRole("banner").getByRole("combobox").count(), 0, "the app header still carries a language picker");
  assert.equal(await appPage.getByRole("banner").getByRole("button", { name: /Install/ }).count(), 0, "the app header still carries an install button");
  await appPage.getByRole("banner").getByRole("button", { name: "Open WiseBot", exact: true }).click();
  await appPage.getByRole("dialog", { name: "WiseBot", exact: true }).waitFor();
  await appPage.getByRole("dialog", { name: "WiseBot", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await appPage.getByRole("dialog", { name: "WiseBot", exact: true }).waitFor({ state: "detached" });

  const syncPage = await appContext.newPage();
  syncPage.on("pageerror", (error) => appErrors.push(`sync pageerror: ${error.message}`));
  syncPage.on("console", (message) => {
    if (message.type() === "error") appErrors.push(`sync console: ${message.text()}`);
  });
  await syncPage.goto(baseURL, { waitUntil: "networkidle" });
  await syncPage.getByRole("button", { name: "Open app", exact: true }).click();
  await syncPage.getByLabel("Private passphrase", { exact: true }).waitFor();
  await syncPage.getByRole("combobox", { name: /^Choose language/ }).click();
  await syncPage.getByRole("option", { name: "Français", exact: true }).click();
  try {
    await syncPage.getByLabel("Phrase privée", { exact: true }).waitFor({ timeout: 5_000 });
  } catch (error) {
    await syncPage.screenshot({ path: `${outputDir}/unlock-language-switch-failure.png`, fullPage: true });
    throw new Error(`Language switch did not preserve the unlock screen. Body:\n${await syncPage.locator("body").innerText()}`, { cause: error });
  }
  assert.equal(
    await syncPage.getByText("Ouvrir WiseMoney", { exact: true }).count(),
    1,
    "language switch left the passphrase unlock screen",
  );
  await syncPage.getByRole("combobox", { name: /^Choisir la langue/ }).click();
  await syncPage.getByRole("option", { name: "English", exact: true }).click();
  await syncPage.getByLabel("Private passphrase", { exact: true }).waitFor();
  await syncPage.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await syncPage.getByRole("button", { name: "Open", exact: true }).click();
  await syncPage.getByRole("region", { name: "Your money at a glance", exact: true }).waitFor({ timeout: 90_000 });
  await syncPage.setViewportSize({ width: 390, height: 844 });
  // Inside the app the language is changed from Settings; the header no longer carries a picker.
  assert.equal(await syncPage.getByRole("combobox", { name: /^Choose language/ }).count(), 0, "the app header still carries a language picker");
  await syncPage.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
  await syncPage.getByRole("button", { name: "Français", exact: true }).click();
  await syncPage.getByRole("heading", { name: "Paramètres", exact: true }).waitFor();
  await syncPage.getByRole("navigation", { name: "Navigation principale", exact: true }).getByRole("link", { name: "Accueil", exact: true }).click();
  // The link is named by its visible label (WCAG 2.5.3), not by a longer hidden one.
  const compactDashboardLink = syncPage.getByRole("navigation", { name: "Navigation principale", exact: true }).getByRole("link", { name: "Accueil", exact: true });
  await compactDashboardLink.waitFor();
  const bottomNav = syncPage.getByRole("navigation", { name: "Navigation principale", exact: true });
  assert.equal(await bottomNav.getByRole("link").count(), 3, "bottom navigation should hold exactly three destinations");
  assert.equal(await bottomNav.getByRole("button").count(), 1, "bottom navigation should hold exactly one capture button");
  await syncPage.getByRole("button", { name: "Saisie", exact: true }).click();
  await syncPage.getByRole("dialog").getByRole("tab", { name: "Transfert", exact: true }).waitFor();
  await syncPage.keyboard.press("Escape");
  await syncPage.getByRole("dialog").waitFor({ state: "detached" });
  await compactDashboardLink.click();
  assert.equal(await syncPage.locator(".route-transition").evaluate((element) => getComputedStyle(element).animationName), "route-transition-in",
    "app navigation did not animate the incoming page");
  await syncPage.screenshot({ path: `${outputDir}/bottom-navigation-fr.png`, fullPage: true });
  await syncPage.getByRole("banner").getByRole("link", { name: "Paramètres", exact: true }).click();
  await syncPage.getByRole("button", { name: "English", exact: true }).click();
  await syncPage.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await syncPage.setViewportSize({ width: 1280, height: 900 });
  await syncPage.getByRole("link", { name: "Plan", exact: true }).click();
  await syncPage.getByRole("link", { name: /^Debts & Receivables/ }).click();
  await syncPage.getByRole("heading", { name: "Debts & Receivables", exact: true }).waitFor();

  await appPage.getByRole("link", { name: "Plan", exact: true }).click();
  await appPage.getByRole("link", { name: /^Debts & Receivables/ }).click();
  await appPage.getByRole("heading", { name: "Debts & Receivables", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Add", exact: true }).click();
  await appPage.getByLabel("Debtor name").fill("Smoke Debtor");
  await appPage.getByLabel("Motive").fill("Invoice smoke test");
  await appPage.getByLabel(/^Amount \(F.CFA\)/).fill("12500");
  await appPage.locator("form").getByRole("button", { name: "Add", exact: true }).click();
  await appPage.locator("main").getByText("Smoke Debtor", { exact: true }).first().waitFor();
  await appPage.locator("main").getByText("Invoice smoke test", { exact: true }).first().waitFor();
  await syncPage.locator("main").getByText("Smoke Debtor", { exact: true }).first().waitFor();
  await appPage.getByLabel("Update status for Smoke Debtor").first().click();
  await appPage.getByRole("option", { name: "Partially paid", exact: true }).click();
  await appPage.locator("main").getByText("Partially paid", { exact: true }).first().waitFor();
  await appPage.screenshot({ path: `${outputDir}/debts.png`, fullPage: true });

  await appPage.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
  await appPage.getByText("Accounts & categories", { exact: true }).click();
  for (const [name, balance] of [["Smoke Savings", "0"]]) {
    await appPage.getByRole("button", { name: "New", exact: true }).last().click();
    await appPage.getByLabel("Account name", { exact: true }).fill(name);
    await appPage.getByLabel("Opening balance", { exact: true }).fill(balance);
    await appPage.getByRole("button", { name: "Create Account", exact: true }).click();
    await appPage.getByText(name, { exact: true }).first().waitFor();
  }
  await appPage.getByRole("tab", { name: "Categories", exact: true }).click();
  await appPage.getByPlaceholder("Search categories", { exact: true }).waitFor();
  await appPage.getByRole("link", { name: "Plan", exact: true }).click();
  await appPage.getByRole("link", { name: /^Planned expenses/ }).click();
  await appPage.getByRole("heading", { name: "Planned expenses", exact: true }).waitFor();
  await appPage.getByRole("link", { name: "Plan", exact: true }).click();
  await appPage.getByRole("link", { name: /Recurring/ }).click();
  await appPage.getByRole("heading", { name: "Recurring", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Add Recurring", exact: true }).click();
  await appPage.getByLabel("Label", { exact: true }).fill("Smoke subscription");
  await appPage.getByLabel("Category", { exact: true }).click();
  await appPage.getByRole("option", { name: "Food & Dining", exact: true }).click();
  await appPage.getByLabel(/^Amount \(F.CFA\)$/).fill("2500");
  await appPage.getByRole("button", { name: "Create Recurring Item", exact: true }).click();
  await appPage.locator("main").getByText("Smoke subscription", { exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Archive Smoke subscription", exact: true }).click();
  await appPage.locator("main").getByText("Smoke subscription", { exact: true }).waitFor({ state: "detached" });

  await appPage.getByRole("button", { name: "Capture", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("Account", { exact: true }).click();
  await appPage.getByRole("option", { name: "Smoke Cash", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("Category", { exact: true }).click();
  await appPage.getByRole("option", { name: "Food & Dining", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("Amount", { exact: true }).fill("1000");
  await appPage.getByRole("dialog").getByLabel("Note", { exact: true }).fill("Smoke transaction");
  await appPage.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await appPage.getByRole("dialog").waitFor({ state: "detached" });
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByText(/Smoke transaction/).waitFor();
  await appPage.getByRole("listitem").filter({ hasText: "Smoke transaction" }).getByRole("button", { name: /Edit transaction from/ }).click();
  await appPage.getByLabel(/^Amount \(F.CFA\)$/).fill("1500");
  await appPage.getByLabel("Note", { exact: true }).last().fill("Smoke transaction updated");
  await appPage.getByRole("button", { name: "Save", exact: true }).click();
  await appPage.getByText(/Smoke transaction updated/).waitFor();
  await appPage.getByRole("listitem").filter({ hasText: "Smoke transaction updated" }).getByRole("button", { name: /Delete transaction from/ }).click();
  await appPage.getByRole("button", { name: "Delete", exact: true }).click();
  await appPage.getByText(/Smoke transaction updated/).waitFor({ state: "detached" });

  await appPage.getByRole("button", { name: "Capture", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("Account", { exact: true }).click();
  await appPage.getByRole("option", { name: "Smoke Cash", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("Category", { exact: true }).click();
  await appPage.getByRole("option", { name: "Food & Dining", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("Amount", { exact: true }).fill("500");
  await appPage.getByRole("dialog").getByLabel("Note", { exact: true }).fill("Smoke retained transaction");
  await appPage.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await appPage.getByRole("dialog").waitFor({ state: "detached" });
  await appPage.getByRole("button", { name: "Capture", exact: true }).click();
  await appPage.getByRole("dialog").getByRole("tab", { name: "Transfer", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel("From Account", { exact: true }).click();
  await appPage.getByRole("option", { name: "Smoke Cash", exact: true }).click();
  await appPage.getByRole("dialog").getByRole("button", { name: "One of my accounts", exact: true }).click();
  await appPage.getByRole("dialog").getByLabel(/To Account/).click();
  await appPage.getByRole("option", { name: /Smoke Savings/ }).click();
  await appPage.getByRole("dialog").getByLabel("Amount", { exact: true }).fill("10000");
  await appPage.getByRole("dialog").getByLabel("Note", { exact: true }).fill("Smoke transfer motive");
  await appPage.getByRole("dialog").getByRole("button", { name: "Move between my accounts", exact: true }).click();
  await appPage.getByRole("dialog").waitFor({ state: "detached" });
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByText("Smoke Cash → Smoke Savings", { exact: true }).waitFor();
  await appPage.getByText(/Smoke transfer motive/).waitFor();
  const financialOverview = appPage.getByRole("region", { name: "Your money at a glance", exact: true });
  await financialOverview.getByText("Money available today", { exact: true }).waitFor();
  await financialOverview.getByText(`${smokeMonthName}'s Activity`, { exact: true }).waitFor();
  await financialOverview.getByText("Money received", { exact: true }).waitFor();
  await financialOverview.getByText("Money spent", { exact: true }).waitFor();
  await financialOverview.getByText("Difference", { exact: true }).waitFor();
  await appPage.getByText("More about this month", { exact: true }).click();
  await appPage.getByText("Balance evolution", { exact: true }).first().waitFor();
  await appPage.getByText("Money in and money out", { exact: true }).first().waitFor();
  await appPage.getByText("Spending mix", { exact: true }).first().waitFor();
  await appPage.getByRole("link", { name: "View this month’s activity", exact: true }).click();
  await appPage.getByRole("heading", { name: "Activity", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "CSV", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "XLSX", exact: true }).waitFor();
  const [activityCsvDownload] = await Promise.all([
    appPage.waitForEvent("download"),
    appPage.getByRole("button", { name: "CSV", exact: true }).click(),
  ]);
  assert.match(activityCsvDownload.suggestedFilename(), /^wisemoney-activity-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.ok(await activityCsvDownload.path(), "activity CSV download has no local path");
  const [activityXlsxDownload] = await Promise.all([
    appPage.waitForEvent("download"),
    appPage.getByRole("button", { name: "XLSX", exact: true }).click(),
  ]);
  assert.match(activityXlsxDownload.suggestedFilename(), /^wisemoney-activity-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.ok(await activityXlsxDownload.path(), "activity XLSX download has no local path");
  await appPage.getByPlaceholder("Label, account, or category", { exact: true }).fill("Smoke retained transaction");
  await appPage.getByText("Smoke retained transaction", { exact: true }).waitFor();
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByRole("combobox", { name: "Account shown", exact: true }).click();
  await appPage.getByRole("option", { name: "Smoke Cash", exact: true }).click();
  await appPage.getByRole("region", { name: "Your money at a glance", exact: true }).getByText("Smoke Cash", { exact: true }).waitFor();
  await appPage.getByRole("combobox", { name: "Account shown", exact: true }).click();
  await appPage.getByRole("option", { name: "All accounts", exact: true }).click();
  // Date presets live on Activity now; "Month" is the default, "All" widens the range.
  await appPage.getByRole("link", { name: "Activity", exact: true }).click();
  const monthPreset = appPage.getByRole("tab", { name: "Month", exact: true });
  await monthPreset.waitFor();
  assert.equal(await monthPreset.getAttribute("aria-selected"), "true", "Activity should default to the month preset");
  await appPage.getByRole("tab", { name: "All", exact: true }).click();
  assert.equal(await appPage.getByRole("tab", { name: "All", exact: true }).getAttribute("aria-selected"), "true", "All preset did not select");
  assert.match(appPage.url(), /preset=all/, "preset is not carried in the URL");
  // A movement can be corrected from its detail sheet in Activity, however old it is.
  await appPage.locator("main li").getByRole("button").filter({ hasText: "Food & Dining" }).first().click();
  await appPage.getByRole("dialog").getByRole("button", { name: "Edit transaction", exact: true }).click();
  await appPage.getByLabel("Note", { exact: true }).last().fill("Edited from activity");
  await appPage.getByRole("button", { name: "Save", exact: true }).click();
  await appPage.getByText("Transaction updated.", { exact: true }).waitFor();
  await appPage.getByText(/Edited from activity/).first().waitFor();
  // Plan links each of Budgets, Goals and Debts to its lesson; closing the lesson clears the link.
  await appPage.getByRole("link", { name: "Plan", exact: true }).click();
  await appPage.getByRole("link", { name: "Lesson about Budgets", exact: true }).click();
  const linkedLesson = appPage.getByRole("dialog", { name: "Build your first budget", exact: true });
  await linkedLesson.getByText("Do this week", { exact: true }).waitFor();
  await linkedLesson.getByRole("button", { name: "Close", exact: true }).click();
  await linkedLesson.waitFor({ state: "detached" });
  assert.doesNotMatch(appPage.url(), /unit=/, "closing a linked lesson left its parameter in the URL");
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByRole("region", { name: "Your money at a glance", exact: true }).waitFor();
  // The full guide is one tap inside the WiseBot panel.
  await appPage.getByRole("banner").getByRole("button", { name: "Open WiseBot", exact: true }).click();
  await appPage.getByRole("dialog", { name: "WiseBot", exact: true }).getByRole("button", { name: "Open the full guide", exact: true }).click();
  await appPage.getByRole("heading", { name: "WiseMoney guide", exact: true }).waitFor();
  await appPage.getByLabel("Quick search").fill("total balance");
  await appPage.getByText("Read the dashboard and activity", { exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Back", exact: true }).click();
  await appPage.getByText("Smoke Cash → Smoke Savings", { exact: true }).waitFor();
  await appPage.screenshot({ path: `${outputDir}/transfer-history.png`, fullPage: true });
  await appPage.setViewportSize({ width: 320, height: 720 });
  assert.equal(await appPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "320px dashboard has horizontal page overflow");
  await appPage.screenshot({ path: `${outputDir}/dashboard-320.png`, fullPage: true });
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 1000 },
    { width: 844, height: 390 },
  ]) {
    await appPage.setViewportSize(viewport);
    assert.equal(
      await appPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `${viewport.width}x${viewport.height} dashboard has horizontal page overflow`,
    );
  }
  await appPage.setViewportSize({ width: 390, height: 844 });
  await appPage.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  assert.equal(await appPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "dashboard overflows with 200% root text size");
  await appPage.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await appPage.screenshot({ path: `${outputDir}/transfer-history-mobile.png`, fullPage: true });
  await appPage.setViewportSize({ width: 1280, height: 900 });

  await appPage.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
  await appPage.getByRole("radio", { name: "Dark", exact: true }).click();
  assert.equal(await appPage.locator("html").evaluate((element) => element.classList.contains("dark")), true, "dark theme was not applied");
  assert.equal(await appPage.locator('meta[name="theme-color"]').getAttribute("content"), "#111318", "dark theme-color was not applied");
  assert.equal(await appPage.evaluate(() => localStorage.getItem("wisemoney.theme.preference.v1")), "dark", "dark theme choice was not persisted");
  await appPage.screenshot({ path: `${outputDir}/settings-dark.png`, fullPage: true });
  await appPage.setViewportSize({ width: 390, height: 844 });
  await appPage.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
  await appPage.getByText("Accounts & categories", { exact: true }).click();
  const inactiveCategoriesTab = appPage.getByRole("tab", { name: "Categories", exact: true });
  // The tabs now live on the Settings page itself, so the theme switch's colour transition is still
  // running when they are queried; wait for it to finish instead of sampling mid-animation.
  await inactiveCategoriesTab.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  assert.notEqual(
    await inactiveCategoriesTab.evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(255, 255, 255)",
    "dark management tabs use a hard-coded white surface",
  );
  await inactiveCategoriesTab.click();
  const categoriesCardHeading = appPage.getByText("Categories", { exact: true }).last();
  await categoriesCardHeading.evaluate((element) => Promise.all(element.parentElement.getAnimations().map((animation) => animation.finished)));
  assert.notEqual(
    await categoriesCardHeading.evaluate((element) => getComputedStyle(element.parentElement).backgroundColor),
    "rgb(255, 255, 255)",
    "dark management card header uses a hard-coded white surface",
  );
  await appPage.screenshot({ path: `${outputDir}/capture-management-dark.png`, fullPage: true });
  await appPage.setViewportSize({ width: 1280, height: 900 });
  await appPage.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
  await appPage.getByText("Security and session", { exact: true }).click();
  await appPage.getByRole("button", { name: "Lock private space", exact: true }).click();
  await appPage.getByLabel("Private passphrase", { exact: true }).waitFor();
  await appPage.setViewportSize({ width: 390, height: 844 });
  const unlockBackButton = appPage.getByRole("button", { name: "Back to overview", exact: true });
  const unlockBackBox = await unlockBackButton.boundingBox();
  // 44 px: the arrow alone, at the minimum touch size.
  assert.ok(unlockBackBox != null && unlockBackBox.width <= 44,
    "mobile unlock back action did not collapse to its arrow");
  assert.equal(await unlockBackButton.locator("span").isVisible(), false,
    "mobile unlock back label remained visible");
  const unlockLanguageBox = await appPage.getByRole("combobox", { name: /^Choose language/ }).boundingBox();
  assert.ok(unlockLanguageBox != null && unlockLanguageBox.width <= 80,
    "mobile unlock language switcher is not compact");
  assert.equal(await appPage.locator('main svg[aria-label="WiseMoney logo"]').count(), 1,
    "unlock screen repeats the WiseMoney logo");
  assert.equal(await appPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
    "mobile unlock header has horizontal overflow");
  await appPage.screenshot({ path: `${outputDir}/unlock-mobile-dark.png`, fullPage: true });
  await appPage.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await appPage.getByRole("button", { name: "Open", exact: true }).click();
  // At phone width the bottom bar names the link by its visible label, "Home".
  await appPage.getByRole("link", { name: "Home", exact: true }).waitFor({ timeout: 90_000 });
  await appPage.setViewportSize({ width: 1280, height: 900 });
  await appPage.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
  await appPage.getByRole("radio", { name: "Light", exact: true }).click();
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByText("Smoke Cash → Smoke Savings", { exact: true }).waitFor();

  await appPage.getByRole("banner").getByRole("link", { name: "Settings", exact: true }).click();
  await appPage.getByText("Data and backup", { exact: true }).click();
  await appPage.getByRole("button", { name: "Archive and start again", exact: true }).click();
  await appPage.getByLabel("Cycle name", { exact: true }).fill("Smoke cycle 2026");
  await appPage.getByLabel("Backup passphrase", { exact: true }).fill("Smoke-Archive-Only-2026");
  await appPage.getByLabel("Confirm backup passphrase", { exact: true }).fill("Smoke-Archive-Only-2026");
  await appPage.getByRole("button", { name: "Prepare archive", exact: true }).click();
  await appPage.getByText("Both documents are ready", { exact: true }).waitFor({ timeout: 90_000 });
  await appPage.screenshot({ path: `${outputDir}/cycle-archive-ready.png`, fullPage: true });

  const [backupDownload] = await Promise.all([
    appPage.waitForEvent("download"),
    appPage.getByRole("button", { name: "Download backup", exact: true }).click(),
  ]);
  assert.match(backupDownload.suggestedFilename(), /^wisemoney-smoke-cycle-2026-\d{4}-\d{2}-\d{2}\.wmexport$/);
  const backupPath = await backupDownload.path();
  assert.ok(backupPath, "cycle backup download has no local path");
  const backupEnvelope = JSON.parse(await readFile(backupPath, "utf8"));
  assert.equal(backupEnvelope.version, 2);
  assert.equal(backupEnvelope.encoding, "base64");
  assert.equal(typeof backupEnvelope.ciphertext, "string");

  const [reportDownload] = await Promise.all([
    appPage.waitForEvent("download"),
    appPage.getByRole("button", { name: "Download XLSX statement", exact: true }).click(),
  ]);
  assert.match(reportDownload.suggestedFilename(), /^wisemoney-smoke-cycle-2026-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const reportPath = await reportDownload.path();
  assert.ok(reportPath, "cycle XLSX download has no local path");
  const reportBytes = await readFile(reportPath);
  assert.equal(reportBytes.subarray(0, 4).toString("binary"), "PK\u0003\u0004");

  await appPage.getByLabel("I confirm that I saved both files in a safe location.", { exact: true }).check();
  await appPage.getByLabel("Type RESET to confirm", { exact: true }).fill("RESET");
  await appPage.getByRole("button", { name: "Close and start again", exact: true }).click();
  await appPage.getByText("Smoke cycle 2026", { exact: true }).waitFor({ timeout: 90_000 });
  await appPage.getByText("Cycle actions", { exact: true }).locator("..").getByText("0", { exact: true }).waitFor();
  await appPage.screenshot({ path: `${outputDir}/cycle-archive-history.png`, fullPage: true });
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByRole("heading", { name: "Your space is ready", exact: true }).waitFor({ timeout: 90_000 });

  assert.deepEqual(appErrors, [], `app runtime errors:\n${appErrors.join("\n")}`);
  await appContext.close();

  const response = await fetch(`${baseURL}/manifest.webmanifest`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/manifest\+json/);
  const manifest = await response.json();
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));

  console.log(`PWA smoke test passed. Screenshots: ${outputDir}`);
} finally {
  await browser.close();
}
