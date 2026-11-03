import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalRunner } from "./runners/local.ts";
import { resolveInside } from "./paths.ts";

describe("resolveInside", () => {
  const root = "/repo";

  test("resolves a relative path inside the root", () => {
    expect(resolveInside(root, "src/app.ts", true)).toBe("/repo/src/app.ts");
  });

  test("rejects a path that leaves the root", () => {
    expect(() => resolveInside(root, "../secret", true)).toThrow(/escapes/);
    expect(() => resolveInside(root, "/etc/passwd", true)).toThrow(/escapes/);
  });
});

describe("LocalRunner editFile", () => {
  test("writes a unique replacement and refuses to leave the folder", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cloud-agent-"));
    writeFileSync(path.join(dir, "note.txt"), "hello world\n");
    const runner = new LocalRunner(dir);

    expect(await runner.editFile("note.txt", "world", "there")).toBe("Edited note.txt");
    expect(readFileSync(path.join(dir, "note.txt"), "utf8")).toBe("hello there\n");
    expect(await runner.editFile("../note.txt", "there", "nope")).toContain("escapes");
    expect(await runner.readFile("../note.txt")).toContain("escapes");
  });
});
