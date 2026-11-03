import { shellQuote } from "./shell.ts";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface Shell {
  run(command: string, cwd: string, envs?: Record<string, string>): Promise<ShellResult>;
  writeFile(path: string, content: string): Promise<void>;
}

export interface PublishOptions {
  repoDir: string;
  task: string;
  token: string;
  baseBranch: string;
  authorName: string;
  authorEmail: string;
  branch?: string;
}

export interface PublishResult {
  changed: boolean;
  branch?: string;
  commit?: string;
  reason?: string;
}

const COMMIT_MSG_PATH = "/tmp/cloud-agent-commit-msg";

const ADD_EXCLUDES = [
  ":(exclude).env",
  ":(exclude)**/.env",
  ":(exclude)**/.env.*",
  ":(exclude)**/*.pem",
  ":(exclude)**/*id_rsa*",
  ":(exclude)node_modules",
  ":(exclude)**/node_modules",
];

export const GIT_CREDENTIAL_HELPER =
  "credential.helper='!f() { echo \"username=x-access-token\"; echo \"password=$GITHUB_TOKEN\"; }; f'";

export const GIT_PUSH_COMMAND = `git -c ${GIT_CREDENTIAL_HELPER} push -u origin HEAD`;

export function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

export function assertSafeBranch(name: string): string {
  if (
    !/^[A-Za-z0-9._/-]+$/.test(name) ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.endsWith(".") ||
    name.includes("..") ||
    name.includes("//")
  ) {
    throw new Error(`Invalid branch name: ${name}`);
  }
  return name;
}

export function branchName(task: string, id = Math.random().toString(36).slice(2, 8)): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return assertSafeBranch(`agent/${slug || "task"}-${id}`);
}

export function commitMessage(task: string): string {
  const first = task.replace(/[\u0000\r]/g, "").trim().split("\n")[0] ?? "";
  const subject = !first ? "agent task" : first.length > 72 ? `${first.slice(0, 69)}...` : first;
  return `${subject}\n\nApplied by cloud-agent.\n`;
}

export function gitCloneCommand(
  repoUrl: string,
  dest: string,
  options: { branch?: string; token?: string } = {},
): { command: string; envs: Record<string, string> } {
  const branch = options.branch ? ` --branch ${shellQuote(assertSafeBranch(options.branch))}` : "";
  const prefix = options.token ? `git -c ${GIT_CREDENTIAL_HELPER} ` : "git ";
  const envs: Record<string, string> = { GIT_TERMINAL_PROMPT: "0" };
  if (options.token) envs.GITHUB_TOKEN = options.token;
  return {
    command: `${prefix}clone${branch} ${shellQuote(repoUrl)} ${shellQuote(dest)}`,
    envs,
  };
}

export async function publishRepository(shell: Shell, options: PublishOptions): Promise<PublishResult> {
  const base = assertSafeBranch(options.baseBranch);
  const branch = assertSafeBranch(options.branch ?? branchName(options.task));
  const repoDir = options.repoDir;
  const token = options.token;

  const status = await git(shell, "git status --porcelain", repoDir, token);
  const aheadResult = await shell.run(`git rev-list --count origin/${base}..HEAD`, repoDir, {
    GIT_TERMINAL_PROMPT: "0",
  });
  const parsedAhead = Number(aheadResult.stdout.trim() || "0");
  const ahead = aheadResult.exitCode === 0 && Number.isFinite(parsedAhead) ? parsedAhead : 0;
  const dirty = status.trim() !== "";

  if (!dirty && ahead === 0) return { changed: false, reason: "No file changes to publish." };

  if (dirty) {
    const add = `git add -- ${[".", ...ADD_EXCLUDES].map(shellQuote).join(" ")}`;
    await git(shell, add, repoDir, token);
    const staged = await shell.run("git diff --cached --quiet", repoDir, { GIT_TERMINAL_PROMPT: "0" });
    const hasStaged = staged.exitCode === 1;
    if (!hasStaged && ahead === 0) {
      return {
        changed: false,
        reason: "No publishable changes. Secret files and dependencies were left unstaged.",
      };
    }
    if (hasStaged) {
      await shell.writeFile(COMMIT_MSG_PATH, commitMessage(options.task));
      const commit = `git -c user.name=${shellQuote(options.authorName)} -c user.email=${shellQuote(options.authorEmail)} commit -F ${shellQuote(COMMIT_MSG_PATH)}`;
      await git(shell, commit, repoDir, token);
    }
  }

  await git(shell, `git checkout -b ${shellQuote(branch)}`, repoDir, token);
  await git(shell, GIT_PUSH_COMMAND, repoDir, token, { GITHUB_TOKEN: token });
  const commit = await git(shell, "git rev-parse HEAD", repoDir, token);
  return { changed: true, branch, commit };
}

async function git(
  shell: Shell,
  command: string,
  cwd: string,
  token: string,
  envs?: Record<string, string>,
): Promise<string> {
  const result = await shell.run(command, cwd, { GIT_TERMINAL_PROMPT: "0", ...envs });
  if (result.exitCode !== 0) {
    const detail = redact(`${result.stderr}\n${result.stdout}`, token).trim();
    const shown = redact(command, token).split("\n")[0] ?? command;
    throw new Error(`git failed (${result.exitCode}): ${shown}\n${detail}`);
  }
  return result.stdout.trim();
}
