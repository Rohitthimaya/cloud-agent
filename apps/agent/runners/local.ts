import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toolTimeoutMs } from "../config.ts";
import { applyEdit } from "../edit.ts";
import { resolveInside } from "../paths.ts";
import { bashResult, formatFile, type Runner } from "../tools.ts";

export class LocalRunner implements Runner {
  constructor(
    private readonly cwd: string,
    private readonly timeoutMs = toolTimeoutMs("local"),
  ) {}

  bash(command: string): Promise<string> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: string) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const child = spawn("bash", ["-c", command], { cwd: this.cwd });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish("TIMEOUT");
      }, this.timeoutMs);

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        finish(bashResult(stdout, err.message, 1));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        finish(bashResult(stdout, stderr, code));
      });
    });
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const resolved = resolveInside(this.cwd, filePath);
      return formatFile(readFileSync(resolved, "utf8"));
    } catch (error) {
      return errorText(error);
    }
  }

  async editFile(filePath: string, oldString: string, newString: string): Promise<string> {
    try {
      const resolved = resolveInside(this.cwd, filePath);
      const content = readFileSync(resolved, "utf8");
      const applied = applyEdit(content, oldString, newString);
      if (!applied.ok) return `Error: ${applied.error}`;
      writeFileSync(resolved, applied.content);
      return `Edited ${path.relative(this.cwd, resolved)}`;
    } catch (error) {
      return errorText(error);
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Error: ${message}`;
}
