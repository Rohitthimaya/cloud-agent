import { expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";

const port = 4317;
const base = `http://127.0.0.1:${port}`;

test("DELETE /todos/:id removes the todo", async () => {
  const child = await startServer();
  try {
    const created = await fetch(`${base}/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "milk" }),
    });
    expect(created.status).toBe(201);
    const todo = (await created.json()) as { id: number; title: string };
    const deleted = await fetch(`${base}/todos/${todo.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ id: todo.id, title: "milk" });
    expect(await (await fetch(`${base}/todos`)).json()).toEqual([]);
    const missing = await fetch(`${base}/todos/9999`, { method: "DELETE" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not found" });
  } finally {
    stop(child);
  }
});

async function startServer(): Promise<ChildProcess> {
  const child = spawn("bun", ["src/server.ts"], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/todos`);
      if (response.ok) return child;
    } catch {
      // The server is still starting.
    }
    await Bun.sleep(50);
  }
  stop(child);
  throw new Error("server did not start");
}

function stop(child: ChildProcess): void {
  child.kill("SIGKILL");
}
