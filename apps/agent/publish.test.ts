import { describe, expect, test } from "bun:test";
import {
  GIT_PUSH_COMMAND,
  assertSafeBranch,
  branchName,
  gitCloneCommand,
  publishRepository,
  type Shell,
  type ShellResult,
} from "./publish.ts";

const TOKEN = "super-secret-token";

class FakeShell implements Shell {
  commands: { command: string; envs?: Record<string, string> }[] = [];
  files = new Map<string, string>();
  status = " M src/a.ts\n";
  ahead = "0\n";
  stagedExit = 1;
  pushStderr = "";
  pushExit = 0;

  run(command: string, _cwd: string, envs?: Record<string, string>): Promise<ShellResult> {
    this.commands.push({ command, envs });
    if (command.startsWith("git status")) return Promise.resolve(ok(this.status));
    if (command.startsWith("git rev-list")) return Promise.resolve(ok(this.ahead));
    if (command.startsWith("git diff --cached --quiet")) {
      return Promise.resolve({ stdout: "", stderr: "", exitCode: this.stagedExit });
    }
    if (command.includes("push -u origin HEAD")) {
      return Promise.resolve({ stdout: "", stderr: this.pushStderr, exitCode: this.pushExit });
    }
    if (command.startsWith("git rev-parse")) return Promise.resolve(ok("abc123def\n"));
    return Promise.resolve(ok(""));
  }

  writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }
}

function ok(stdout: string): ShellResult {
  return { stdout, stderr: "", exitCode: 0 };
}

const options = {
  repoDir: "/repo",
  task: "Fix the bug",
  token: TOKEN,
  baseBranch: "main",
  authorName: "O'Brien",
  authorEmail: "1+dev@users.noreply.github.com",
  branch: "agent/fix-the-bug-test",
};

describe("publishRepository", () => {
  test("commits, pushes a new branch, and keeps the token out of command text", async () => {
    const shell = new FakeShell();
    const result = await publishRepository(shell, options);
    expect(result).toEqual({ changed: true, branch: "agent/fix-the-bug-test", commit: "abc123def" });
    const commands = shell.commands.map((call) => call.command).join("\n");
    expect(commands).not.toContain(TOKEN);
    expect(commands).toContain("git checkout -b 'agent/fix-the-bug-test'");
    expect(commands).toContain("user.name='O'\\''Brien'");
    const pushes = shell.commands.filter((call) => call.command.includes("push -u origin HEAD"));
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.envs?.GITHUB_TOKEN).toBe(TOKEN);
    expect(shell.commands.find((call) => call.command.startsWith("git status"))?.envs?.GITHUB_TOKEN).toBeUndefined();
    expect(shell.files.get("/tmp/cloud-agent-commit-msg")).toContain("Fix the bug");
  });

  test("skips a clean tree and refuses to publish only secrets", async () => {
    const clean = new FakeShell();
    clean.status = "";
    expect((await publishRepository(clean, options)).changed).toBe(false);
    expect(clean.commands.some((call) => call.command.includes("push -u origin HEAD"))).toBe(false);

    const secrets = new FakeShell();
    secrets.status = "?? .env\n";
    secrets.stagedExit = 0;
    const skipped = await publishRepository(secrets, options);
    expect(skipped.changed).toBe(false);
    expect(skipped.reason).toContain("Secret");
    expect(secrets.commands.some((call) => call.command.includes("push -u origin HEAD"))).toBe(false);
  });

  test("redacts the token when push fails", async () => {
    const shell = new FakeShell();
    shell.pushExit = 1;
    shell.pushStderr = `authentication failed for ${TOKEN}`;
    await expect(publishRepository(shell, options)).rejects.toThrow("[redacted]");
    await expect(publishRepository(shell, options)).rejects.not.toThrow(TOKEN);
  });
});

describe("git commands", () => {
  test("puts the clone token in the environment only", () => {
    const clone = gitCloneCommand("https://github.com/acme/app", "/home/user/repo", {
      branch: "develop",
      token: TOKEN,
    });
    expect(clone.command).not.toContain(TOKEN);
    expect(clone.command).toContain("--branch 'develop'");
    expect(clone.envs.GITHUB_TOKEN).toBe(TOKEN);
    expect(GIT_PUSH_COMMAND).toContain("$GITHUB_TOKEN");
    expect(GIT_PUSH_COMMAND).not.toContain(TOKEN);
  });

  test("builds a safe branch name", () => {
    expect(branchName("Fix the bug!", "abc123")).toBe("agent/fix-the-bug-abc123");
    expect(() => assertSafeBranch("main;rm -rf")).toThrow(/Invalid branch/);
  });
});
