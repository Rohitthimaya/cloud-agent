# cloud-agent

V1 of a Devin-style cloud coding agent. Give it a GitHub repository and a task. It creates an [E2B](https://e2b.dev) sandbox, clones the repo inside that sandbox, and runs an LLM loop whose tools execute there. When the loop finishes, it commits the work on a new branch, pushes it, opens a pull request, and then kills the sandbox. The same agent can run locally against a folder on your machine.

```
repo URL + task
      |
      v
check the GitHub token can push
      |
      v
create E2B sandbox
      |
      v
git clone into /home/user/repo
      |
      v
+------------------+      tool calls       +---------------------------+
| LLM (OpenRouter) | <-------------------> | agent loop                |
| messages[] memory|  read_file in parallel| runs tools in the sandbox |
|                  |  edit_file and bash   |                           |
+------------------+                       +---------------------------+
      |
      | no tool call, or the iteration limit
      v
commit on agent/<task>, push, open a pull request
      |
      v
print the answer and the pull request URL
      |
      v
kill the sandbox  (also on Ctrl+C)
```

## Setup

From the repo root:

```bash
bun install
cp apps/agent/.env.example apps/agent/.env
```

Fill in `apps/agent/.env`:

- `OPENROUTER_API_KEY` from [openrouter.ai](https://openrouter.ai). Use an inference key, not a management key.
- `E2B_API_KEY` from [e2b.dev](https://e2b.dev)
- `GITHUB_TOKEN` from GitHub, for cloud mode that opens a pull request

`AGENT_MODEL` defaults to `google/gemini-3-flash-preview`. Bun loads `.env` automatically. `GH_TOKEN` is accepted as an alias for `GITHUB_TOKEN`.

Create the GitHub token as a fine-grained personal access token:

- Resource: only the repository the agent will edit
- Contents: Read and write
- Pull requests: Read and write
- Metadata: Read
- Expiration: as short as you can tolerate, then rotate it

The token is not a GitHub App installation token. GitHub does not let a personal token mint a second, shorter-lived token. The expiry you set on the fine-grained token is what limits it.

## Usage

Cloud mode. This clones the repo, runs the task, opens a pull request, and deletes the sandbox:

```bash
bun run agent cloud https://github.com/Rohitthimaya/cloud-agent "Summarize this repository and add a line to the README"
```

Target a base branch other than the repository default:

```bash
bun run agent cloud https://github.com/acme/app "Fix the failing test" --base develop
```

Cloud mode without publishing, for a read-only look at a public repo:

```bash
bun run agent cloud https://github.com/Rohitthimaya/cloud-agent "Summarize this repository" --no-pr
```

Local mode, against a folder on your machine. Paths are resolved from `apps/agent`, so the sample to-do app is `../todoapp`. Local mode does not commit or open a pull request.

```bash
bun run agent local ../todoapp "Can you explain this project?"
```

Tool calls are printed as `[iteration N] tool: name args`. The answer is printed next. In cloud mode the sandbox id, startup time, branch, and pull request URL are logged, and the sandbox is killed before the process exits.

## How it works

`agentLoop` keeps a `messages` array. That array is the only memory: every turn sends the system prompt, the task, earlier assistant messages, and tool results back to the model.

The model can request tools. Our code runs them, either on your machine (`LocalRunner`) or inside the sandbox (`SandboxRunner`):

- `read_file` reads through the filesystem API, adds line numbers, and keeps the first 500 lines. Paths that leave the repository are rejected. Consecutive `read_file` calls in one turn run in parallel. Their results are still appended in the original order.
- `edit_file` replaces one exact copy of `old_string` with `new_string`. It fails if the text is missing or appears more than once, so the model has to include enough surrounding context.
- `bash` runs the command and returns JSON `{ stdout, stderr, exitCode }`. Local commands are killed after 5 seconds. Sandbox commands get 60 seconds, because installs are slower. Either limit can be overridden with `TOOL_TIMEOUT_MS`. A killed command returns `TIMEOUT` instead of throwing. `bash` and `edit_file` run one at a time, because they can change the tree.

If stdout, stderr, or a file is longer than 4000 characters, the result keeps the first 2000 and the last 2000 with `...[truncated]...` in the middle.

The loop stops when the model replies with no tool calls, or after `MAX_ITERATIONS` (default 15). Unknown tools, bad JSON arguments, and thrown tool errors are sent back as tool results so the loop can continue. Rate limits and transient server errors on the model request are retried up to three times.

The sandbox is a separate machine. Commands there cannot read `OPENROUTER_API_KEY`, `E2B_API_KEY`, or `GITHUB_TOKEN` from the agent process. The token is passed only as the environment of the clone command and the push command, which run before the loop starts and after it finishes. It is not written into the remote URL, the model prompt, or the tool log. `git` is told not to wait for an interactive password.

After a cloud run that is allowed to publish:

1. Dirty files are committed on a new `agent/<task>` branch. `.env` files, private keys, and `node_modules` are left unstaged.
2. That branch is pushed. The default branch is never pushed.
3. A pull request is opened against the base branch with the task and the model's final answer.
4. The sandbox is killed. Anything that was not pushed is gone.

Local mode is for a folder you already trust. `bash` there can reach the rest of your machine. Cloud mode is the isolated path.

## Checks

```bash
bun run test
bun run typecheck
```

## Next steps

- Ask for approval before the push
- Mint a GitHub App installation token that expires when the sandbox is killed
- Stream command output instead of waiting for the command to finish
