import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { shellQuote } from "../shell.ts";

export interface HiddenFile {
  src: string;
  dest: string;
}

export interface EvalTask {
  id: string;
  mode: "local" | "cloud";
  repo: string;
  problem: string;
  verify: string;
  hidden: HiddenFile[];
  baseCommit?: string;
  testPatch?: string;
  verifyTimeoutMs: number;
  maxIterations: number;
}

export function loadTasks(tasksDir: string): EvalTask[] {
  const names = readdirSync(tasksDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return names.map((name) => parseTask(JSON.parse(readFileSync(path.join(tasksDir, name), "utf8"))));
}

export function parseTask(raw: unknown): EvalTask {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("A task file must be a JSON object.");
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.instance_id === "string" && typeof record.problem_statement === "string") {
    return parseSweBench(record);
  }
  return parseOwnTask(record);
}

function parseOwnTask(record: Record<string, unknown>): EvalTask {
  const id = requiredString(record, "id");
  const repo = requiredString(record, "repo");
  const problem = requiredString(record, "problem");
  const verify = requiredString(record, "verify");
  const mode = record.mode === "cloud" || record.mode === "local" ? record.mode : inferMode(repo);
  return {
    id,
    mode,
    repo,
    problem,
    verify,
    hidden: parseHidden(record.hidden),
    baseCommit: optionalCommit(record.baseCommit),
    testPatch: optionalString(record.testPatch),
    verifyTimeoutMs: positive(record.verifyTimeoutMs, 30_000),
    maxIterations: positive(record.maxIterations, 20),
  };
}

function parseSweBench(record: Record<string, unknown>): EvalTask {
  const repoName = requiredString(record, "repo");
  const repo = repoName.startsWith("http") || repoName.startsWith("git@") ? repoName : `https://github.com/${repoName}`;
  const tests = stringList(record.fail_to_pass);
  const verify = optionalString(record.verify) ?? pytestCommand(tests);
  if (!verify) {
    throw new Error(
      `${String(record.instance_id)} needs a verify command. fail_to_pass did not look like pytest ids.`,
    );
  }
  return {
    id: requiredString(record, "instance_id"),
    mode: "cloud",
    repo,
    problem: requiredString(record, "problem_statement"),
    verify,
    hidden: parseHidden(record.hidden),
    baseCommit: optionalCommit(record.base_commit),
    testPatch: optionalString(record.test_patch),
    verifyTimeoutMs: positive(record.verifyTimeoutMs, 120_000),
    maxIterations: positive(record.maxIterations, 30),
  };
}

function parseHidden(value: unknown): HiddenFile[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("hidden must be an array.");
  return value.map((entry) => {
    if (typeof entry === "string") return { src: entry, dest: path.posix.basename(entry) };
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const file = entry as Record<string, unknown>;
      return { src: requiredString(file, "src"), dest: requiredString(file, "dest") };
    }
    throw new Error("hidden entries must be paths or { src, dest }.");
  });
}

function pytestCommand(tests: string[]): string | null {
  if (tests.length === 0) return null;
  const pytest = tests.every((test) => test.includes(".py") || test.includes("::"));
  if (!pytest) return null;
  return `python -m pytest -q ${tests.map(shellQuote).join(" ")}`;
}

function stringList(value: unknown): string[] {
  const parsed = typeof value === "string" ? safeJson(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function inferMode(repo: string): "local" | "cloud" {
  return repo.startsWith("http") || repo.startsWith("git@") ? "cloud" : "local";
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Task is missing ${key}.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

function optionalCommit(value: unknown): string | undefined {
  const commit = optionalString(value);
  if (!commit) return undefined;
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) throw new Error(`Invalid commit: ${commit}`);
  return commit;
}

function positive(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}
