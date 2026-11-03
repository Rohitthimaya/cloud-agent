import { describe, expect, test } from "bun:test";
import { bashResult, formatFile, truncate } from "./tools.ts";

describe("output limits", () => {
  test("keeps short output intact", () => {
    expect(truncate("hello")).toBe("hello");
  });

  test("keeps the head and tail of long output", () => {
    const text = `${"a".repeat(2500)}${"b".repeat(2500)}`;
    const truncated = truncate(text);
    expect(truncated.startsWith("a".repeat(2000))).toBe(true);
    expect(truncated.endsWith("b".repeat(2000))).toBe(true);
    expect(truncated).toContain("...[truncated]...");
  });

  test("numbers file lines and caps the bash payload", () => {
    expect(formatFile("one\ntwo")).toBe("1|one\n2|two");
    const result = JSON.parse(bashResult("out", "err", 0)) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };
    expect(result).toEqual({ stdout: "out", stderr: "err", exitCode: 0 });
  });
});
