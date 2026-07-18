/// <reference types="vite/client" />

declare module "virtual:v-ronpa-nani-devtools-initial" {
  import type { NaniDevtoolsViteInitialCandidate } from "@v-ronpa/app-vn-devtools";

  const candidates: readonly NaniDevtoolsViteInitialCandidate[];
  export default candidates;
}
