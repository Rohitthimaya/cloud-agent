import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const TODOAPP_DIR = path.resolve(import.meta.dir, "../todoapp");
const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS ?? 15);
const MODEL = process.env.AGENT_MODEL ?? "google/gemini-3-flash-preview";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  // The SDK rejects a missing apiKey at construction time. The CLI exits first when the env var is unset.
  apiKey: process.env.OPENROUTER_API_KEY || "missing",
});

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Run a bash command in the todoapp directory. Returns JSON with stdout, stderr, and exitCode.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a file from the todoapp directory. Returns contents with line numbers, truncated to the first 500 lines.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to the todoapp directory",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

function truncateOutput(text: string): string {
  const head = 2000;
  const tail = 2000;
  if (text.length <= head + tail) return text;
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}\n...[${omitted} characters truncated]...\n${text.slice(-tail)}`;
}

function runBash(command: string): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn("bash", ["-c", command], { cwd: TODOAPP_DIR });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish("TIMEOUT");
    }, 5000);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      finish(
        JSON.stringify({
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(err.message),
          exitCode: 1,
        }),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      finish(
        JSON.stringify({
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr),
          exitCode: code,
        }),
      );
    });
  });
}

function readFile(filePath: string): string {
  const resolved = path.resolve(TODOAPP_DIR, filePath);
  const content = readFileSync(resolved, "utf8");
  const lines = content.split(/\r?\n/);
  const shown = lines.slice(0, 500);
  const numbered = shown.map((line, index) => `${index + 1}|${line}`).join("\n");
  if (lines.length > 500) {
    return `${numbered}\n...[truncated after 500 lines, ${lines.length - 500} more]`;
  }
  return numbered;
}

async function getToolResponse(
  call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
): Promise<string> {
  try {
    if (call.type !== "function") {
      return `Error: unknown tool "${call.custom.name}"`;
    }
    const name = call.function.name;

    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(call.function.arguments || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return "Error: tool arguments must be a JSON object";
      }
      args = parsed as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: failed to parse tool arguments: ${message}`;
    }

    if (name === "bash") {
      if (typeof args.command !== "string") return "Error: bash requires a string command";
      return await runBash(args.command);
    }
    if (name === "read_file") {
      if (typeof args.path !== "string") return "Error: read_file requires a string path";
      return readFile(args.path);
    }
    return `Error: unknown tool "${name}"`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

async function agentLoop(task: string): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "You are a helpful coding assistant. Use the tools to explore the files before answering.",
    },
    { role: "user", content: task },
  ];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
    });

    const message = response.choices[0]?.message;
    if (!message) return "The model returned an empty response.";

    messages.push(message);

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return message.content ?? "";
    }

    for (const call of toolCalls) {
      const name = call.type === "function" ? call.function.name : "unknown";
      const args = call.type === "function" ? call.function.arguments : "";
      console.log(`[iteration ${iteration}] tool: ${name} ${args}`);
      const content = await getToolResponse(call);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content,
      });
    }
  }

  return `Stopped after ${MAX_ITERATIONS} iterations without a final answer.`;
}

if (import.meta.main) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error(
      "Missing OPENROUTER_API_KEY. Copy apps/agent/.env.example to apps/agent/.env and set your key.",
    );
    process.exit(1);
  }

  const task = process.argv[2] ?? "Can you explain this project?";
  const answer = await agentLoop(task);
  console.log(answer);
}
