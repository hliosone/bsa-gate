/** Fork/live-scoped state: deployed namespace, issued identities, agent caps. */
import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";

export type Store = {
  namespace?: { resolver: Address; bsaRegistry: Address };
  users: Record<string, { registry: Address; owner: Address }>;
  agents: Record<string, { owner: Address; cap?: string }>; // key = full ENS name
};

const FILE =
  process.env.DEPLOYMENTS_PATH ??
  path.resolve(process.cwd(), "data", "deployments.json");

export function load(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    return { users: {}, agents: {} };
  }
}

export function save(store: Store): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}
