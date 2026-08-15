import { afterEach, describe, expect, it, vi } from "vitest";
import { firstImageFromClipboard, sanitizeHelpImage, validateHelpImage } from "./image.ts";

afterEach(() => vi.unstubAllGlobals());

describe("help image preparation", () => {
  it("rejects non-images and source files over 10 MB", () => {
    expect(() => validateHelpImage(new File(["text"], "note.txt", { type: "text/plain" }))).toThrow("invalid-type");
    expect(() => validateHelpImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.jpg", { type: "image/jpeg" }))).toThrow("too-large");
  });

  it("resizes, flattens, and re-encodes an image as JPEG", async () => {
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const context = { fillStyle: "", fillRect, drawImage };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toDataURL: vi.fn().mockReturnValue("data:image/jpeg;base64,Y2xlYW4="),
    };
    class MockImage {
      naturalWidth = 2560;
      naturalHeight = 1280;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:test"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(canvas) });

    const result = await sanitizeHelpImage(new File(["image"], "screen.png", { type: "image/png" }));

    expect(result).toBe("data:image/jpeg;base64,Y2xlYW4=");
    expect(canvas).toMatchObject({ width: 1280, height: 640 });
    expect(context.fillStyle).toBe("#ffffff");
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1280, 640);
    expect(drawImage).toHaveBeenCalled();
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.82);
  });

  it("takes only an explicitly pasted image item", () => {
    const image = new File(["image"], "screen.png", { type: "image/png" });
    const items = [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => image },
    ] as unknown as DataTransferItemList;
    expect(firstImageFromClipboard(items)).toBe(image);
  });
});
