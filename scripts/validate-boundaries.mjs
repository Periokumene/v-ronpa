import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();

const packageRoots = {
  "contracts": "packages/contracts",
  "asset-project": "packages/asset-project",
  "asset-registry": "packages/asset-registry",
  "layered-character": "packages/layered-character",
  "nani-parser": "packages/nani-parser",
  "nani-project": "packages/nani-project",
  "nani-runtime-compiler": "packages/nani-runtime-compiler",
  "story-engine": "packages/story-engine",
  "story-play": "packages/story-play",
  "app-vn-session": "packages/app-vn-session",
  "app-vn-dispatch": "packages/app-vn-dispatch",
  "app-vn-runtime": "packages/app-vn-runtime",
  "app-vn-devtools": "packages/app-vn-devtools",
  "app-vn-shell": "packages/app-vn-shell",
  "gameplay": "packages/gameplay",
  "navi-director": "packages/navi-director",
  "trial-director": "packages/trial-director",
  "pixi-presenter": "packages/pixi-presenter",
  "pixi-stage-model": "packages/pixi-stage-model",
  "r3f-adapter": "packages/r3f-adapter",
  "ui-kit": "packages/ui-kit",
  "media-save": "packages/media-save",
  "game-flow-machine": "packages/game-flow-machine",
  "game-a": "apps/game-a",
  "game-harness": "apps/game-harness"
};

const allowedWorkspaceDeps = {
  "contracts": [],
  "asset-project": ["contracts"],
  "asset-registry": ["contracts"],
  "layered-character": ["contracts"],
  "nani-parser": [],
  "nani-project": ["contracts", "layered-character", "nani-parser", "nani-runtime-compiler"],
  "nani-runtime-compiler": ["contracts", "nani-parser"],
  "story-engine": ["contracts"],
  "story-play": ["contracts", "story-engine"],
  "app-vn-session": ["contracts", "nani-parser", "nani-runtime-compiler", "story-engine", "story-play"],
  "app-vn-dispatch": ["contracts", "nani-parser", "nani-runtime-compiler", "pixi-stage-model", "story-engine", "story-play"],
  "app-vn-runtime": [
    "app-vn-dispatch",
    "app-vn-session",
    "asset-registry",
    "contracts",
    "media-save",
    "nani-parser",
    "nani-runtime-compiler",
    "pixi-stage-model",
    "story-engine",
    "story-play"
  ],
  "app-vn-devtools": ["app-vn-runtime", "contracts", "layered-character", "nani-parser", "nani-project", "nani-runtime-compiler"],
  "app-vn-shell": ["app-vn-dispatch", "app-vn-runtime", "contracts", "media-save", "pixi-presenter", "pixi-stage-model", "story-engine", "story-play", "ui-kit"],
  "gameplay": ["contracts"],
  "navi-director": ["contracts", "gameplay"],
  "trial-director": ["contracts", "gameplay"],
  "pixi-stage-model": ["contracts"],
  "pixi-presenter": ["contracts", "layered-character", "pixi-stage-model"],
  "r3f-adapter": ["contracts"],
  "ui-kit": ["contracts"],
  "media-save": ["contracts"],
  "game-flow-machine": ["contracts"],
  "game-a": [
    "app-vn-devtools",
    "app-vn-runtime",
    "app-vn-shell",
    "asset-project",
    "asset-registry",
    "contracts",
    "game-flow-machine",
    "gameplay",
    "layered-character",
    "media-save",
    "ui-kit"
  ],
  "game-harness": [
    "app-vn-runtime",
    "app-vn-shell",
    "asset-project",
    "asset-registry",
    "contracts",
    "game-flow-machine",
    "gameplay",
    "layered-character",
    "media-save",
    "nani-parser",
    "nani-runtime-compiler",
    "navi-director",
    "pixi-presenter",
    "pixi-stage-model",
    "r3f-adapter",
    "story-engine",
    "story-play",
    "trial-director",
    "ui-kit"
  ]
};

const rendererAndBrowserAdapters = [
  "react",
  "react-dom",
  "@react-three/",
  "three",
  "pixi.js",
  "@pixi/",
  "dexie",
  "howler",
  "@radix-ui/"
];

