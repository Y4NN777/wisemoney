import { describe, expect, it, vi } from "vitest";
vi.mock("./_vault.tsx", () => ({ Route: {} }));
vi.mock("@tanstack/react-router", () => ({ createRoute: () => ({}) }));
import { parseLearnSearch } from "./learn.tsx";

describe("learn search", () => {
  it("keeps a lesson id", () => {
    expect(parseLearnSearch({ unit: "build-a-budget" })).toEqual({ unit: "build-a-budget" });
  });

  it("drops anything that cannot be a lesson id", () => {
    expect(parseLearnSearch({})).toEqual({});
    expect(parseLearnSearch({ unit: 3 })).toEqual({});
    expect(parseLearnSearch({ unit: "Build a budget" })).toEqual({});
    expect(parseLearnSearch({ unit: "<script>" })).toEqual({});
  });
});
