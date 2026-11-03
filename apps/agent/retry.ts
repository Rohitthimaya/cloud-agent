import { APIError } from "openai";

export function isRetryable(error: unknown): boolean {
  if (!(error instanceof APIError)) return false;
  return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
}

export async function withRetries<T>(
  run: () => Promise<T>,
  options: { attempts?: number; sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, delayMs: number) => void } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const sleep = options.sleep ?? ((ms) => Bun.sleep(ms));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) throw error;
      const delayMs = 500 * 2 ** (attempt - 1);
      options.onRetry?.(attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
