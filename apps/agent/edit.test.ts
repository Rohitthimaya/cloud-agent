import { describe, expect, test } from "bun:test";
import { applyEdit } from "./edit.ts";

describe("applyEdit", () => {
  test("replaces one exact match", () => {
    const result = applyEdit("alpha beta alpha", "beta", "gamma");
    expect(result).toEqual({ ok: true, content: "alpha gamma alpha" });
  });

  test("rejects a missing match", () => {
    expect(applyEdit("alpha", "beta", "gamma")).toEqual({
      ok: false,
      error: "old_string was not found in the file",
    });
  });

  test("rejects an ambiguous match", () => {
    const result = applyEdit("alpha alpha", "alpha", "beta");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("more than once");
  });

  test("rejects an empty search and a no-op replacement", () => {
    expect(applyEdit("alpha", "", "beta").ok).toBe(false);
    expect(applyEdit("alpha", "alpha", "alpha").ok).toBe(false);
  });
});
