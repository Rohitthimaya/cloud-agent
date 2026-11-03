import { describe, expect, test } from "bun:test";
import { runCommand } from "./command.ts";

describe("runCommand", () => {
  test("returns output and a non-zero exit code", async () => {
    const ok = await runCommand(".", "echo hello", 2_000);
    expect(ok).toMatchObject({ stdout: "hello\n", exitCode: 0, timedOut: false });
    const failed = await runCommand(".", "exit 3", 2_000);
    expect(failed.exitCode).toBe(3);
  });

  test("kills a command that exceeds the timeout", async () => {
    const result = await runCommand(".", "sleep 5", 200);
    expect(result.timedOut).toBe(true);
  });
});
