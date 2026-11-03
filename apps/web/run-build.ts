import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

loadEnv(path.resolve(import.meta.dir, "../agent/.env"));

const workspace = process.argv[2];
const promptFile = process.argv[3];
if (!workspace || !promptFile) {
  console.error("Usage: bun run-build.ts <workspace> <prompt-file>");
  process.exit(1);
}

const prompt = readFileSync(promptFile, "utf8").trim();
const { agentLoop } = await import("../agent/agent.ts");
const { LocalRunner } = await import("../agent/runners/local.ts");

const SYSTEM_PROMPT = [
  "You are building a small website in this folder. The only app file is src/server.ts.",
  "It must use Bun.serve. The port is Number(process.env.PORT) || 3000.",
  "Return one complete HTML page for the request, with its own styles, so a person can use it in a browser.",
  "Replace the starter page. Do not add dependencies. Do not commit or push.",
  "Write ordinary JavaScript. Do not escape backticks or dollar signs.",
  "Inside the HTML, build URLs with string concatenation, not nested template literals.",
  "Before you stop, run: bun build src/server.ts --outfile=/tmp/cloud-agent-build-check.js",
  "If that command fails, fix src/server.ts and run it again.",
].join(" ");

const runner = new LocalRunner(workspace, 30_000);
const answer = await agentLoop(prompt, runner, { maxIterations: 20, systemPrompt: SYSTEM_PROMPT });
console.log(answer);

const problem = await smoke(workspace);
if (problem) {
  console.log(`The server does not run yet. Fix src/server.ts.\n${problem}`);
  const repair = await agentLoop(
    `src/server.ts failed to run. Edit that file until it parses and serves a real page.\n\n${problem}`,
    runner,
    { maxIterations: 8, systemPrompt: SYSTEM_PROMPT },
  );
  console.log(repair);
  const again = await smoke(workspace);
  if (again) {
    console.error(again);
    await runner.close();
    process.exit(1);
  }
}

await runner.close();

async function smoke(dir: string): Promise<string | null> {
  const file = path.join(dir, "src/server.ts");
  try {
    const built = await Bun.build({ entrypoints: [file], target: "bun" });
    if (!built.success) {
      return built.logs.map((log) => log.message).join("\n").slice(0, 4000) || "src/server.ts did not parse.";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 4000);
  }
  const port = 49000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["src/server.ts"], {
    cwd: dir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  child.stderr?.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  const exited = new Promise<number | null>((resolve) => child.once("close", resolve));
  const body = await Promise.race([
    readPage(port),
    exited.then(() => null),
    Bun.sleep(8000).then(() => null),
  ]);
  child.kill("SIGKILL");
  if (body === null) return output || "The server exited before it answered.";
  if (body.includes("cloud-agent-starter")) return "The starter page is still being served. Replace it.";
  return null;
}

async function readPage(port: number): Promise<string | null> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      return await response.text();
    } catch {
      await Bun.sleep(200);
    }
  }
  return null;
}

function loadEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
