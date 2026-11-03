import path from "node:path";
import { buildPage, evalPage, homePage } from "./html.ts";
import { getJob, listJobs, startBuild, startEval, stopAll } from "./jobs.ts";

const root = path.resolve(import.meta.dir, "../..");
const port = Number(process.env.PORT) || 8787;

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const preview = url.pathname.match(/^\/preview\/([^/]+)(\/.*)?$/);
    if (preview?.[1]) {
      const job = getJob(preview[1]);
      if (!job?.port) return new Response("That deployment is not running.", { status: 404 });
      return proxy(job.port, req, preview[2] || "/");
    }
    if (req.method === "GET" && url.pathname === "/") return html(homePage());
    if (req.method === "GET" && url.pathname === "/eval") return html(evalPage());
    if (req.method === "GET" && url.pathname === "/build") return html(buildPage());
    if (req.method === "GET" && url.pathname === "/api/jobs") return json(listJobs());
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch?.[1]) {
      const job = getJob(jobMatch[1]);
      if (!job) return json({ error: "Unknown job" }, 404);
      return json(job);
    }
    if (req.method === "POST" && url.pathname === "/api/eval") return json(startEval(root), 202);
    if (req.method === "POST" && url.pathname === "/api/build") {
      const body = (await req.json().catch(() => null)) as { prompt?: unknown } | null;
      const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return json({ error: "Type what you want built." }, 400);
      return json(startBuild(root, prompt), 202);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Website http://127.0.0.1:${server.port}`);

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

function html(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function proxy(port: number, req: Request, pathname: string): Promise<Response> {
  const url = new URL(req.url);
  const target = `http://127.0.0.1:${port}${pathname}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const response = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
  });
  const out = new Headers(response.headers);
  out.delete("content-length");
  return new Response(response.body, { status: response.status, headers: out });
}
