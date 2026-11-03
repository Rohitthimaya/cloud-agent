import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentLoop } from "../agent.ts";
import { requireEnv } from "../config.ts";
import type { CommandResult } from "../command.ts";
import { LocalRunner } from "../runners/local.ts";
import { SandboxRunner } from "../runners/sandbox.ts";
import { shellQuote } from "../shell.ts";
import { resolveInside } from "../paths.ts";
import { copyRepo, gradeWorkspace, isSolved } from "./grade.ts";
import { loadTasks, type EvalTask } from "./task.ts";

const EVAL_PROMPT =
  "You are a helpful coding assistant. You are working inside a git repository. Use read_file to inspect code, edit_file for an exact unique search-and-replace, and bash to run commands. Verify your work before you finish. Do not commit, push, or change git remotes. Do not create or edit test files. Hidden tests grade the workspace after you stop. Stop calling tools when the task is done.";

const root = path.resolve(import.meta.dir, "../../..");

export interface EvalReport {
  id: string;
  mode: "local" | "cloud";
  solved: boolean;
  gradeOnly: boolean;
  durationMs: number;
  answer: string;
  verifyCommand: string;
  verify: CommandResult;
  error?: string;
}

function usage(): never {
  console.error(`Usage:
  bun run eval
  bun run eval <task-id> [task-id...]
  bun run eval --grade-only [task-id]
  bun run eval --list`);
  process.exit(1);
}

if (import.meta.main) await main();

async function main(): Promise<void> {
const args = process.argv.slice(2);
let gradeOnly = false;
let list = false;
const ids: string[] = [];
for (const arg of args) {
  if (arg === "--grade-only") gradeOnly = true;
  else if (arg === "--list") list = true;
  else if (arg.startsWith("-")) usage();
  else ids.push(arg);
}

const tasks = loadTasks(path.join(root, "evals/tasks"));
if (list) {
  for (const task of tasks) console.log(`${task.id}\t${task.mode}\t${task.repo}`);
  process.exit(0);
}

const selected = ids.length === 0 ? tasks.filter((task) => task.mode === "local") : ids.map((id) => findTask(tasks, id));
if (selected.length === 0) {
  console.error("No tasks selected.");
  process.exit(1);
}
if (!gradeOnly) requireEnv("OPENROUTER_API_KEY");

let failed = 0;
const reports: EvalReport[] = [];
for (const task of selected) {
  console.log(`\n=== ${task.id} (${gradeOnly ? "grade only" : task.mode}) ===`);
  const report = await runTask(task, gradeOnly);
  reports.push(report);
  console.log(formatReport(report));
  if (!report.solved) failed += 1;
}

const solved = reports.filter((report) => report.solved).length;
console.log(`\n${solved}/${reports.length} solved`);
writeReports(reports);
process.exit(failed === 0 ? 0 : 1);
}

async function runTask(task: EvalTask, gradeOnlyRun: boolean): Promise<EvalReport> {
  const started = Date.now();
  try {
    if (task.mode === "cloud") return await runCloud(task, gradeOnlyRun, started);
    return await runLocal(task, gradeOnlyRun, started);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: task.id,
      mode: task.mode,
      solved: false,
      gradeOnly: gradeOnlyRun,
      durationMs: Date.now() - started,
      answer: "",
      verifyCommand: task.verify,
      verify: { stdout: "", stderr: message, exitCode: 1, timedOut: false },
      error: message,
    };
  }
}

