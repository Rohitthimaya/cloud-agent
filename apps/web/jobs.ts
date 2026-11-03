import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type JobKind = "eval" | "build";
export type JobStatus = "running" | "passed" | "failed";

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  prompt: string;
  logs: string;
  url?: string;
  port?: number;
  startedAt: number;
  finishedAt?: number;
}

const jobs: Job[] = [];
const servers = new Map<string, ChildProcess>();
let nextPort = 4600;

export function listJobs(): Job[] {
  return [...jobs].reverse();
}

export function getJob(id: string): Job | undefined {
  return jobs.find((job) => job.id === id);
}

export function startEval(root: string): Job {
  const job = create("eval", "pylint-dev__pylint-5859");
  const child = spawn(process.execPath, ["run", "eval", "pylint-dev__pylint-5859"], {
    cwd: root,
    env: process.env,
  });
  collect(job, child, (code) => {
    finish(job);
    job.status = code === 0 && verdict(job.logs) === "passed" ? "passed" : "failed";
  });
  return job;
}

export function startBuild(root: string, prompt: string): Job {
  const job = create("build", prompt);
  const workspace = path.join(root, "apps/web/generated", job.id);
  mkdirSync(workspace, { recursive: true });
  cpSync(path.join(root, "apps/web/template"), workspace, { recursive: true });
  const promptFile = path.join(workspace, "prompt.txt");
  writeFileSync(promptFile, prompt);
  const child = spawn(process.execPath, [path.join(root, "apps/web/run-build.ts"), workspace, promptFile], {
    cwd: root,
    env: process.env,
  });
  collect(job, child, (code) => {
    if (code !== 0) {
      finish(job);
      job.status = "failed";
      return;
    }
    void deploy(job, workspace);
  });
  return job;
}

export function stopAll(): void {
  for (const child of servers.values()) child.kill("SIGKILL");
}

async function deploy(job: Job, workspace: string): Promise<void> {
  const port = nextPort++;
  const child = spawn(process.execPath, ["src/server.ts"], {
    cwd: workspace,
    env: { ...process.env, PORT: String(port) },
  });
  servers.set(job.id, child);
  collect(job, child, () => {
    if (job.status === "running") {
      finish(job);
      job.status = "failed";
    }
  });
  const body = await waitForBody(port);
  if (body === null || body.includes("cloud-agent-starter")) {
    child.kill("SIGKILL");
    append(job, "\nThe app server did not come up with a finished page.\n");
    finish(job);
    job.status = "failed";
    return;
  }
  job.port = port;
  job.url = `http://127.0.0.1:${port}/`;
  finish(job);
  job.status = "passed";
}

function create(kind: JobKind, prompt: string): Job {
  const job: Job = {
    id: crypto.randomUUID().slice(0, 8),
    kind,
    status: "running",
    prompt,
    logs: "",
    startedAt: Date.now(),
  };
  jobs.push(job);
  return job;
}

function collect(job: Job, child: ChildProcess, onClose: (code: number | null) => void): void {
  child.stdout?.on("data", (chunk) => append(job, String(chunk)));
  child.stderr?.on("data", (chunk) => append(job, String(chunk)));
  child.on("error", (error) => append(job, `${error.message}\n`));
  child.on("close", (code) => onClose(code));
}

function append(job: Job, text: string): void {
  job.logs = `${job.logs}${text}`.slice(-80_000);
}

function finish(job: Job): void {
  job.finishedAt = Date.now();
}

function verdict(logs: string): "passed" | "failed" {
  if (logs.includes("NOT SOLVED")) return "failed";
  if (logs.includes(" SOLVED")) return "passed";
  return "failed";
}

async function waitForBody(port: number): Promise<string | null> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      return await response.text();
    } catch {
      await Bun.sleep(250);
    }
  }
  return null;
}
