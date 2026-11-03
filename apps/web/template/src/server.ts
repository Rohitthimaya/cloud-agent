const port = Number(process.env.PORT) || 3000;

Bun.serve({
  port,
  fetch() {
    return new Response("<!doctype html><title>starter</title><p>cloud-agent-starter</p>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});
