# cloud-agent

V0 of a Devin-style cloud coding agent. Give it a public GitHub repository and a task. It creates an [E2B](https://e2b.dev) sandbox, clones the repo inside that sandbox, and runs an LLM loop whose `bash` and `read_file` tools execute there. The same agent can also run locally against a folder on your machine.

```
repo URL + task
      |
      v
create E2B sandbox  (logged with how long it took)
      |
      v
git clone into /home/user/repo
      |
      v
+------------------+       tool call        +----------------------+
| LLM (OpenRouter) | <--------------------> | agent loop           |
| messages[] memory|   bash / read_file     | runs tools in sandbox|
+------------------+                        +----------------------+
      |
      | no tool call, or 15 iterations
      v
print the final answer
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

- `OPENROUTER_API_KEY` from [openrouter.ai](https://openrouter.ai)
- `E2B_API_KEY` from [e2b.dev](https://e2b.dev)

`AGENT_MODEL` defaults to `google/gemini-3-flash-preview`. Bun loads `.env` automatically. Use an OpenRouter inference key, not a management key.

## Usage

Cloud mode, on a public GitHub repo:

```bash
bun run agent cloud https://github.com/Rohitthimaya/cloud-agent "Summarize this repository"
```

Local mode, against a folder on your machine. Paths are resolved from `apps/agent`, so the sample to-do app is `../todoapp`:

```bash
bun run agent local ../todoapp "Can you explain this project?"
```

Tool calls are printed as `[iteration N] tool: name args`. The last thing printed is the model's answer. In cloud mode the sandbox id and startup time are logged, and the sandbox is killed before the process exits.

## How it works

`agentLoop` keeps a `messages` array. That array is the only memory: every turn sends the system prompt, the task, earlier assistant messages, and tool results back to the model.

The model can request tools. Our code runs them, either on your machine (`LocalRunner`) or inside the sandbox (`SandboxRunner`):

- `bash` runs the command and returns JSON `{ stdout, stderr, exitCode }`. Local commands are killed after 5 seconds. Sandbox commands get 60 seconds, because installs are slower. Either limit can be overridden with `TOOL_TIMEOUT_MS`. A killed command returns `TIMEOUT` instead of throwing.
- `read_file` reads through the filesystem API (not the shell), adds line numbers, and keeps the first 500 lines.

If stdout, stderr, or a file is longer than 4000 characters, the result keeps the first 2000 and the last 2000 with `...[truncated]...` in the middle.

The loop stops when the model replies with no tool calls, or after `MAX_ITERATIONS` (default 15). Unknown tools, bad JSON arguments, and thrown tool errors are sent back as tool results so the loop can continue.

The sandbox is a separate machine. Commands there cannot read `OPENROUTER_API_KEY` or `E2B_API_KEY` from the agent process. Sandboxes are ephemeral: anything the agent changes disappears when the sandbox is killed, so a later version has to commit and push to GitHub before that happens.

## Next steps

- Commit the agent's changes and open a pull request before the sandbox is killed
- Add an `edit_file` search-and-replace tool
- Run read-only tool calls in parallel
- Give the sandbox a short-lived GitHub token scoped to that one repository

## Layout

- `apps/agent` — the agent loop, local runner, and E2B runner
- `apps/todoapp` — a tiny in-memory to-do API used to try local mode
