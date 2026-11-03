export type Page = "home" | "eval" | "build";

export function page(active: Page, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cloud agent harness</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #12110e;
      --paper: #1c1b16;
      --ink: #f4efe4;
      --muted: #b3aa9a;
      --line: #343228;
      --amber: #e6b15a;
      --ok: #c6dd8e;
      --bad: #ef9078;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 17px/1.5 "Avenir Next", "Segoe UI", sans-serif;
    }
    a { color: inherit; }
    header, main { width: min(1080px, calc(100% - 32px)); margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 22px 0;
      border-bottom: 1px solid var(--line);
    }
    .brand { font-weight: 650; letter-spacing: 0.02em; text-decoration: none; }
    nav { display: flex; gap: 8px; }
    nav a {
      text-decoration: none;
      color: var(--muted);
      padding: 6px 10px;
      border-radius: 999px;
    }
    nav a[aria-current="page"] { color: var(--bg); background: var(--amber); }
    main { padding: 36px 0 72px; }
    h1 {
      margin: 0 0 12px;
      font: 52px/1.05 "Iowan Old Style", Palatino, Georgia, serif;
      font-weight: 560;
      letter-spacing: -0.03em;
    }
    h2 { font: 28px/1.2 "Iowan Old Style", Palatino, Georgia, serif; margin: 0 0 8px; }
    .lede { max-width: 640px; color: var(--muted); margin: 0 0 28px; }
    .diagram {
      display: grid;
      gap: 14px;
      margin: 8px 0 36px;
    }
    .row { display: grid; grid-template-columns: 1fr 28px 1fr 28px 1fr; gap: 8px; align-items: stretch; }
    .node, .outcome {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
    }
    .node span, .outcome span {
      display: block;
      color: var(--amber);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .node h3, .outcome h3 { margin: 6px 0; font-size: 18px; }
    .node p, .outcome p { margin: 0; color: var(--muted); font-size: 14px; }
    .arrow, .down {
      position: relative;
    }
    .arrow::before, .down::before {
      content: "";
      position: absolute;
      background: var(--amber);
    }
    .arrow::before { left: 0; right: 0; top: 50%; height: 1px; }
    .down { height: 22px; }
    .down::before { top: 0; bottom: 0; left: 50%; width: 1px; }
    .outcomes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
    button, .button {
      appearance: none;
      border: 0;
      background: var(--amber);
      color: #221b0d;
      font: 600 15px/1 "Avenir Next", sans-serif;
      padding: 12px 16px;
      border-radius: 999px;
      text-decoration: none;
      cursor: pointer;
    }
    button:disabled { opacity: 0.55; cursor: wait; }
    form { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0; }
    input[type="text"] {
      flex: 1 1 280px;
      background: var(--paper);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      font: 16px/1.3 "Avenir Next", sans-serif;
    }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .chips button { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    .banner {
      margin: 16px 0;
      padding: 18px 20px;
      border-radius: 16px;
      font: 42px/1 "Iowan Old Style", Palatino, Georgia, serif;
    }
    .banner.ok { background: #24301a; color: var(--ok); }
    .banner.bad { background: #3a221c; color: var(--bad); }
    .link {
      display: inline-block;
      margin: 8px 0 16px;
      color: var(--amber);
      font-size: 18px;
    }
    pre {
      white-space: pre-wrap;
      background: #0c0c0a;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      min-height: 180px;
      max-height: 420px;
      overflow: auto;
      color: #ddd6c8;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    iframe {
      width: 100%;
      height: 720px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: white;
    }
    @media (max-width: 800px) {
      h1 { font-size: 38px; }
      .row, .outcomes { grid-template-columns: 1fr; }
      .arrow { display: none; }
    }
  </style>
</head>
<body data-kind="${active}">
  <header>
    <a class="brand" href="/">Cloud agent</a>
    <nav>
      <a href="/" ${active === "home" ? 'aria-current="page"' : ""}>Architecture</a>
      <a href="/eval" ${active === "eval" ? 'aria-current="page"' : ""}>SWE test</a>
      <a href="/build" ${active === "build" ? 'aria-current="page"' : ""}>Build</a>
    </nav>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

export function homePage(): string {
  return page(
    "home",
    `<h1>A task goes in. A test result or a running app comes out.</h1>
    <p class="lede">This site is the interface. It hands work to the same agent loop: the model asks for tools, our code runs them, and a hidden check decides what happened.</p>
    <section class="diagram" aria-label="System architecture">
      <div class="row">
        <article class="node"><span>01 Interface</span><h3>This website</h3><p>Someone types a SWE-bench run or a thing to build.</p></article>
        <div class="arrow" aria-hidden="true"></div>
        <article class="node"><span>02 Orchestrator</span><h3>A job</h3><p>The request is queued here. The page watches the log until the job ends.</p></article>
        <div class="arrow" aria-hidden="true"></div>
        <article class="node"><span>03 Agent loop</span><h3>The model</h3><p>OpenRouter keeps the message list. No tool call means it is done.</p></article>
      </div>
      <div class="down" aria-hidden="true"></div>
      <div class="row">
        <article class="node"><span>04 Tools</span><h3>bash, read, edit</h3><p>The model does not touch the disk. These tools do, one edit at a time.</p></article>
        <div class="arrow" aria-hidden="true"></div>
        <article class="node"><span>05 Sandbox</span><h3>A fresh copy</h3><p>SWE-bench runs in a copy of pylint. A build runs in its own folder. Cloud mode uses an E2B machine.</p></article>
        <div class="arrow" aria-hidden="true"></div>
        <article class="node"><span>06 Output</span><h3>A verdict or a link</h3><p>The model's goodbye is not the score. The test exit code, or a live page, is.</p></article>
      </div>
      <div class="outcomes">
        <article class="outcome"><span>SWE-bench</span><h3>Solved or not solved</h3><p>pylint-dev__pylint-5859. The official test fails until punctuation notes are recognized.</p></article>
        <article class="outcome"><span>Build</span><h3>A preview link</h3><p>Type "build a todo app". The agent edits a Bun server and this site serves it.</p></article>
      </div>
    </section>
    <div class="actions">
      <a class="button" href="/eval">Run the SWE test</a>
      <a class="button" href="/build">Build something</a>
    </div>`,
  );
}

export function evalPage(): string {
  return page(
    "eval",
    `<h1>SWE-bench</h1>
    <p class="lede">pylint-dev__pylint-5859. Pylint ignores a notes tag made only of punctuation, so <code># ???</code> never warns. The harness copies that commit, lets the agent edit, then runs the official test.</p>
    <button id="run" type="button">Run harness</button>
    <div id="banner" class="banner" hidden></div>
    <pre id="log">The run takes about a minute. The last line that matters is SOLVED or NOT SOLVED.</pre>
    ${script("eval")}`,
  );
}

export function buildPage(): string {
  return page(
    "build",
    `<h1>Build it and open the link</h1>
    <p class="lede">The sentence becomes a Bun app. When the server is up, the link below is the deployment. It stays on this machine for as long as this website is running.</p>
    <div class="chips">
      <button type="button" data-fill="Build a todo app">Todo app</button>
      <button type="button" data-fill="Build a one-page notes app">Notes</button>
      <button type="button" data-fill="Build a tip calculator">Tip calculator</button>
    </div>
    <form id="build-form">
      <input id="prompt" name="prompt" type="text" placeholder="Build a todo app" required>
      <button id="run" type="submit">Build and deploy</button>
    </form>
    <div id="banner" class="banner" hidden></div>
    <a id="open" class="link" hidden target="_blank" rel="noreferrer"></a>
    <iframe id="frame" title="Deployed app" hidden></iframe>
    <pre id="log"></pre>
    ${script("build")}`,
  );
}

function script(kind: "eval" | "build"): string {
  return `<script>
    const kind = ${JSON.stringify(kind)};
    const run = document.querySelector("#run");
    const log = document.querySelector("#log");
    const banner = document.querySelector("#banner");
    const form = document.querySelector("#build-form");
    const prompt = document.querySelector("#prompt");
    const open = document.querySelector("#open");
    const frame = document.querySelector("#frame");
    for (const chip of document.querySelectorAll("[data-fill]")) {
      chip.addEventListener("click", () => { prompt.value = chip.dataset.fill; prompt.focus(); });
    }
    async function start(body) {
      run.disabled = true;
      banner.hidden = true;
      if (open) open.hidden = true;
      if (frame) { frame.hidden = true; frame.removeAttribute("src"); }
      const response = await fetch(kind === "eval" ? "/api/eval" : "/api/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const job = await response.json();
      if (!response.ok) {
        log.textContent = job.error || "Could not start";
        run.disabled = false;
        return;
      }
      poll(job.id);
    }
    async function poll(id) {
      const job = await fetch("/api/jobs/" + id).then((response) => response.json());
      log.textContent = job.logs || "Running…";
      log.scrollTop = log.scrollHeight;
      if (job.status === "running") {
        setTimeout(() => poll(id), 800);
        return;
      }
      run.disabled = false;
      const ok = job.status === "passed";
      banner.hidden = false;
      banner.className = ok ? "banner ok" : "banner bad";
      banner.textContent = kind === "eval" ? (ok ? "SOLVED" : "NOT SOLVED") : (ok ? "Deployed" : "Did not deploy");
      if (ok && job.url && open && frame) {
        const href = job.url.startsWith("http") ? job.url : location.origin + job.url;
        open.hidden = false;
        open.href = href;
        open.textContent = href;
        frame.hidden = false;
        frame.src = href;
      }
    }
    if (form) form.addEventListener("submit", (event) => { event.preventDefault(); start({ prompt: prompt.value }); });
    else run.addEventListener("click", () => start());
    fetch("/api/jobs").then((response) => response.json()).then((jobs) => {
      const latest = jobs.find((job) => job.kind === kind);
      if (latest) {
        if (latest.status === "running") run.disabled = true;
        poll(latest.id);
      }
    });
  </script>`;
}
