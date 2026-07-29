import {
  naniCommandCatalog,
  type NaniCommandDefinition
} from "@v-ronpa/contracts";
import type { CommandNormalizerDescriptor } from "../types";
import { createGenericParams } from "../values.ts";
import { actorSceneNormalizers } from "./actor-scene.ts";
import { effectNormalizers } from "./effects.ts";
import { flowGameplayNormalizers } from "./flow-gameplay.ts";
import { textUiMediaNormalizers } from "./text-ui-media.ts";

const normalizerGroups = [
  textUiMediaNormalizers,
  actorSceneNormalizers,
  effectNormalizers,
  flowGameplayNormalizers
] as const;

const genericCommandNormalizer: CommandNormalizerDescriptor = {
  acceptsPrimary: true,
  consumedParams: [],
  normalize: createGenericParams
};

const genericCommandNormalizerIds = [
  "addchoice",
  "async",
  "await",
  "camera",
  "choicehandler",
  "despawn",
  "despawnall",
  "else",
  "endif",
  "enterdialogue",
  "exitdialogue",
  "gosub",
  "group",
  "hide",
  "hideall",
  "hideprinter",
  "if",
  "lipsync",
  "loadscene",
  "lock",
  "look",
  "openurl",
  "printer",
  "processinput",
  "purgerollback",
  "random",
  "remove",
  "resetstate",
  "return",
  "save",
  "show",
  "skip",
  "spawn",
  "stop",
  "stopvoice",
  "sync",
  "timeline",
  "title",
  "trans",
  "unless",
  "unloadscene",
  "unlock",
  "voice",
  "while",
  "charenter"
] as const;

const genericCommandNormalizers = Object.fromEntries(
  genericCommandNormalizerIds.map((id) => [id, genericCommandNormalizer])
);
const registeredNormalizerIds = [
  ...normalizerGroups.flatMap((group) => Object.keys(group)),
  ...genericCommandNormalizerIds
];
const catalogById = new Map(naniCommandCatalog.map((definition) => [definition.id, definition]));

export const commandNormalizerRegistry: Readonly<Record<string, CommandNormalizerDescriptor>> = Object.freeze(
  Object.assign({}, ...normalizerGroups, genericCommandNormalizers)
);

export function commandNormalizerFor(definition: NaniCommandDefinition): CommandNormalizerDescriptor {
  const normalizer = commandNormalizerRegistry[definition.id];
  if (normalizer) return normalizer;
  throw new Error(
    "Runtime compiler invariant failed: command @" +
      definition.canonicalName +
      " has no explicit normalizer descriptor."
  );
}

export function assertCommandNormalizerRegistry(): void {
  const issues: string[] = [];
  const duplicates = registeredNormalizerIds.filter(
    (id, index) => registeredNormalizerIds.indexOf(id) !== index
  );
  if (duplicates.length > 0) {
    issues.push(
      "duplicate normalizer descriptors: " + [...new Set(duplicates)].join(", ")
    );
  }

  for (const [id, descriptor] of Object.entries(commandNormalizerRegistry)) {
    const definition = catalogById.get(id);
    if (!definition) {
      issues.push("descriptor " + id + " does not resolve to a commandCatalog definition");
      continue;
    }

    if (genericCommandNormalizerIds.includes(id as (typeof genericCommandNormalizerIds)[number])) {
      if (definition.status === "implemented") {
        issues.push("implemented command @" + definition.canonicalName + " uses a generic descriptor");
      }
      if (descriptor !== genericCommandNormalizer) {
        issues.push("generic descriptor " + id + " does not use the shared generic normalizer");
      }
    }

    const declaredNames = new Set(
      definition.params.flatMap((spec) => [spec.name, ...(spec.aliases ?? [])]).map(normalizeRegistryName)
    );
    for (const consumedParam of descriptor.consumedParams) {
      const normalized = normalizeRegistryName(consumedParam);
      if (!declaredNames.has(normalized)) {
        issues.push(
          "descriptor @" +
            definition.canonicalName +
            " consumes undeclared parameter " +
            consumedParam
        );
      }
    }

    if (definition.primaryParam) {
      const normalizedPrimary = normalizeRegistryName(definition.primaryParam);
      if (!descriptor.acceptsPrimary) {
        issues.push(
          "catalog @" +
            definition.canonicalName +
            " declares primaryParam " +
            definition.primaryParam +
            " but its descriptor rejects primary values"
        );
      }
      if (!descriptor.consumedParams.map(normalizeRegistryName).includes(normalizedPrimary)) {
        issues.push(
          "catalog @" +
            definition.canonicalName +
            " primaryParam " +
            definition.primaryParam +
            " is not consumed by its descriptor"
        );
      }
    }

    if (definition.status !== "implemented") continue;
    const consumedNames = new Set(descriptor.consumedParams.map(normalizeRegistryName));
    for (const spec of definition.params) {
      const specNames = [spec.name, ...(spec.aliases ?? [])].map(normalizeRegistryName);
      const descriptorConsumes = specNames.some((name) => consumedNames.has(name));
      const documentedSupport = spec.docs?.runtimeSupport;
      if (!documentedSupport) {
        issues.push(
          "implemented @" +
            definition.canonicalName +
            " parameter " +
            spec.name +
            " has no runtimeSupport status"
        );
        continue;
      }
      const catalogConsumes = documentedSupport === "consumed";
      if (descriptorConsumes !== catalogConsumes) {
        issues.push(
          "@" +
            definition.canonicalName +
            " parameter " +
            spec.name +
            " is " +
            (descriptorConsumes ? "consumed by its descriptor" : "not consumed by its descriptor") +
            " but commandCatalog marks it " +
            documentedSupport
        );
      }
    }
  }

  for (const definition of naniCommandCatalog) {
    if (!commandNormalizerRegistry[definition.id]) {
      issues.push("command @" + definition.canonicalName + " has no explicit normalizer descriptor");
    }
  }

  if (issues.length > 0) {
    throw new Error(
      "Runtime compiler normalizer registry invariant failed:\n- " + issues.join("\n- ")
    );
  }
}

function normalizeRegistryName(name: string): string {
  return name.toLowerCase();
}

assertCommandNormalizerRegistry();
