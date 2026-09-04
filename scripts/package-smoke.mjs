import { spawn } from "node:child_process";
import electronFuses from "@electron/fuses";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");
const { getCurrentFuseWire, FuseV1Options } = electronFuses;
const FUSE_DISABLED = "0".charCodeAt(0);
const FUSE_ENABLED = "1".charCodeAt(0);
const packageMetadata = JSON.parse(await readFile(resolve(projectDirectory, "package.json"), "utf8"));
const outputDirectory = packageMetadata.build?.directories?.output;
const executableName = packageMetadata.build?.win?.executableName;
const configuredAppId = packageMetadata.build?.appId;

if (typeof outputDirectory !== "string" || typeof executableName !== "string" || typeof configuredAppId !== "string") {
  throw new Error("The Windows package output metadata is incomplete.");
}

const executable = resolve(projectDirectory, outputDirectory, "win-unpacked", `${executableName}.exe`);
const compiledMain = await readFile(resolve(projectDirectory, "dist", "main.js"), "utf8");

if (!compiledMain.includes(JSON.stringify(configuredAppId))) {
  throw new Error("The runtime Windows application ID does not match build.appId.");
}

await stat(executable);
const fuseWire = await getCurrentFuseWire(executable);
const expectedFuses = new Map([
  [FuseV1Options.RunAsNode, FUSE_DISABLED],
  [FuseV1Options.EnableCookieEncryption, FUSE_ENABLED],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FUSE_DISABLED],
  [FuseV1Options.EnableNodeCliInspectArguments, FUSE_DISABLED],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FUSE_ENABLED],
  [FuseV1Options.OnlyLoadAppFromAsar, FUSE_ENABLED],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FUSE_DISABLED],
  // Reed's local renderer currently loads from file://, so this fuse must remain enabled.
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FUSE_ENABLED]
]);

for (const [fuse, expectedState] of expectedFuses) {
  if (fuseWire[fuse] !== expectedState) {
    throw new Error(`Packaged Electron fuse ${fuse} does not match the release policy.`);
  }
}

const smokeUserDataDirectory = await mkdtemp(resolve(tmpdir(), "reed-packaged-smoke-"));

const child = spawn(executable, ["--disable-gpu", `--user-data-dir=${smokeUserDataDirectory}`], {
  cwd: projectDirectory,
  env: { ...process.env, REED_SMOKE_TEST: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});

let exitCode;
let output = "";

child.stdout.on("data", (data) => { output += data.toString(); });
child.stderr.on("data", (data) => { output += data.toString(); });

try {
  exitCode = await new Promise((resolveExit, reject) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 20_000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`The packaged Reed application did not finish its startup check within 20 seconds.\n${output.trim()}`));
        return;
      }

      resolveExit(code);
    });
  });
} finally {
  await rm(smokeUserDataDirectory, { recursive: true, force: true });
}

if (exitCode !== 0) {
  throw new Error(`The packaged Reed application exited with code ${exitCode}.`);
}

if (!output.includes("REED_SMOKE_READY")) {
  throw new Error(`The packaged Reed renderer did not report readiness.\n${output.trim()}`);
}

console.info("Packaged Reed startup and Electron fuse checks passed.");
