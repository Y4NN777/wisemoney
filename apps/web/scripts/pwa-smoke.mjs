import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.WISEMONEY_SMOKE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.WISEMONEY_SMOKE_OUTPUT ?? "/tmp/wisemoney-playwright";
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

  for (const device of [
    { name: "desktop", viewport: { width: 1440, height: 1000 } },
    { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
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
    await page.getByRole("heading", { name: /WiseMoney starts with your device/i }).waitFor();
    await page.screenshot({ path: `${outputDir}/${device.name}.png`, fullPage: true });

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
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.innerText.includes("Loading"), undefined, { timeout: 10_000 });
    await page.getByRole("heading", { name: /WiseMoney starts with your device/i }).waitFor();
    await page.screenshot({ path: `${outputDir}/${device.name}-offline.png`, fullPage: true });

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
  await appPage.getByRole("button", { name: "Start", exact: true }).last().click();
  for (let step = 0; step < 3; step++) {
    await appPage.getByRole("button", { name: "Next", exact: true }).click();
  }
  await appPage.getByRole("button", { name: "Create private space", exact: true }).click();
  const passphrase = "WiseMoney-Smoke-Test-Only-2026";
  await appPage.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await appPage.getByLabel("Confirm private passphrase").fill(passphrase);
  await appPage.locator("form").getByRole("button", { name: "Create private space", exact: true }).click();
  try {
    await appPage.getByRole("heading", { name: "Start with one account", exact: true }).waitFor({ timeout: 90_000 });
  } catch (error) {
    await appPage.screenshot({ path: `${outputDir}/setup-failure.png`, fullPage: true });
    throw new Error(`Vault setup did not reach Dashboard. Body:\n${await appPage.locator("body").innerText()}`, { cause: error });
  }
  const syncPage = await appContext.newPage();
  syncPage.on("pageerror", (error) => appErrors.push(`sync pageerror: ${error.message}`));
  syncPage.on("console", (message) => {
    if (message.type() === "error") appErrors.push(`sync console: ${message.text()}`);
  });
  await syncPage.goto(baseURL, { waitUntil: "networkidle" });
  await syncPage.getByRole("button", { name: "Open app", exact: true }).click();
  await syncPage.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await syncPage.getByRole("button", { name: "Unlock", exact: true }).click();
  await syncPage.getByRole("heading", { name: "Start with one account", exact: true }).waitFor({ timeout: 90_000 });
  await syncPage.getByRole("link", { name: "Planning", exact: true }).click();
  await syncPage.getByRole("link", { name: /^Debts & Receivables/ }).click();
  await syncPage.getByRole("heading", { name: "Debts & Receivables", exact: true }).waitFor();

  await appPage.getByRole("link", { name: "Planning", exact: true }).click();
  await appPage.getByRole("link", { name: /^Debts & Receivables/ }).click();
  await appPage.getByRole("heading", { name: "Debts & Receivables", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Add", exact: true }).click();
  await appPage.getByLabel("Debtor name").fill("Smoke Debtor");
  await appPage.getByLabel("Motive").fill("Invoice smoke test");
  await appPage.getByLabel("Amount (XOF)").fill("12500");
  await appPage.locator("form").getByRole("button", { name: "Add", exact: true }).click();
  await appPage.locator("main").getByText("Smoke Debtor", { exact: true }).first().waitFor();
  await appPage.locator("main").getByText("Invoice smoke test", { exact: true }).first().waitFor();
  await syncPage.locator("main").getByText("Smoke Debtor", { exact: true }).first().waitFor();
  await appPage.getByLabel("Update status for Smoke Debtor").first().click();
  await appPage.getByRole("option", { name: "Partially paid", exact: true }).click();
  await appPage.locator("main").getByText("Partially paid", { exact: true }).first().waitFor();
  await appPage.screenshot({ path: `${outputDir}/debts.png`, fullPage: true });

  await appPage.getByRole("link", { name: "Capture", exact: true }).click();
  await appPage.getByRole("tab", { name: "Manage", exact: true }).click();
  for (const [name, balance] of [["Smoke Cash", "50000"], ["Smoke Savings", "0"]]) {
    await appPage.getByRole("button", { name: "New", exact: true }).last().click();
    await appPage.getByLabel("Account name", { exact: true }).fill(name);
    await appPage.getByLabel("Opening balance", { exact: true }).fill(balance);
    await appPage.getByRole("button", { name: "Create Account", exact: true }).click();
    await appPage.getByText(name, { exact: true }).first().waitFor();
  }
  await appPage.getByRole("link", { name: "Planning", exact: true }).click();
  await appPage.getByRole("link", { name: /Recurring/ }).click();
  await appPage.getByRole("heading", { name: "Recurring", exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Add Recurring", exact: true }).click();
  await appPage.getByLabel("Label", { exact: true }).fill("Smoke subscription");
  await appPage.getByLabel("Category", { exact: true }).click();
  await appPage.getByRole("option", { name: "Food & Dining", exact: true }).click();
  await appPage.getByLabel("Amount (XOF)", { exact: true }).fill("2500");
  await appPage.getByRole("button", { name: "Create Recurring Item", exact: true }).click();
  await appPage.locator("main").getByText("Smoke subscription", { exact: true }).waitFor();
  await appPage.getByRole("button", { name: "Archive Smoke subscription", exact: true }).click();
  await appPage.locator("main").getByText("Smoke subscription", { exact: true }).waitFor({ state: "detached" });

  await appPage.getByRole("link", { name: "Capture", exact: true }).click();
  await appPage.getByRole("tab", { name: "Transaction", exact: true }).click();
  await appPage.getByLabel("Account", { exact: true }).click();
  await appPage.getByRole("option", { name: "Smoke Cash", exact: true }).click();
  await appPage.getByLabel("Category", { exact: true }).click();
  await appPage.getByRole("option", { name: "Food & Dining", exact: true }).click();
  await appPage.getByLabel("Amount", { exact: true }).fill("1000");
  await appPage.getByLabel("Note (optional)", { exact: true }).fill("Smoke transaction");
  await appPage.getByRole("button", { name: "Record Transaction", exact: true }).click();
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByText(/Smoke transaction/).waitFor();
  await appPage.getByRole("button", { name: /Edit transaction from/ }).click();
  await appPage.getByLabel("Amount (XOF)", { exact: true }).fill("1500");
  await appPage.getByLabel("Note", { exact: true }).last().fill("Smoke transaction updated");
  await appPage.getByRole("button", { name: "Save", exact: true }).click();
  await appPage.getByText(/Smoke transaction updated/).waitFor();
  await appPage.getByRole("button", { name: /Delete transaction from/ }).click();
  await appPage.getByRole("button", { name: "Delete", exact: true }).click();
  await appPage.getByText(/Smoke transaction updated/).waitFor({ state: "detached" });

  await appPage.getByRole("link", { name: "Capture", exact: true }).click();
  await appPage.getByRole("tab", { name: "Transaction", exact: true }).click();
  await appPage.getByLabel("Account", { exact: true }).click();
  await appPage.getByRole("option", { name: "Smoke Cash", exact: true }).click();
  await appPage.getByLabel("Category", { exact: true }).click();
  await appPage.getByRole("option", { name: "Food & Dining", exact: true }).click();
  await appPage.getByLabel("Amount", { exact: true }).fill("500");
  await appPage.getByLabel("Note (optional)", { exact: true }).fill("Smoke retained transaction");
  await appPage.getByRole("button", { name: "Record Transaction", exact: true }).click();
  await appPage.getByRole("tab", { name: "Transfer", exact: true }).click();
  await appPage.getByLabel("From Account", { exact: true }).click();
  await appPage.getByRole("option", { name: "Smoke Cash", exact: true }).click();
  await appPage.getByLabel(/To Account/).click();
  await appPage.getByRole("option", { name: "Smoke Savings", exact: true }).click();
  await appPage.locator("#transfer-amount").fill("10000");
  await appPage.locator("#transfer-note").fill("Smoke transfer motive");
  await appPage.getByRole("button", { name: "Record Transfer", exact: true }).click();
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByText("Smoke Cash → Smoke Savings", { exact: true }).waitFor();
  await appPage.getByText(/Smoke transfer motive/).waitFor();
  await appPage.screenshot({ path: `${outputDir}/transfer-history.png`, fullPage: true });

  await appPage.getByRole("link", { name: "Settings", exact: true }).click();
  await appPage.getByText("Security and session", { exact: true }).click();
  await appPage.getByRole("button", { name: "Lock private space", exact: true }).click();
  await appPage.getByLabel("Private passphrase", { exact: true }).waitFor();
  await appPage.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await appPage.getByRole("button", { name: "Unlock", exact: true }).click();
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).waitFor({ timeout: 90_000 });
  await appPage.getByRole("link", { name: "Dashboard", exact: true }).click();
  await appPage.getByText("Smoke Cash → Smoke Savings", { exact: true }).waitFor();

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
