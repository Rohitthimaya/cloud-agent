import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runCommand } from "../command.ts";
import { shellQuote } from "../shell.ts";

const root = path.resolve(import.meta.dir, "../../..");
const id = process.argv[2];
if (!id) {
  console.error("Usage: bun run swe:setup <instance-id>");
  process.exit(1);
}

const instancePath = path.join(root, "evals/swebench", `${id}.json`);
if (!existsSync(instancePath)) {
  console.error(`Missing ${instancePath}`);
  process.exit(1);
}

const instance = JSON.parse(readFileSync(instancePath, "utf8")) as {
  repo: string;
  base_commit: string;
  test_patch: string;
  FAIL_TO_PASS?: string;
  fail_to_pass?: string;
};

const work = path.join(root, "evals/work", id);
const venv = path.join(root, "evals/venvs", id);
const python = path.join(venv, "bin/python");
const tests = parseTests(instance.FAIL_TO_PASS ?? instance.fail_to_pass ?? "[]");
if (tests.length === 0) {
  console.error("The instance has no FAIL_TO_PASS tests.");
  process.exit(1);
}

mkdirSync(path.dirname(work), { recursive: true });
if (!existsSync(path.join(work, ".git"))) {
  await must(root, `git clone --filter=blob:none ${shellQuote(`https://github.com/${instance.repo}.git`)} ${shellQuote(work)}`, 300_000);
}
await must(work, `git checkout --force ${shellQuote(instance.base_commit)}`, 120_000);
await must(work, "git clean -fd", 60_000);

const patchPath = path.join(root, "evals/work", `${id}.test.patch`);
writeFileSync(patchPath, instance.test_patch.endsWith("\n") ? instance.test_patch : `${instance.test_patch}\n`);
await must(work, `git apply ${shellQuote(patchPath)}`, 30_000);

await must(root, "uv python install 3.10", 300_000);
mkdirSync(path.dirname(venv), { recursive: true });
await must(root, `uv venv --python 3.10 --clear ${shellQuote(venv)}`, 120_000);
await must(
  root,
  `uv pip install --python ${shellQuote(python)} -e ${shellQuote(work)} pytest`,
  300_000,
);

const quoted = tests.map(shellQuote).join(" ");
const verify = `PYTHONPATH=. ${shellQuote(python)} -m pytest ${quoted} -q --tb=short`;
console.log(`\nRunning the fail-to-pass test. It should fail before a fix.\n$ ${verify}`);
const grade = await runCommand(work, verify, 180_000);
process.stdout.write(grade.stdout);
process.stderr.write(grade.stderr);
if (grade.timedOut) {
  console.error("The test command timed out.");
  process.exit(1);
}
if (grade.exitCode === 0) {
  console.error("The test passed on the unfixed commit. The task is not ready.");
  process.exit(1);
}
console.log(`\nTest is ready for ${id}. It fails on the base commit, which is what we want.`);
console.log(`Grade it with: bun run eval --grade-only ${id}`);
console.log(`Run the agent on it with: bun run eval ${id}`);

async function must(cwd: string, command: string, timeoutMs: number): Promise<void> {
  console.log(`$ ${command}`);
  const result = await runCommand(cwd, command, timeoutMs);
  if (result.stdout.trim()) process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  if (result.timedOut || result.exitCode !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`Command failed (${result.timedOut ? "TIMEOUT" : result.exitCode}): ${command}`);
  }
}

function parseTests(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}
