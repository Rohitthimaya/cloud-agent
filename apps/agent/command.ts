import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export function runCommand(cwd: string, command: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn("bash", ["-c", command], { cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ stdout, stderr, exitCode: null, timedOut: true });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ stdout, stderr: `${stderr}${error.message}`, exitCode: 1, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ stdout, stderr, exitCode: code, timedOut: false });
    });
  });
}
