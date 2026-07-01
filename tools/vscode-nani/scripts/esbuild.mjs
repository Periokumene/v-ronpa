import * as esbuild from "esbuild";

const production = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  outfile: "dist/extension.cjs",
  logLevel: "info"
});
