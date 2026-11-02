# cloud-agent

Part 1 of a Devin-style cloud coding agent. This Turborepo (Bun) monorepo runs an LLM agent loop with two tools, `bash` and `read_file`, against a tiny in-memory to-do app in `apps/todoapp`.

```
                         +-------------------------------+
                         | messages[]                    |
                         | system + user + assistant     |
                         | + tool results  (this is the  |
                         | agent's memory)               |
                         +---------------+---------------+
                                         |
                                         v
                         +-------------------------------+
                         | LLM (OpenRouter)              |
                         | sees messages and tool schemas|
                         +---------------+---------------+
                                         |
                     +-------------------+-------------------+
                     | no tool_calls                         | tool_calls
                     v                                       v
            print the final answer               run bash or read_file
                                                  append each result as
                                                  role: "tool"
                                                  loop, up to 15 times
```

## Setup

From the repo root:

```bash
bun install
cp apps/agent/.env.example apps/agent/.env
```

Edit `apps/agent/.env` and set `OPENROUTER_API_KEY`. Bun loads that file automatically when the agent starts. `AGENT_MODEL` defaults to `google/gemini-3-flash-preview`.

## Run

Explain the to-do app (the default task):

```bash
bun run agent
```

Ask the agent to change the project:

```bash
bun run agent "add a DELETE /todos/:id endpoint"
```

Tool calls are printed as `[iteration N] tool: name args`. The last thing printed is the model's final answer.

## How it works

`agentLoop` keeps a `messages` array. That array is the only memory: each turn sends the full history (system prompt, user task, prior assistant messages, and tool results) back to the model.

The model can request tools. Our code, not the model, runs them:

- `bash` runs `bash -c` with `node:child_process` `spawn`, with the working directory set to `apps/todoapp`. stdout and stderr are JSON, along with the exit code. Output longer than 4000 characters keeps the first 2000 and the last 2000. A command still running after 5 seconds is killed and the tool result is the text `TIMEOUT`.
- `read_file` reads the file with `node:fs` (not the shell), prefixes line numbers, and returns at most the first 500 lines.

Unknown tools, bad JSON arguments, and thrown tool errors are sent back as tool results so the loop can continue. The loop stops when the model replies with no tool calls, or after `MAX_ITERATIONS` (default 15).

## Layout

- `apps/agent` — the agent loop (`index.ts`)
- `apps/todoapp` — the sample project the agent explores