const forbiddenExternalDeps = {
  "contracts": ["react", "react-dom", "@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "asset-project": rendererAndBrowserAdapters,
  "asset-registry": ["react", "react-dom", "@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "layered-character": rendererAndBrowserAdapters,
  "nani-parser": rendererAndBrowserAdapters,
  "nani-project": rendererAndBrowserAdapters,
  "nani-runtime-compiler": rendererAndBrowserAdapters,
  "story-engine": rendererAndBrowserAdapters,
  "story-play": rendererAndBrowserAdapters,
  "app-vn-session": rendererAndBrowserAdapters,
  "app-vn-dispatch": rendererAndBrowserAdapters,
  "pixi-stage-model": rendererAndBrowserAdapters,
  "app-vn-runtime": ["@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "app-vn-devtools": ["react-dom", "@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "app-vn-shell": ["@react-three/", "three", "dexie", "howler"],
  "gameplay": rendererAndBrowserAdapters,
  "navi-director": rendererAndBrowserAdapters,
  "trial-director": rendererAndBrowserAdapters,
  "game-flow-machine": ["react", "react-dom", "@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "media-save": ["react", "react-dom", "@react-three/", "three", "pixi.js", "@pixi/", "@radix-ui/"],
  "pixi-presenter": ["react", "react-dom", "@react-three/", "three", "dexie", "howler", "@radix-ui/"],
  "r3f-adapter": ["pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "ui-kit": ["@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler"],
  "game-a": ["@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler"],
  "game-harness": []
};

const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const lowLevelVnRuntimeImports = [
  "@v-ronpa/app-vn-session",
  "@v-ronpa/app-vn-dispatch",
  "@v-ronpa/story-play",
  "@v-ronpa/story-engine",
  "@v-ronpa/nani-parser",
  "@v-ronpa/nani-runtime-compiler",
  "@v-ronpa/pixi-presenter"
];
const vnRuntimeWrapperImportRules = [
  {
    path: "apps/game-a/src",
    allowTests: true,
    label: "Game A VN runtime source"
  },
  {
    path: "apps/game-harness/src/interaction/useHarnessShowcaseRuntimeAdapter.ts",
    allowTests: false,
    label: "Harness VN runtime adapter"
  }
];
const violations = [];
const rootByAbsPath = new Map(
  Object.entries(packageRoots).map(([pkg, pkgRoot]) => [resolve(root, pkgRoot), pkg])
);

for (const pkg of Object.keys(packageRoots)) {
  validateSourceImports(pkg);
  validatePackageJson(pkg);
  validateTsconfigReferences(pkg);
}
validateVnRuntimeWrapperImports();
validatePixiEffectIsolation();

if (violations.length > 0) {
  console.error("Boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Boundary validation passed.");

function validateSourceImports(pkg) {
  const src = join(root, packageRoots[pkg], "src");
  if (!existsSync(src)) return;

  for (const file of collectFiles(src)) {
    const text = stripComments(readFileSync(file, "utf8"));
    for (const specifier of collectImportSpecifiers(text)) {
      validateSpecifier({
        pkg,
        specifier,
        location: relative(root, file),
        source: "source import"
      });
    }
  }
}

function validatePackageJson(pkg) {
  const packageJsonPath = join(root, packageRoots[pkg], "package.json");
  if (!existsSync(packageJsonPath)) return;

  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  for (const field of dependencyFields) {
    const deps = manifest[field] ?? {};
    for (const depName of Object.keys(deps)) {
      validateSpecifier({
        pkg,
        specifier: depName,
        location: relative(root, packageJsonPath),
        source: `package.json ${field}`
      });
    }
  }
}

function validateTsconfigReferences(pkg) {
  const tsconfigPath = join(root, packageRoots[pkg], "tsconfig.json");
  if (!existsSync(tsconfigPath)) return;

  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  for (const ref of tsconfig.references ?? []) {
    if (!ref.path) continue;
    const targetRoot = resolve(dirname(tsconfigPath), ref.path);
    const targetPkg = rootByAbsPath.get(targetRoot);
    if (!targetPkg) continue;
    validateWorkspaceDep({
      pkg,
      targetPkg,
      location: relative(root, tsconfigPath),
      source: "tsconfig reference"
    });
  }
}

function validateVnRuntimeWrapperImports() {
  for (const rule of vnRuntimeWrapperImportRules) {
    const absolute = join(root, rule.path);
    if (!existsSync(absolute)) continue;
    const files = statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute];
    for (const file of files) {
      if (rule.allowTests && /\.(test|spec)\.(ts|tsx|js|jsx)$/u.test(file)) continue;
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/u.test(file)) continue;
      const rel = relative(root, file);
      const text = stripComments(readFileSync(file, "utf8"));
      for (const specifier of collectImportSpecifiers(text)) {
        const forbidden = lowLevelVnRuntimeImports.find((candidate) => isSamePackageOrSubpath(specifier, candidate));
        if (!forbidden) continue;
        violations.push(
          `${rel}: ${rule.label} must use @v-ronpa/app-vn-runtime instead of low-level VN runtime import '${specifier}'.`
        );
      }
    }
  }
}

function validatePixiEffectIsolation() {
  const presenterRoot = resolve(root, "packages/pixi-presenter/src");
  const effectsRoot = join(presenterRoot, "internal/effects");
  const sharedModules = new Set([
    "animation.ts",
    "effectLabShader.ts",
    "glitchShader.ts",
    "registries.ts",
    "rootFilterStack.ts",
    "transient/types.ts",
    "weather/types.ts"
  ]);
  const dispatcherImports = new Map([
    ["persistentScreen.ts", new Set(["bokeh.ts", "effectLabPersistent.ts", "persistentGlitch.ts"])],
    ["transient/system.ts", new Set(["transient/effectLab.ts", "transient/flash.ts", "transient/glitch.ts", "transient/shake.ts"])],
    ["weather/system.ts", new Set(["weather/rain.ts", "weather/snow.ts", "weather/sun.ts"])]
  ]);

  for (const file of collectFiles(effectsRoot)) {
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/u.test(file)) continue;
    const source = relative(effectsRoot, file);
    const text = stripComments(readFileSync(file, "utf8"));
    for (const specifier of collectImportSpecifiers(text)) {
      const target = resolveRelativeTsImport(file, specifier);
      if (target === join(presenterRoot, "internal/systems.ts")) {
        violations.push(
          `${relative(root, file)}: effect implementations must not import ActorSystem internals; ` +
          "use the supplied family mechanics or actor target resolver."
        );
        continue;
      }
      if (!target || !target.startsWith(`${effectsRoot}/`)) continue;
      const destination = relative(effectsRoot, target);
      if (sharedModules.has(destination)) continue;
      if (dispatcherImports.get(source)?.has(destination)) continue;
      violations.push(
        `${relative(root, file)}: effect implementation '${source}' must not import sibling effect '${destination}'; ` +
        "only family dispatchers may import effect implementations."
      );
    }
  }

  validatePixiPresenterEffectImports(
    join(presenterRoot, "internal/systems.ts"),
    new Set(["animation.ts", "blur.ts", "characterToneController.ts"]),
    "ActorSystem"
  );
  validatePixiPresenterEffectImports(
    join(presenterRoot, "index.ts"),
    new Set([
      "animation.ts",
      "persistentScreen.ts",
      "rootFilterStack.ts",
      "transient/system.ts",
      "trialOverlay.ts",
      "weather/system.ts"
    ]),
    "Pixi Presenter entry"
  );

  function validatePixiPresenterEffectImports(file, allowed, label) {
    const text = stripComments(readFileSync(file, "utf8"));
    for (const specifier of collectImportSpecifiers(text)) {
      const target = resolveRelativeTsImport(file, specifier);
      if (!target || !target.startsWith(`${effectsRoot}/`)) continue;
      const destination = relative(effectsRoot, target);
      if (allowed.has(destination)) continue;
      violations.push(
        `${relative(root, file)}: ${label} must import family boundaries or shared mechanics, not '${destination}'.`
      );
    }
  }
}

function resolveRelativeTsImport(sourceFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const target = resolve(dirname(sourceFile), specifier);
  if (existsSync(target) && statSync(target).isFile()) return target;
  if (existsSync(`${target}.ts`)) return `${target}.ts`;
  if (existsSync(join(target, "index.ts"))) return join(target, "index.ts");
  return undefined;
}

function validateSpecifier({ pkg, specifier, location, source }) {
  const targetPkg = workspacePackageFromSpecifier(specifier);
  if (targetPkg) {
    validateWorkspaceDep({ pkg, targetPkg, location, source });
    return;
  }

  const external = externalPackageName(specifier);
  if (!external) return;
  if (isForbiddenExternal(pkg, external)) {
    violations.push(`${location}: ${source} '${specifier}' is forbidden for ${pkg}.`);
  }
}

function validateWorkspaceDep({ pkg, targetPkg, location, source }) {
  if (targetPkg === pkg) return;
  const allowed = allowedWorkspaceDeps[pkg] ?? [];
  if (!allowed.includes(targetPkg)) {
    violations.push(
      `${location}: ${source} depends on @v-ronpa/${targetPkg}; allowed workspace deps for ${pkg}: ${formatAllowed(allowed)}.`
    );
  }
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collectFiles(path, files);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function collectImportSpecifiers(text) {
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function workspacePackageFromSpecifier(specifier) {
  if (!specifier.startsWith("@v-ronpa/")) return undefined;
  const id = specifier.slice("@v-ronpa/".length).split("/")[0];
  return Object.hasOwn(packageRoots, id) ? id : undefined;
}

function isSamePackageOrSubpath(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function externalPackageName(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return undefined;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

function isForbiddenExternal(pkg, external) {
  return (forbiddenExternalDeps[pkg] ?? []).some((forbidden) => {
    if (forbidden.endsWith("/")) return external.startsWith(forbidden);
    return external === forbidden;
  });
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function formatAllowed(allowed) {
  return allowed.length > 0 ? allowed.map((dep) => `@v-ronpa/${dep}`).join(", ") : "(none)";
}
