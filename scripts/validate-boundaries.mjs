import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageRules = {
  "contracts": {
    forbiddenImports: ["@v-ronpa/"],
    reason: "contracts must not depend on workspace packages"
  },
  "nani-parser": {
    forbiddenImports: ["react", "@react-three", "pixi.js", "dexie", "howler"],
    reason: "parser must stay renderer and persistence independent"
  },
  "story-engine": {
    forbiddenImports: ["react", "@react-three", "pixi.js", "dexie", "howler"],
    reason: "story engine must stay renderer and browser adapter independent"
  },
  "gameplay": {
    forbiddenImports: ["react", "@react-three", "pixi.js", "dexie", "howler"],
    reason: "gameplay domain logic must stay presentation independent"
  },
  "navi-director": {
    forbiddenImports: ["react", "@react-three", "pixi.js", "dexie", "howler"],
    reason: "navi director must stay presentation independent"
  },
  "trial-director": {
    forbiddenImports: ["react", "@react-three", "pixi.js", "dexie", "howler"],
    reason: "trial director must stay presentation independent"
  },
  "presentation-contracts": {
    forbiddenImports: ["react", "@react-three", "pixi.js", "dexie", "howler"],
    reason: "presentation contracts must not depend on implementations"
  }
};

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collectFiles(path, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];

for (const [pkg, rule] of Object.entries(packageRules)) {
  const src = join(root, "packages", pkg, "src");
  const files = collectFiles(src);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const forbidden of rule.forbiddenImports) {
      const importPattern = new RegExp(`from\\s+["']${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      if (importPattern.test(text)) {
        violations.push(`${file}: imports ${forbidden}; ${rule.reason}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Boundary validation passed.");
