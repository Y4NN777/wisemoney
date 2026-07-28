import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.WISEMONEY_SMOKE_URL ?? "http://127.0.0.1:4173";
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
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
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
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let step = 0; step < 3; step++) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Create private space", exact: true }).click();
  const passphrase = "WiseMoney-WebAuthn-Smoke-2026";
  await page.getByLabel("Private passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Confirm private passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Enable device unlock", { exact: true }).check();
  await page.locator("form").getByRole("button", { name: "Create private space", exact: true }).click();
  await page.getByText("Welcome to WiseMoney", { exact: true }).waitFor({ timeout: 90_000 });

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
  assert.deepEqual(keyMeta, { hasHandle: true, hasWrappedKey: true, hasWrappedIv: true });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Use face, fingerprint, or security key", exact: true }).click();
  await page.getByText("Welcome to WiseMoney", { exact: true }).waitFor({ timeout: 30_000 });

  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  await context.close();
  console.log("WebAuthn PRF smoke test passed.");
} finally {
  await browser.close();
}
