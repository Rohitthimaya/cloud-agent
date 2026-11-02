import { addTodo, listTodos } from "./store";

Bun.serve({
  port: 3001,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === "/todos") {
      return Response.json(listTodos());
    }
    if (req.method === "POST" && pathname === "/todos") {
      const body = (await req.json()) as { title?: string };
      if (!body.title) return Response.json({ error: "title required" }, { status: 400 });
      return Response.json(addTodo(body.title), { status: 201 });
    }
    return new Response("Not found", { status: 404 });
  },
});
