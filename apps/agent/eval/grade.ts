import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runCommand, type CommandResult } from "../command.ts";
import { resolveInside } from "../paths.ts";
import type { EvalTask, HiddenFile } from "./task.ts";

export function copyRepo(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(from, source);
      const parts = relative.split(path.sep);
      return !parts.includes("node_modules") && !parts.includes(".git") && !parts.includes(".venv") && !parts.includes("venv") && !parts.includes("__pycache__");
    },
  });
}

export function installHidden(workspace: string, root: string, files: readonly HiddenFile[]): void {
  for (const file of files) {
    const src = resolveInside(root, file.src);
    const dest = resolveInside(workspace, file.dest);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

export async function gradeWorkspace(workspace: string, root: string, task: EvalTask): Promise<CommandResult> {
  installHidden(workspace, root, task.hidden);
  return runCommand(workspace, task.verify, task.verifyTimeoutMs);
}

export function isSolved(result: CommandResult): boolean {
  return result.exitCode === 0 && !result.timedOut;
}
