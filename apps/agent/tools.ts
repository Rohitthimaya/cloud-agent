import type OpenAI from "openai";

export interface Runner {
  bash(command: string): Promise<string>;
  readFile(path: string): Promise<string>;
  editFile(path: string, oldString: string, newString: string): Promise<string>;
  close(): Promise<void>;
}

export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Run a bash command in the repository. Returns JSON with stdout, stderr, and exitCode. A command that exceeds the timeout returns TIMEOUT.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to execute" },
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
        "Read a file from the repository. Returns contents with line numbers, capped at the first 500 lines.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to the repository root" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace one exact occurrence of old_string with new_string in a repository file. old_string must match exactly once, including whitespace. Fails if the text is missing or appears more than once.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to the repository root" },
          old_string: { type: "string", description: "Exact text to replace" },
          new_string: { type: "string", description: "Replacement text" },
        },
        required: ["path", "old_string", "new_string"],
        additionalProperties: false,
      },
    },
  },
];

export function truncate(text: string): string {
  if (text.length <= 4000) return text;
  return `${text.slice(0, 2000)}...[truncated]...${text.slice(-2000)}`;
}

export function formatFile(content: string): string {
  const lines = content.split(/\r?\n/);
  const shown = lines.slice(0, 500);
  const numbered = shown.map((line, index) => `${index + 1}|${line}`).join("\n");
  const body =
    lines.length > 500
      ? `${numbered}\n...[truncated after 500 lines, ${lines.length - 500} more]`
      : numbered;
  return truncate(body);
}

export function bashResult(stdout: string, stderr: string, exitCode: number | null): string {
  return truncate(JSON.stringify({ stdout, stderr, exitCode }));
}
