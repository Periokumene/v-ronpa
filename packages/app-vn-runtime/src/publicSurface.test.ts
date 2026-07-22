import { describe, expect, it } from "vitest";
import * as debugRuntime from "./debug";
import * as productRuntime from "./index";

describe("app VN runtime public surfaces", () => {
  it("keeps the product hook on the root entry and the debug hook on the explicit debug entry", () => {
    expect(productRuntime).toHaveProperty("useVnRuntime");
    expect(productRuntime).not.toHaveProperty("useVnRuntimeWithDebug");
    expect(productRuntime).not.toHaveProperty("compileVnRuntimeCatalog");
    expect(debugRuntime).toHaveProperty("useVnRuntimeWithDebug");
    expect(debugRuntime).toHaveProperty("inspectVnDebugScript");
  });
});
