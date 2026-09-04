import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const executable = process.platform === "win32"
  ? resolve(projectDirectory, "node_modules", "electron", "dist", "electron.exe")
  : resolve(projectDirectory, "node_modules", ".bin", "electron");
const smokeUserDataDirectory = await mkdtemp(resolve(tmpdir(), "reed-smoke-"));

const child = spawn(executable, ["--disable-gpu", `--user-data-dir=${smokeUserDataDirectory}`, "."], {
  cwd: projectDirectory,
  env: { ...process.env, REED_SMOKE_TEST: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill();
}, 15_000);

child.stdout.on("data", (data) => { output += data.toString(); });
child.stderr.on("data", (data) => { output += data.toString(); });

child.on("error", (error) => {
  clearTimeout(timeout);
  void rm(smokeUserDataDirectory, { recursive: true, force: true });
  throw error;
});

child.on("close", (code) => {
  clearTimeout(timeout);
  void rm(smokeUserDataDirectory, { recursive: true, force: true });
  if (timedOut || code !== 0 || !output.includes("REED_SMOKE_READY")) {
    console.error(output);
    throw new Error("Reed desktop smoke check failed.");
  }

  console.log("Reed desktop smoke check passed.");
});
