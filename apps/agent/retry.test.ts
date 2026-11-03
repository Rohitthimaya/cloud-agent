import { describe, expect, test } from "bun:test";
import { APIError } from "openai";
import { isRetryable, withRetries } from "./retry.ts";

describe("isRetryable", () => {
  test("retries rate limits and server errors only", () => {
    expect(isRetryable(new APIError(429, undefined, "limited", undefined))).toBe(true);
    expect(isRetryable(new APIError(503, undefined, "down", undefined))).toBe(true);
    expect(isRetryable(new APIError(400, undefined, "bad", undefined))).toBe(false);
    expect(isRetryable(new Error("network"))).toBe(false);
  });
});

describe("withRetries", () => {
  test("retries a rate limit and then returns", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetries(
      () => {
        calls += 1;
        if (calls < 3) throw new APIError(429, undefined, "limited", undefined);
        return Promise.resolve("ok");
      },
      { sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(delays).toEqual([500, 1000]);
  });

  test("does not retry a bad request", async () => {
    let calls = 0;
    await expect(
      withRetries(() => {
        calls += 1;
        throw new APIError(400, undefined, "bad", undefined);
      }),
    ).rejects.toThrow("bad");
    expect(calls).toBe(1);
  });
});
