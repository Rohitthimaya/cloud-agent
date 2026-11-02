const LOCAL_TIMEOUT_MS = 5_000;
const SANDBOX_TIMEOUT_MS = 60_000;

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export const openRouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
export const e2bApiKey = process.env.E2B_API_KEY ?? "";
export const agentModel = process.env.AGENT_MODEL || "google/gemini-3-flash-preview";
export const maxIterations = positiveInt("MAX_ITERATIONS", 15);

export function toolTimeoutMs(mode: "local" | "sandbox"): number {
  if (process.env.TOOL_TIMEOUT_MS !== undefined && process.env.TOOL_TIMEOUT_MS.trim() !== "") {
    return positiveInt("TOOL_TIMEOUT_MS", mode === "sandbox" ? SANDBOX_TIMEOUT_MS : LOCAL_TIMEOUT_MS);
  }
  return mode === "sandbox" ? SANDBOX_TIMEOUT_MS : LOCAL_TIMEOUT_MS;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy apps/agent/.env.example to apps/agent/.env and set it.`);
    process.exit(1);
  }
  return value;
}
