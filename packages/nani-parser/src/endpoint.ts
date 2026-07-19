import type { NaniValue } from "./types/ir";

export type StaticNaniEndpointErrorCode =
  | "endpoint-not-static"
  | "endpoint-malformed"
  | "endpoint-relative-path"
  | "endpoint-wildcard"
  | "endpoint-script-extension-required";

export type StaticNaniEndpointParseResult =
  | {
      ok: true;
      endpoint: {
        raw: string;
        kind: "local" | "script";
        scriptPath: string;
        label?: string;
      };
    }
  | { ok: false; code: StaticNaniEndpointErrorCode; message: string };

/** The one static-value projection used by dependency collection and linking. */
export function staticNaniEndpointText(value: NaniValue | undefined): string | undefined {
  if (value?.type === "string" || value?.type === "raw") return value.value;
  return undefined;
}

/** Parse the complete supported Nani navigation grammar without touching runtime state. */
export function parseStaticNaniEndpoint(
  value: unknown,
  currentScriptPath: string
): StaticNaniEndpointParseResult {
  if (typeof value !== "string") {
    return {
      ok: false,
      code: "endpoint-not-static",
      message: "Nani navigation endpoints must be static strings."
    };
  }

  const raw = value.trim();
  if (!raw || raw !== value || /\s/u.test(raw)) return malformed(raw || String(value));
  if (raw.includes("*") || raw.includes("?")) {
    return {
      ok: false,
      code: "endpoint-wildcard",
      message: `Nani navigation endpoint '${raw}' cannot contain wildcards.`
    };
  }
  if (/[{}$]/u.test(raw)) {
    return {
      ok: false,
      code: "endpoint-not-static",
      message: `Nani navigation endpoint '${raw}' cannot contain a dynamic expression.`
    };
  }
  if (raw.startsWith("#")) {
    const label = raw.slice(1);
    if (!validLabel(label)) return malformed(raw);
    return { ok: true, endpoint: { raw, kind: "local", scriptPath: currentScriptPath, label } };
  }

  const hash = raw.indexOf("#");
  if (hash !== raw.lastIndexOf("#")) return malformed(raw);
  const scriptPath = hash >= 0 ? raw.slice(0, hash) : raw;
  const label = hash >= 0 ? raw.slice(hash + 1) : undefined;
  if (label !== undefined && !validLabel(label)) return malformed(raw);
  if (
    scriptPath.startsWith("/") ||
    scriptPath.startsWith("./") ||
    scriptPath.startsWith("../") ||
    scriptPath.includes("\\") ||
    scriptPath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return {
      ok: false,
      code: "endpoint-relative-path",
      message: `Nani navigation endpoint '${raw}' must use a full logical script path.`
    };
  }
  if (!scriptPath.endsWith(".nani")) {
    return {
      ok: false,
      code: "endpoint-script-extension-required",
      message: `Nani navigation endpoint '${raw}' must target a .nani script.`
    };
  }
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.nani$/u.test(scriptPath)) return malformed(raw);
  return {
    ok: true,
    endpoint: {
      raw,
      kind: scriptPath === currentScriptPath ? "local" : "script",
      scriptPath,
      ...(label ? { label } : {})
    }
  };
}

function validLabel(label: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(label);
}

function malformed(raw: string): StaticNaniEndpointParseResult {
  return {
    ok: false,
    code: "endpoint-malformed",
    message: `Malformed Nani navigation endpoint '${raw}'.`
  };
}
