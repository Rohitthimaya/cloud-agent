import path from "node:path";
import { agentLoop } from "./agent.ts";
import { requireEnv } from "./config.ts";
import { LocalRunner } from "./runners/local.ts";
import { SandboxRunner } from "./runners/sandbox.ts";
import type { Runner } from "./tools.ts";

function usage(): never {
  console.error(`Usage:
  bun run agent cloud <repoUrl> "<task>"
  bun run agent local <folderPath> "<task>"`);
  process.exit(1);
}

const [mode, target, ...taskParts] = process.argv.slice(2);
const task = taskParts.join(" ").trim();
if ((mode !== "cloud" && mode !== "local") || !target || !task) usage();

requireEnv("OPENROUTER_API_KEY");
if (mode === "cloud") requireEnv("E2B_API_KEY");

let runner: Runner | undefined;
let closed = false;

async function closeRunner(): Promise<void> {
  if (closed) return;
  closed = true;
  await runner?.close();
}

process.on("SIGINT", () => {
  void closeRunner().finally(() => process.exit(130));
});

try {
  if (mode === "cloud") {
    runner = await SandboxRunner.create(target, (created) => {
      runner = created;
    });
  } else {
    runner = new LocalRunner(path.resolve(process.cwd(), target));
  }
  console.log(await agentLoop(task, runner));
} finally {
  await closeRunner();
}
