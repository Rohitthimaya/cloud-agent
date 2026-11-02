import OpenAI from "openai";
import { agentModel, maxIterations, openRouterApiKey } from "./config.ts";
import { tools, type Runner } from "./tools.ts";

const SYSTEM_PROMPT =
  "You are a helpful coding assistant. You are working inside a git repository. Use the tools to explore and change files. Verify your work by running commands.";

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
    const response = await client.chat.completions.create({
      model: agentModel,
      messages,
      tools,
    });
    const message = response.choices[0]?.message;
    if (!message) return "The model returned an empty response.";

    messages.push(message);
    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return message.content ?? "";

    for (const call of toolCalls) {
      const name = call.type === "function" ? call.function.name : "unknown";
      const args = call.type === "function" ? call.function.arguments : "";
      console.log(`[iteration ${iteration}] tool: ${name} ${args}`);
      const content = await getToolResponse(runner, call);
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

  return `Stopped after ${maxIterations} iterations without a final answer.`;
}
