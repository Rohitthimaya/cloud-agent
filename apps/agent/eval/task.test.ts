import { describe, expect, test } from "bun:test";
import path from "node:path";
import { loadTasks, parseTask } from "./task.ts";

const root = path.resolve(import.meta.dir, "../../..");

describe("parseTask", () => {
  test("loads the local tasks", () => {
    const tasks = loadTasks(path.join(root, "evals/tasks"));
    expect(tasks.map((task) => task.id)).toEqual(["todo-delete", "todo-done"]);
    expect(tasks[0]?.hidden[0]?.dest).toBe("delete.test.ts");
  });

  test("turns a SWE-bench instance into a cloud task", () => {
    const task = parseTask({
      instance_id: "acme__app-12",
      repo: "acme/app",
      base_commit: "abc1234",
      problem_statement: "The login page is broken.",
      fail_to_pass: JSON.stringify(["tests/test_login.py::test_redirect"]),
      test_patch: "diff --git a/tests/test_login.py b/tests/test_login.py\n",
    });
    expect(task).toMatchObject({
      id: "acme__app-12",
      mode: "cloud",
      repo: "https://github.com/acme/app",
      baseCommit: "abc1234",
      verify: "python -m pytest -q 'tests/test_login.py::test_redirect'",
    });
  });

  test("rejects a commit that is not a sha", () => {
    expect(() => parseTask({ id: "x", repo: "apps/todoapp", problem: "fix", verify: "true", baseCommit: "main" })).toThrow(
      /Invalid commit/,
    );
  });
});
