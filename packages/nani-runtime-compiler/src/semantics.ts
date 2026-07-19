import type { RuntimeScript } from "@v-ronpa/contracts";

/**
 * Serializes only the executable semantics that identify a runtime script.
 *
 * Source locations and raw parser command data are intentionally excluded so
 * formatting-only edits do not invalidate saves or debug checkpoints. The
 * output is deterministic and browser-safe; callers own the digest algorithm.
 */
export function serializeRuntimeScriptSemantics(script: RuntimeScript): string {
  return stableJson({
    scriptPath: script.scriptPath,
    labels: script.labels,
    commands: script.commands.map(({ loc: _loc, sourceCommand: _sourceCommand, ...command }) => command)
  });
}

/** Creates the browser/runtime revision using the same SHA-256 format as asset generation. */
export async function digestRuntimeScriptSemantics(script: RuntimeScript): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is required to digest runtime script semantics.");
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serializeRuntimeScriptSemantics(script))
  );
  return `sha256:${Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Runtime script semantics must contain only JSON-serializable values.");
  }
  return serialized;
}
