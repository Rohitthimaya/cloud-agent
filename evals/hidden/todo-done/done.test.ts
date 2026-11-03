import { expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";

const port = 4318;
const base = `http://127.0.0.1:${port}`;

test("PATCH /todos/:id sets done", async () => {
  const child = await startServer();
  try {
    const created = await fetch(`${base}/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "milk" }),
    });
    expect(created.status).toBe(201);
    const todo = (await created.json()) as { id: number; done: boolean };
    expect(todo.done).toBe(false);

    const patched = await fetch(`${base}/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: todo.id, done: true });

    const bad = await fetch(`${base}/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: "yes" }),
    });
    expect(bad.status).toBe(400);

    const missing = await fetch(`${base}/todos/9999`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: false }),
    });
    expect(missing.status).toBe(404);
  } finally {
    child.kill("SIGKILL");
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
  child.kill("SIGKILL");
  throw new Error("server did not start");
}
