export interface GitHubRepo {
  owner: string;
  repo: string;
}

export interface RepoAccess {
  defaultBranch: string;
  canPush: boolean;
}

export function parseGitHubRepo(url: string): GitHubRepo | null {
  const trimmed = url.trim().replace(/\/+$/, "");
  const https = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?$/);
  if (https?.[1] && https[2]) return { owner: https[1], repo: https[2] };
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/#?]+?)(?:\.git)?$/);
  if (ssh?.[1] && ssh[2]) return { owner: ssh[1], repo: ssh[2] };
  return null;
}

export function pullRequestTitle(task: string): string {
  const line = task.replace(/[\u0000\r]/g, "").trim().split("\n")[0] ?? "";
  if (!line) return "agent task";
  return line.length > 72 ? `${line.slice(0, 69)}...` : line;
}

export function pullRequestBody(task: string, answer: string): string {
  const summary = answer.trim() || "(no summary)";
  return `## Task\n\n${task.trim()}\n\n## Agent summary\n\n${summary}\n\nOpened by cloud-agent. Review the diff before merging.\n`;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "cloud-agent",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function repoAccess(owner: string, repo: string, token: string): Promise<RepoAccess> {
  const res = await fetch(repoApi(owner, repo), { headers: githubHeaders(token) });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `GitHub rejected GITHUB_TOKEN (${res.status}). Use a fine-grained token with access to ${owner}/${repo}.`,
    );
  }
  if (!res.ok) throw new Error(`GitHub repo ${owner}/${repo} is not accessible (${res.status}).`);
  const body = (await res.json()) as { default_branch?: string; permissions?: { push?: boolean } };
  return {
    defaultBranch: body.default_branch || "main",
    canPush: body.permissions?.push !== false,
  };
}

export async function githubIdentity(token: string): Promise<{ name: string; email: string }> {
  const res = await fetch("https://api.github.com/user", { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`GitHub token was rejected (${res.status}).`);
  const body = (await res.json()) as { login?: string; id?: number; name?: string | null };
  if (!body.login || typeof body.id !== "number") throw new Error("GitHub user response was missing login.");
  return {
    name: body.name?.trim() || body.login,
    email: `${body.id}+${body.login}@users.noreply.github.com`,
  };
}

export async function openPullRequest(input: {
  token: string;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
}): Promise<string> {
  const res = await fetch(`${repoApi(input.owner, input.repo)}/pulls`, {
    method: "POST",
    headers: { ...githubHeaders(input.token), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      head: input.head,
      base: input.base,
      body: input.body,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub pull request failed (${res.status}): ${text.slice(0, 500)}`);
  const parsed = JSON.parse(text) as { html_url?: string };
  if (!parsed.html_url) throw new Error("GitHub did not return a pull request URL.");
  return parsed.html_url;
}

function repoApi(owner: string, repo: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
