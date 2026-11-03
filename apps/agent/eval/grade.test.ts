import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { copyRepo, gradeWorkspace, isSolved } from "./grade.ts";
import { loadTasks, type EvalTask } from "./task.ts";

const root = path.resolve(import.meta.dir, "../../..");

describe("gradeWorkspace", () => {
  test("fails the untouched app and passes a workspace that implements the routes", async () => {
    const tasks = loadTasks(path.join(root, "evals/tasks"));
    const deleteTask = required(tasks, "todo-delete");
    const doneTask = required(tasks, "todo-done");
    const broken = mkdtempSync(path.join(tmpdir(), "cloud-agent-broken-"));
    const fixed = mkdtempSync(path.join(tmpdir(), "cloud-agent-fixed-"));
    try {
      copyRepo(path.join(root, "apps/todoapp"), broken);
      copyRepo(path.join(root, "apps/todoapp"), fixed);
      writeFileSync(path.join(fixed, "src/store.ts"), fixedStore);
      writeFileSync(path.join(fixed, "src/server.ts"), fixedServer);

      expect(isSolved(await gradeWorkspace(broken, root, deleteTask))).toBe(false);
      expect(isSolved(await gradeWorkspace(broken, root, doneTask))).toBe(false);
      expect(isSolved(await gradeWorkspace(fixed, root, deleteTask))).toBe(true);
      expect(isSolved(await gradeWorkspace(fixed, root, doneTask))).toBe(true);
    } finally {
      rmSync(broken, { recursive: true, force: true });
      rmSync(fixed, { recursive: true, force: true });
    }
  }, 30_000);
});

function required(tasks: EvalTask[], id: string): EvalTask {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error(`missing ${id}`);
  return task;
}

const fixedStore = `export type Todo = { id: number; title: string; done: boolean };

const todos: Todo[] = [];
let nextId = 1;

export function listTodos(): Todo[] {
  return todos;
}

export function addTodo(title: string): Todo {
  const todo: Todo = { id: nextId++, title, done: false };
  todos.push(todo);
  return todo;
}

export function deleteTodo(id: number): Todo | null {
  const index = todos.findIndex((todo) => todo.id === id);
  if (index < 0) return null;
  return todos.splice(index, 1)[0] ?? null;
}

export function setDone(id: number, done: boolean): Todo | null {
  const todo = todos.find((item) => item.id === id);
  if (!todo) return null;
  todo.done = done;
  return todo;
}
`;

const fixedServer = `import { addTodo, deleteTodo, listTodos, setDone } from "./store";

const port = Number(process.env.PORT) || 3001;

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\\/todos\\/(\\d+)$/);
    if (req.method === "GET" && url.pathname === "/todos") return Response.json(listTodos());
    if (req.method === "POST" && url.pathname === "/todos") {
      const body = (await req.json()) as { title?: string };
      if (!body.title) return Response.json({ error: "title required" }, { status: 400 });
      return Response.json(addTodo(body.title), { status: 201 });
    }
    if (match?.[1] && req.method === "DELETE") {
      const todo = deleteTodo(Number(match[1]));
      if (!todo) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(todo);
    }
    if (match?.[1] && req.method === "PATCH") {
      const body = (await req.json()) as { done?: unknown };
      if (typeof body.done !== "boolean") return Response.json({ error: "done required" }, { status: 400 });
      const todo = setDone(Number(match[1]), body.done);
      if (!todo) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(todo);
    }
    return new Response("Not found", { status: 404 });
  },
});
`;
