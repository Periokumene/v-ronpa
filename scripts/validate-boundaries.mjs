import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();

const packageRoots = {
  "contracts": "packages/contracts",
  "nani-parser": "packages/nani-parser",
  "story-engine": "packages/story-engine",
  "gameplay": "packages/gameplay",
  "navi-director": "packages/navi-director",
  "trial-director": "packages/trial-director",
  "pixi-presenter": "packages/pixi-presenter",
  "r3f-adapter": "packages/r3f-adapter",
  "ui-kit": "packages/ui-kit",
  "media-save": "packages/media-save",
  "game-flow-machine": "packages/game-flow-machine",
  "game": "apps/game"
};

const allowedWorkspaceDeps = {
  "contracts": [],
  "nani-parser": [],
  "story-engine": ["contracts", "nani-parser"],
  "gameplay": ["contracts"],
  "navi-director": ["contracts", "gameplay"],
  "trial-director": ["contracts", "gameplay"],
  "pixi-presenter": ["contracts"],
  "r3f-adapter": ["contracts"],
  "ui-kit": ["contracts"],
  "media-save": ["contracts"],
  "game-flow-machine": ["contracts"],
  "game": [
    "contracts",
    "game-flow-machine",
    "gameplay",
    "media-save",
    "nani-parser",
    "navi-director",
    "pixi-presenter",
    "r3f-adapter",
    "story-engine",
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
  "nani-parser": rendererAndBrowserAdapters,
  "story-engine": rendererAndBrowserAdapters,
  "gameplay": rendererAndBrowserAdapters,
  "navi-director": rendererAndBrowserAdapters,
  "trial-director": rendererAndBrowserAdapters,
  "game-flow-machine": ["react", "react-dom", "@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "media-save": ["react", "react-dom", "@react-three/", "three", "pixi.js", "@pixi/", "@radix-ui/"],
  "pixi-presenter": ["react", "react-dom", "@react-three/", "three", "dexie", "howler", "@radix-ui/"],
  "r3f-adapter": ["pixi.js", "@pixi/", "dexie", "howler", "@radix-ui/"],
  "ui-kit": ["@react-three/", "three", "pixi.js", "@pixi/", "dexie", "howler"],
  "game": []
};

const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const violations = [];
const rootByAbsPath = new Map(
  Object.entries(packageRoots).map(([pkg, pkgRoot]) => [resolve(root, pkgRoot), pkg])
);

for (const pkg of Object.keys(packageRoots)) {
  validateSourceImports(pkg);
  validatePackageJson(pkg);
  validateTsconfigReferences(pkg);
}

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
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
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
