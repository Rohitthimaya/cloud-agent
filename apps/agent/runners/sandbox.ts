import path from "node:path";
import { CommandExitError, Sandbox, TimeoutError } from "e2b";
import { e2bApiKey, toolTimeoutMs } from "../config.ts";
import { applyEdit } from "../edit.ts";
import { resolveInside } from "../paths.ts";
import {
  gitCloneCommand,
  publishRepository,
  redact,
  type PublishOptions,
  type PublishResult,
} from "../publish.ts";
import { bashResult, formatFile, type Runner } from "../tools.ts";

const REPO_DIR = "/home/user/repo";

export interface SandboxCreateOptions {
  token?: string;
  branch?: string;
  attach?: (runner: SandboxRunner) => void;
}

export class SandboxRunner implements Runner {
  private closed = false;

  private constructor(
    private readonly sandbox: Sandbox,
    private readonly timeoutMs: number,
  ) {}

  static async create(repoUrl: string, options: SandboxCreateOptions = {}): Promise<SandboxRunner> {
    const started = Date.now();
    const sandbox = await Sandbox.create({ apiKey: e2bApiKey });
    console.log(`Sandbox ${sandbox.sandboxId} created in ${Date.now() - started}ms`);

    const runner = new SandboxRunner(sandbox, toolTimeoutMs("sandbox"));
    options.attach?.(runner);
    try {
      const clone = gitCloneCommand(repoUrl, REPO_DIR, {
        branch: options.branch,
        token: options.token,
      });
      const result = await runner.exec(clone.command, "/home/user", clone.envs, 120_000);
      if (result.timedOut) throw new Error("git clone timed out");
      if (result.exitCode !== 0) {
        throw new Error(
          `git clone failed (exit ${result.exitCode}): ${redact(result.stderr, options.token ?? "")}`,
        );
      }
      console.log(`Cloned ${repoUrl} into ${REPO_DIR}`);
      return runner;
    } catch (error) {
      await runner.close();
      throw error;
    }
  }

  bash(command: string): Promise<string> {
    return this.run(command, REPO_DIR);
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const resolved = resolveInside(REPO_DIR, filePath, true);
      const content = await this.sandbox.files.read(resolved, { format: "text" });
      return formatFile(content);
    } catch (error) {
      return errorText(error);
    }
  }

  async editFile(filePath: string, oldString: string, newString: string): Promise<string> {
    try {
      const resolved = resolveInside(REPO_DIR, filePath, true);
      const content = await this.sandbox.files.read(resolved, { format: "text" });
      const applied = applyEdit(content, oldString, newString);
      if (!applied.ok) return `Error: ${applied.error}`;
      await this.sandbox.files.write(resolved, applied.content);
      return `Edited ${path.posix.relative(REPO_DIR, resolved)}`;
    } catch (error) {
      return errorText(error);
    }
  }

  publish(options: Omit<PublishOptions, "repoDir">): Promise<PublishResult> {
    return publishRepository(
      {
        run: async (command, cwd, envs) => {
          const result = await this.exec(command, cwd, envs, 120_000);
          return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.timedOut ? 124 : result.exitCode,
          };
        },
        writeFile: (filePath, content) => this.sandbox.files.write(filePath, content).then(() => undefined),
      },
      { ...options, repoDir: REPO_DIR },
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.sandbox.kill();
      console.log(`Sandbox ${this.sandbox.sandboxId} killed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to kill sandbox ${this.sandbox.sandboxId}: ${message}`);
    }
  }

  private async run(command: string, cwd: string): Promise<string> {
    const result = await this.exec(command, cwd);
    if (result.timedOut) return "TIMEOUT";
    return bashResult(result.stdout, result.stderr, result.exitCode);
  }

  private async exec(
    command: string,
    cwd: string,
    envs?: Record<string, string>,
    timeoutMs = this.timeoutMs,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
    try {
      const result = await this.sandbox.commands.run(command, { cwd, timeoutMs, envs });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, timedOut: false };
    } catch (error) {
      if (error instanceof CommandExitError) {
        return { stdout: error.stdout, stderr: error.stderr, exitCode: error.exitCode, timedOut: false };
      }
      if (error instanceof TimeoutError) return { stdout: "", stderr: "TIMEOUT", exitCode: 124, timedOut: true };
      const message = error instanceof Error ? error.message : String(error);
      return { stdout: "", stderr: message, exitCode: 1, timedOut: false };
    }
  }
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Error: ${message}`;
}