async function runLocal(task: EvalTask, gradeOnlyRun: boolean, started: number): Promise<EvalReport> {
  const workspace = mkdtempSync(path.join(tmpdir(), `cloud-agent-${task.id}-`));
  try {
    copyRepo(path.resolve(root, task.repo), workspace);
    let answer = "";
    if (!gradeOnlyRun) {
      const runner = new LocalRunner(workspace, 20_000);
      answer = await agentLoop(task.problem, runner, {
        maxIterations: task.maxIterations,
        systemPrompt: EVAL_PROMPT,
      });
      console.log(answer);
    }
    const verify = await gradeWorkspace(workspace, root, task);
    return {
      id: task.id,
      mode: "local",
      solved: isSolved(verify),
      gradeOnly: gradeOnlyRun,
      durationMs: Date.now() - started,
      answer,
      verifyCommand: task.verify,
      verify: clip(verify),
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function runCloud(task: EvalTask, gradeOnlyRun: boolean, started: number): Promise<EvalReport> {
  requireEnv("E2B_API_KEY");
  if (!task.repo.startsWith("http") && !task.repo.startsWith("git@")) {
    throw new Error(`${task.id} needs a git URL for cloud mode.`);
  }
  const sandbox = await SandboxRunner.create(task.repo);
  try {
    if (task.baseCommit) {
      const checkout = await sandbox.runCommand(`git checkout ${shellQuote(task.baseCommit)}`, 60_000);
      if (checkout.exitCode !== 0) throw new Error(checkout.stderr || "git checkout failed");
    }
    if (task.testPatch) {
      await sandbox.writeRepoFile(".eval-test.patch", task.testPatch);
      const applied = await sandbox.runCommand("git apply .eval-test.patch && rm .eval-test.patch", 30_000);
      if (applied.exitCode !== 0) throw new Error(applied.stderr || "test patch failed");
    }
    let answer = "";
    if (!gradeOnlyRun) {
      answer = await agentLoop(task.problem, sandbox, {
        maxIterations: task.maxIterations,
        systemPrompt: EVAL_PROMPT,
      });
      console.log(answer);
    }
    const verify = await gradeWorkspaceCloud(sandbox, task);
    return {
      id: task.id,
      mode: "cloud",
      solved: isSolved(verify),
      gradeOnly: gradeOnlyRun,
      durationMs: Date.now() - started,
      answer,
      verifyCommand: task.verify,
      verify: clip(verify),
    };
  } finally {
    await sandbox.close();
  }
}

async function gradeWorkspaceCloud(sandbox: SandboxRunner, task: EvalTask): Promise<CommandResult> {
  for (const file of task.hidden) {
    const src = resolveInside(root, file.src);
    await sandbox.writeRepoFile(file.dest, readFileSync(src, "utf8"));
  }
  return sandbox.runCommand(task.verify, task.verifyTimeoutMs);
}

function findTask(all: EvalTask[], id: string): EvalTask {
  const task = all.find((item) => item.id === id);
  if (!task) {
    console.error(`Unknown task "${id}". bun run eval --list`);
    process.exit(1);
  }
  return task;
}

function clip(result: CommandResult): CommandResult {
  return { ...result, stdout: clipText(result.stdout), stderr: clipText(result.stderr) };
}

function clipText(text: string): string {
  if (text.length <= 8_000) return text;
  return `${text.slice(0, 4_000)}\n...[truncated]...\n${text.slice(-4_000)}`;
}

export function formatReport(report: EvalReport): string {
  const verdict = report.solved ? "SOLVED" : "NOT SOLVED";
  const exit = report.verify.timedOut ? "TIMEOUT" : String(report.verify.exitCode);
  const output = [report.verify.stdout, report.verify.stderr].filter((part) => part.trim() !== "").join("\n");
  return [`${report.id}  ${verdict}  ${(report.durationMs / 1000).toFixed(1)}s`, `hidden check: ${report.verifyCommand} (exit ${exit})`, output.trim()]
    .filter((line) => line !== "")
    .join("\n");
}

function writeReports(reports: EvalReport[]): void {
  const dir = path.join(root, "evals/reports");
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify({ createdAt: new Date().toISOString(), reports }, null, 2);
  writeFileSync(path.join(dir, "latest.json"), body);
  writeFileSync(path.join(dir, `${new Date().toISOString().replaceAll(":", "-")}.json`), body);
}
