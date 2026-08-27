import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.WISEMONEY_SMOKE_URL ?? "http://localhost:4173";
const outputDir = process.env.WISEMONEY_SMOKE_OUTPUT ?? "/tmp/wisemoney-playwright";
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});

try {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      hasPrf: true,
      hasHmacSecret: true,
      automaticPresenceSimulation: true,
      isUserVerified: true,
    },
  });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("WiseMoney");
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error);
    });
    localStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start", exact: true }).last().click();
  for (let step = 0; step < 3; step++) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Create private space", exact: true }).click();
  const passphrase = "WiseMoney-WebAuthn-Smoke-2026";
  await page.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Confirm private passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("checkbox", { name: /Enable device unlock/ }).check();
  await page.locator("form").getByRole("button", { name: "Create private space", exact: true }).click();
  await page.getByRole("heading", { name: "Start with one account", exact: true }).waitFor({ timeout: 90_000 });

  const keyMeta = await page.evaluate(async () => await new Promise((resolve, reject) => {
    const request = indexedDB.open("WiseMoney");
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction("keyMeta", "readonly").objectStore("keyMeta").get("primary");
      get.onsuccess = () => {
        resolve({
          hasHandle: get.result?.webAuthnHandle?.byteLength > 0,
          hasWrappedKey: get.result?.wrappedKey?.byteLength > 0,
          hasWrappedIv: get.result?.wrappedIv?.byteLength > 0,
        });
        db.close();
      };
      get.onerror = () => reject(get.error);
    };
    request.onerror = () => reject(request.error);
  }));
  const virtualCredentials = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  const setupBody = await page.locator("body").innerText();
  assert.deepEqual(
    keyMeta,
    { hasHandle: true, hasWrappedKey: true, hasWrappedIv: true },
    `WebAuthn metadata was not stored. Virtual credentials: ${virtualCredentials.credentials.length}. Body:\n${setupBody}`,
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open my space", exact: true }).click();
  await page.getByRole("heading", { name: "Open WiseMoney", exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Choose language", exact: true }).click();
  await page.getByRole("option", { name: "Français", exact: true }).click();
  await page.getByRole("heading", { name: "Ouvrir WiseMoney", exact: true }).waitFor();
  await page.getByText("Utilisez le déverrouillage de cet appareil.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Utiliser ma phrase privée", exact: true }).waitFor();
  await page.screenshot({ path: `${outputDir}/device-unlock-mobile-fr.png`, fullPage: true });
  await page.getByRole("combobox", { name: "Choisir la langue", exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.getByText("Use this device’s screen lock.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Use my private passphrase", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
    "device unlock page has horizontal overflow");
  await page.screenshot({ path: `${outputDir}/device-unlock-mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "Use my private passphrase", exact: true }).click();
  await page.getByLabel("Private passphrase", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Back to overview", exact: true }).click();
  await page.getByRole("button", { name: "Open my space", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("heading", { name: "Start with one account", exact: true }).waitFor({ timeout: 30_000 });

  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  await context.close();
  console.log("WebAuthn PRF smoke test passed.");
} finally {
  await browser.close();
}
