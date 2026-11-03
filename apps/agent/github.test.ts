import { describe, expect, test } from "bun:test";
import { parseGitHubRepo, pullRequestBody, pullRequestTitle } from "./github.ts";

describe("parseGitHubRepo", () => {
  test("parses https and ssh GitHub URLs", () => {
    expect(parseGitHubRepo("https://github.com/Rohitthimaya/cloud-agent")).toEqual({
      owner: "Rohitthimaya",
      repo: "cloud-agent",
    });
    expect(parseGitHubRepo("https://github.com/Rohitthimaya/cloud-agent.git")).toEqual({
      owner: "Rohitthimaya",
      repo: "cloud-agent",
    });
    expect(parseGitHubRepo("git@github.com:Rohitthimaya/cloud-agent.git")).toEqual({
      owner: "Rohitthimaya",
      repo: "cloud-agent",
    });
  });

  test("rejects other hosts", () => {
    expect(parseGitHubRepo("https://gitlab.com/acme/app")).toBeNull();
  });
});

describe("pull request text", () => {
  test("keeps the title short and includes the task in the body", () => {
    expect(pullRequestTitle(`a`.repeat(80))).toHaveLength(72);
    expect(pullRequestBody("fix the bug", "I added a test.")).toContain("fix the bug");
    expect(pullRequestBody("fix the bug", "I added a test.")).toContain("I added a test.");
  });
});
