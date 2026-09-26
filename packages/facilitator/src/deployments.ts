/** Fork/live-scoped state: deployed namespace, issued identities, agent caps. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";

export type Store = {
  namespace?: { resolver: Address; bsaRegistry: Address };
  users: Record<string, { registry: Address; owner: Address }>;
  agents: Record<string, { owner: Address; cap?: string }>; // key = full ENS name
};

const FILE =
  process.env.DEPLOYMENTS_PATH ??
  path.resolve(process.cwd(), "data", "deployments.json");
// Committed fallback (namespace + demo identities; on-chain addresses only, no secrets) so a
// fresh cloud host boots with a working namespace even before anything is written to disk.
const DEFAULT_FILE = fileURLToPath(new URL("../deployments.default.json", import.meta.url));

export function load(): Store {
  for (const f of [FILE, DEFAULT_FILE]) {
    try {
      return JSON.parse(fs.readFileSync(f, "utf8")) as Store;
    } catch {
      /* try the next source */
    }
  }
  return { users: {}, agents: {} };
}

export function save(store: Store): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}
