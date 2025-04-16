import { build } from "bun";
import { join } from "path";

const outdir = join(import.meta.dir, "dist");
const entry = join(import.meta.dir, "main.tsx");

await build({
  entrypoints: [entry],
  outdir,
  target: "browser",
  splitting: false,
  sourcemap: "external",
  minify: false,
});

console.log("[playground/ui] Build complete.");
