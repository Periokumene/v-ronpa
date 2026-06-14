import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import {
  DEFAULT_DEV_PORT,
  WORKTREE_ENV_FILE,
  createWorktreeEnvContent,
  deriveWorktreePort,
  loadWorktreeEnv,
  parsePort
} from "./worktree-env.mjs";

const cwd = resolve(process.cwd());
const stateDir = ".local-state";

mkdirSync(stateDir, { recursive: true });

async function canListen(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function choosePort(preferredPort) {
  for (let offset = 0; offset < 1000; offset += 1) {
    const port = DEFAULT_DEV_PORT + ((preferredPort - DEFAULT_DEV_PORT + offset) % 1000);
    if (await canListen(port)) return port;
  }

  return preferredPort;
}

if (!existsSync(WORKTREE_ENV_FILE)) {
  const port = await choosePort(deriveWorktreePort(cwd));
  writeFileSync(WORKTREE_ENV_FILE, createWorktreeEnvContent({ cwd, port }));
  console.log(`Created ${WORKTREE_ENV_FILE} with PORT=${port}`);
} else {
  const loaded = loadWorktreeEnv(cwd);
  const port = parsePort(loaded.values.VITE_DEV_PORT ?? loaded.values.PORT);
  console.log(`${WORKTREE_ENV_FILE} already exists; leaving it unchanged with PORT=${port}.`);
}
