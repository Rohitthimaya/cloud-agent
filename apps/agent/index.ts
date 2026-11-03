import path from "node:path";
import { agentLoop } from "./agent.ts";
import { parseCli } from "./cli.ts";
import { githubToken, requireEnv } from "./config.ts";
import {
  githubIdentity,
  openPullRequest,
  parseGitHubRepo,
  pullRequestBody,
  pullRequestTitle,
  repoAccess,
} from "./github.ts";
import { LocalRunner } from "./runners/local.ts";
import { SandboxRunner } from "./runners/sandbox.ts";
import type { Runner } from "./tools.ts";

function usage(): never {
  console.error(`Usage:
  bun run agent cloud <repoUrl> "<task>" [--no-pr] [--base <branch>]
  bun run agent local <folderPath> "<task>"`);
  process.exit(1);
}

const cli = parseCli(process.argv.slice(2));
if (!cli) usage();

requireEnv("OPENROUTER_API_KEY");
if (cli.mode === "cloud") requireEnv("E2B_API_KEY");

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

let exitCode = 0;
try {
  if (cli.mode === "cloud") {
    const prepared = await prepareCloudRun(cli.target, cli.base, cli.noPr);
    const sandbox = await SandboxRunner.create(cli.target, {
      token: githubToken || undefined,
      branch: prepared.branch,
      attach: (created) => {
        runner = created;
      },
    });
    runner = sandbox;
    const answer = await agentLoop(cli.task, sandbox);
    console.log(answer);
    if (prepared.publish && githubToken && prepared.branch) {
      await publishAnswer(sandbox, {
        repoUrl: cli.target,
        task: cli.task,
        answer,
        token: githubToken,
        baseBranch: prepared.branch,
      });
    }
  } else {
    runner = new LocalRunner(path.resolve(process.cwd(), cli.target));
    console.log(await agentLoop(cli.task, runner));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await closeRunner();
}
process.exit(exitCode);

async function prepareCloudRun(
  repoUrl: string,
  base: string | undefined,
  noPr: boolean,
): Promise<{ branch?: string; publish: boolean }> {
  if (noPr) return { branch: base, publish: false };
  if (!githubToken) {
    throw new Error(
      "Missing GITHUB_TOKEN. Set a fine-grained token that can push and open pull requests, or pass --no-pr.",
    );
  }
  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) {
    throw new Error("Pull requests require a github.com repository URL. Pass --no-pr to skip publishing.");
  }
  const access = await repoAccess(parsed.owner, parsed.repo, githubToken);
  if (!access.canPush) {
    throw new Error(`GITHUB_TOKEN cannot push to ${parsed.owner}/${parsed.repo}.`);
  }
  return { branch: base ?? access.defaultBranch, publish: true };
}

async function publishAnswer(
  sandbox: SandboxRunner,
  input: { repoUrl: string; task: string; answer: string; token: string; baseBranch: string },
): Promise<void> {
  const parsed = parseGitHubRepo(input.repoUrl);
  if (!parsed) throw new Error("Missing repository details for publish.");
  const identity = await githubIdentity(input.token).catch(() => ({
    name: "cloud-agent",
    email: "cloud-agent@users.noreply.github.com",
  }));
  const published = await sandbox.publish({
    task: input.task,
    token: input.token,
    baseBranch: input.baseBranch,
    authorName: identity.name,
    authorEmail: identity.email,
  });
  if (!published.changed || !published.branch) {
    console.log(published.reason ?? "No file changes to publish.");
    return;
  }
  const short = published.commit?.slice(0, 7) ?? "unknown";
  console.log(`Published ${published.branch} (${short})`);
  const url = await openPullRequest({
    token: input.token,
    owner: parsed.owner,
    repo: parsed.repo,
    title: pullRequestTitle(input.task),
    head: published.branch,
    base: input.baseBranch,
    body: pullRequestBody(input.task, input.answer),
  });
  console.log(`Pull request: ${url}`);
}
