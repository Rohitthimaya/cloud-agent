export interface Cli {
  mode: "cloud" | "local";
  target: string;
  task: string;
  noPr: boolean;
  base?: string;
}

export function parseCli(argv: string[]): Cli | null {
  const [mode, target, ...rest] = argv;
  if ((mode !== "cloud" && mode !== "local") || !target) return null;

  let noPr = false;
  let base: string | undefined;
  const taskWords: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--no-pr") {
      noPr = true;
      continue;
    }
    if (arg === "--base") {
      const value = rest[i + 1];
      if (!value || value.startsWith("--")) return null;
      base = value;
      i += 1;
      continue;
    }
    if (arg !== undefined) taskWords.push(arg);
  }

  const task = taskWords.join(" ").trim();
  if (!task) return null;
  return { mode, target, task, noPr, base };
}
