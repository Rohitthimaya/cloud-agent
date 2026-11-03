import OpenAI from "openai";
import { agentModel, maxIterations, openRouterApiKey } from "./config.ts";
import { withRetries } from "./retry.ts";
import { groupToolCalls } from "./schedule.ts";
import { tools, type Runner } from "./tools.ts";

const SYSTEM_PROMPT =
  "You are a helpful coding assistant. You are working inside a git repository. Use read_file to inspect code, edit_file for an exact unique search-and-replace, and bash to run commands. Verify your work before you finish. Do not commit, push, or change git remotes. Stop calling tools when the task is done. A pull request is opened for you afterward.";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: openRouterApiKey || "missing",
});

async function getToolResponse(
  runner: Runner,
  call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
): Promise<string> {
  try {
    if (call.type !== "function") return `Error: unknown tool "${call.custom.name}"`;

    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(call.function.arguments || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return "Error: tool arguments must be a JSON object";
      }
      args = parsed as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: failed to parse tool arguments: ${message}`;
    }

    if (call.function.name === "bash") {
      if (typeof args.command !== "string") return "Error: bash requires a string command";
      return await runner.bash(args.command);
    }
    if (call.function.name === "read_file") {
      if (typeof args.path !== "string") return "Error: read_file requires a string path";
      return await runner.readFile(args.path);
    }
    if (call.function.name === "edit_file") {
      if (typeof args.path !== "string") return "Error: edit_file requires a string path";
      if (typeof args.old_string !== "string" || typeof args.new_string !== "string") {
        return "Error: edit_file requires string old_string and new_string";
      }
      return await runner.editFile(args.path, args.old_string, args.new_string);
    }
    return `Error: unknown tool "${call.function.name}"`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }
}

export async function agentLoop(task: string, runner: Runner): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
  ];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const response = await withRetries(
      () => client.chat.completions.create({ model: agentModel, messages, tools }),
      {
        onRetry: (attempt, delayMs) => {
          console.log(`Model request failed (${attempt}/3). Retrying in ${delayMs}ms.`);
        },
      },
    );
    const message = response.choices[0]?.message;
    if (!message) return "The model returned an empty response.";

    messages.push(message);
    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return message.content ?? "";

    const groups = groupToolCalls(toolCalls, isReadOnly);
    for (const group of groups) {
      for (const call of group) logTool(iteration, call);
      const contents = await Promise.all(group.map((call) => getToolResponse(runner, call)));
      group.forEach((call, index) => {
        messages.push({ role: "tool", tool_call_id: call.id, content: contents[index] ?? "" });
      });
    }
  }

  return `Stopped after ${maxIterations} iterations without a final answer.`;
}

function isReadOnly(call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall): boolean {
  return call.type === "function" && call.function.name === "read_file";
}

function logTool(iteration: number, call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall): void {
  const name = call.type === "function" ? call.function.name : "unknown";
  const args = call.type === "function" ? call.function.arguments : "";
  const shown = args.length > 500 ? `${args.slice(0, 500)}...` : args;
  console.log(`[iteration ${iteration}] tool: ${name} ${shown}`);
}
