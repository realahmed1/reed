import { build } from "esbuild";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webBuild = process.argv.includes("--web");
const outputDirectory = resolve(projectDirectory, webBuild ? "out/web" : "dist/renderer");
const outputName = webBuild ? "browser.js" : "renderer.js";
const outputPath = resolve(outputDirectory, outputName);
const browserJavaScriptBudget = 100_000;
const webAssets = new Set(["index.html", "styles.css", "browser.js", ".nojekyll"]);

const result = await build({
  absWorkingDir: projectDirectory,
  entryPoints: [webBuild ? "src/browser/browser.ts" : "src/renderer/renderer.ts"],
  outfile: outputPath,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  sourcemap: false,
  metafile: true,
  write: false,
  logLevel: "silent"
});

if (webBuild) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const source = relative(projectDirectory, resolve(projectDirectory, input)).replaceAll("\\", "/");
    if (!source.startsWith("src/core/") && !source.startsWith("src/browser/") && source !== "src/renderer/reader.ts") {
      throw new Error("The browser bundle contains a dependency outside its approved shared-source boundary.");
    }
  }
  if (Object.values(result.metafile.outputs).some((output) => output.imports.length > 0)) {
    throw new Error("The browser bundle must not depend on external runtime imports.");
  }
}

if (result.outputFiles.length !== 1 || resolve(result.outputFiles[0].path) !== outputPath) {
  throw new Error("The reader build produced unexpected output files.");
}

const javascript = result.outputFiles[0].contents;
if (webBuild && javascript.byteLength > browserJavaScriptBudget) {
  throw new Error("The browser JavaScript exceeds its 100,000-byte performance budget.");
}

await mkdir(outputDirectory, { recursive: true });
if (webBuild) {
  // Fail instead of deleting unfamiliar files that could otherwise be published.
  const existing = await readdir(outputDirectory, { withFileTypes: true });
  if (existing.some((entry) => !entry.isFile() || !webAssets.has(entry.name))) {
    throw new Error("The browser output folder contains unexpected files. Review them before building.");
  }
  await copyFile(resolve(projectDirectory, "src/browser/index.html"), resolve(outputDirectory, "index.html"));
  await copyFile(resolve(projectDirectory, "src/renderer/styles.css"), resolve(outputDirectory, "styles.css"));
  await writeFile(resolve(outputDirectory, ".nojekyll"), "");
}

await writeFile(outputPath, javascript);
console.log(`${webBuild ? "Browser" : "Desktop"} reader bundle built (${javascript.byteLength} bytes).`);
