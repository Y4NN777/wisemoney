import { describe, expect, it } from "vitest";
import { keyboardInset } from "./keyboardInset.ts";

describe("keyboard inset", () => {
  it("is the part of the layout hidden below the visible area", () => {
    expect(keyboardInset(800, 480, 0)).toBe(320);
    expect(keyboardInset(800, 480, 40)).toBe(280);
  });

  it("is zero without a keyboard or when the layout already shrank", () => {
    expect(keyboardInset(800, 800, 0)).toBe(0);
    expect(keyboardInset(480, 480, 0)).toBe(0);
    expect(keyboardInset(800, 820, 0)).toBe(0);
  });
});
