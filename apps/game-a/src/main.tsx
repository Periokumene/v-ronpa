import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { gameAOpeningLaunchDefinition, type GameAVnLaunchDefinition } from "./gameAScripts";
import "./styles.css";
import "./ui/game-a-ui.css";

void boot();

async function boot() {
  let launchDefinition: GameAVnLaunchDefinition = gameAOpeningLaunchDefinition;
  const requestedEntry = new URLSearchParams(window.location.search).get("vnEntry");
  if (import.meta.env.VITE_ENABLE_TEST_ENTRIES === "1" && requestedEntry === "smoke") {
    launchDefinition = (await import("./gameATestEntries")).gameASmokeLaunchDefinition;
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App launchDefinition={launchDefinition} />
    </StrictMode>
  );
}
