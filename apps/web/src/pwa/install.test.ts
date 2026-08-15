import { afterEach, describe, expect, it, vi } from "vitest";
import { detectInstallPlatform, isInstalledDisplayMode } from "./install.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("PWA installation platform", () => {
  it("recognizes Android, iOS, iPad desktop mode, and desktop browsers", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)")).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5)).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop");
  });

  it("detects browser standalone display mode", () => {
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: true }) });
    vi.stubGlobal("navigator", { standalone: false });
    expect(isInstalledDisplayMode()).toBe(true);
  });

  it("detects the iOS standalone flag", () => {
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: false }) });
    vi.stubGlobal("navigator", { standalone: true });
    expect(isInstalledDisplayMode()).toBe(true);
  });
});
