import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import "./styles.css";
import "./ui/game-a-ui.css";

void boot();

async function boot() {
  let entryOverride: VnRuntimeEntry | undefined;
  const requestedEntry = new URLSearchParams(window.location.search).get("vnEntry");
  if (import.meta.env.VITE_ENABLE_TEST_ENTRIES === "1" && requestedEntry === "smoke") {
    entryOverride = (await import("./gameATestEntries")).gameASmokeRuntimeEntry;
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App {...(entryOverride ? { entryOverride } : {})} />
    </StrictMode>
  );
}
