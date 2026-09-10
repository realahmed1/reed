import { createServer } from "node:http";
import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectDirectory, "out/web");
const host = "127.0.0.1";
const port = 4173;
const assetTypes = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["browser.js", "text/javascript; charset=utf-8"],
  [".nojekyll", "text/plain; charset=utf-8"]
]);
const routes = new Map();

try {
  // Load only known regular assets, never paths supplied by a request.
  for (const [name, contentType] of assetTypes) {
    const assetPath = resolve(outputDirectory, name);
    if (!(await lstat(assetPath)).isFile()) {
      throw new Error("Unexpected preview asset type.");
    }
    const asset = { body: await readFile(assetPath), contentType };
    routes.set(`/${name}`, asset);
    routes.set(`/reed/${name}`, asset);
    if (name === "index.html") {
      routes.set("/", asset);
      routes.set("/reed/", asset);
    }
  }
} catch {
  throw new Error("Reed Web preview needs a valid build. Run npm run build:web first.");
}

const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");

  if (![`${host}:${port}`, `localhost:${port}`].includes(request.headers.host)) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  // Exact matching intentionally rejects encoded or normalized traversal paths.
  const path = (request.url ?? "").split("?")[0];
  if (path === "/reed") {
    response.writeHead(307, { Location: "/reed/" });
    response.end();
    return;
  }
  const asset = routes.get(path);
  if (!asset) {
    response.writeHead(404);
    response.end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": asset.contentType,
    "Content-Length": asset.body.byteLength
  });
  response.end(request.method === "HEAD" ? undefined : asset.body);
});

server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 1_000;
server.on("error", () => {
  console.error("Reed Web preview could not start. Check whether port 4173 is already in use.");
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log("Reed Web preview is ready on 127.0.0.1:4173.");
});
