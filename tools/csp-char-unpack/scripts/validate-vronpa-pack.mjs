import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema
} from "../../../packages/contracts/src/index.ts";
import { resolveLayeredCharacterLayerRefs } from "../../../packages/layered-character/src/index.ts";

const packRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("Usage: node scripts/validate-vronpa-pack.mjs <pack-root>");
  process.exit(2);
}

const readJson = (path) => JSON.parse(readFileSync(resolve(packRoot, path), "utf8"));
const character = LayeredCharacterDefinitionSchema.parse(readJson("character.json"));
const layers = LayeredCharacterLayersSchema.parse(readJson("layers.json"));
const compositions = LayeredCharacterCompositionsSchema.parse(readJson("compositions.json"));

for (const group of Object.values(layers.groups)) {
  for (const layer of Object.values(group.layers)) {
    if (!existsSync(resolve(packRoot, layer.src))) throw new Error(`Missing layered character sprite: ${layer.src}`);
    LayeredCharacterLayerMetadataSchema.parse(readJson(layer.metadata));
  }
}

if (!compositions.tokens.Default?.length) {
  throw new Error("Generated character pack must define a non-empty Default token.");
}

for (const token of Object.keys(compositions.tokens)) {
  const resolved = resolveLayeredCharacterLayerRefs({
    character,
    layers,
    compositions,
    appearanceExpression: token
  });
  if (resolved.diagnostics.length > 0) {
    throw new Error(
      `Generated character pack token '${token}' does not resolve: ${resolved.diagnostics.map((item) => item.message).join("; ")}`
    );
  }
  if (token === "Default" && resolved.activeLayers.length === 0) {
    throw new Error("Generated character pack Default token resolves to no active layers.");
  }
}

console.log(`Validated V-Ronpa character pack '${character.id}'.`);
