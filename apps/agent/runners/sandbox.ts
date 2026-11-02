import path from "node:path";
import { CommandExitError, Sandbox, TimeoutError } from "e2b";
import { e2bApiKey, toolTimeoutMs } from "../config.ts";
import { bashResult, formatFile, type Runner } from "../tools.ts";

const REPO_DIR = "/home/user/repo";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export class SandboxRunner implements Runner {
  private closed = false;

  private constructor(
    private readonly sandbox: Sandbox,
    private readonly timeoutMs: number,
  ) {}

  static async create(repoUrl: string, attach?: (runner: SandboxRunner) => void): Promise<SandboxRunner> {
    const started = Date.now();
    const sandbox = await Sandbox.create({ apiKey: e2bApiKey });
    console.log(`Sandbox ${sandbox.sandboxId} created in ${Date.now() - started}ms`);

    const runner = new SandboxRunner(sandbox, toolTimeoutMs("sandbox"));
    attach?.(runner);
    try {
      const clone = await runner.run(
        `git clone ${shellQuote(repoUrl)} ${REPO_DIR}`,
        "/home/user",
      );
      const result = JSON.parse(clone) as { exitCode: number | null; stderr: string };
      if (result.exitCode !== 0) {
        throw new Error(`git clone failed (exit ${result.exitCode}): ${result.stderr}`);
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
    const resolved = filePath.startsWith("/") ? filePath : path.posix.join(REPO_DIR, filePath);
    const content = await this.sandbox.files.read(resolved, { format: "text" });
    return formatFile(content);
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
    try {
      const result = await this.sandbox.commands.run(command, {
        cwd,
        timeoutMs: this.timeoutMs,
      });
      return bashResult(result.stdout, result.stderr, result.exitCode);
    } catch (error) {
      if (error instanceof CommandExitError) {
        return bashResult(error.stdout, error.stderr, error.exitCode);
      }
      if (error instanceof TimeoutError) return "TIMEOUT";
      const message = error instanceof Error ? error.message : String(error);
      return bashResult("", message, 1);
    }
  }
}
