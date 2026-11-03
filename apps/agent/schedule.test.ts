import { describe, expect, test } from "bun:test";
import { groupToolCalls } from "./schedule.ts";

describe("groupToolCalls", () => {
  test("batches consecutive read-only calls and keeps writes alone", () => {
    const calls = ["read_file", "read_file", "bash", "read_file", "edit_file"].map((name) => ({ name }));
    const groups = groupToolCalls(calls, (call) => call.name === "read_file");
    expect(groups.map((group) => group.map((call) => call.name))).toEqual([
      ["read_file", "read_file"],
      ["bash"],
      ["read_file"],
      ["edit_file"],
    ]);
  });
});
