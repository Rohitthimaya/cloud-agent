import { describe, expect, test } from "bun:test";
import { parseCli } from "./cli.ts";

describe("parseCli", () => {
  test("reads cloud and local tasks", () => {
    expect(parseCli(["cloud", "https://github.com/acme/app", "fix", "the", "bug"])).toEqual({
      mode: "cloud",
      target: "https://github.com/acme/app",
      task: "fix the bug",
      noPr: false,
      base: undefined,
    });
    expect(parseCli(["local", "../todoapp", "explain"])).toMatchObject({ mode: "local", task: "explain" });
  });

  test("accepts publish flags", () => {
    expect(parseCli(["cloud", "https://github.com/acme/app", "fix it", "--no-pr", "--base", "develop"])).toEqual({
      mode: "cloud",
      target: "https://github.com/acme/app",
      task: "fix it",
      noPr: true,
      base: "develop",
    });
  });

  test("rejects a missing task or base", () => {
    expect(parseCli(["cloud", "https://github.com/acme/app"])).toBeNull();
    expect(parseCli(["cloud", "https://github.com/acme/app", "fix", "--base"])).toBeNull();
  });
});
