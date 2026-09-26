/**
 * Per-agent spend cap — facilitator policy.
 *
 * A principal caps how much their agent may spend per payment. The cap lives on
 * the agent's entry in the deployments store; it is NOT on-chain, because ENSv2
 * roles are not per-amount. That split is deliberate: the principal owns the
 * on-chain delegation (and can revoke it), and the facilitator enforces the
 * per-payment amount policy the principal sets.
 */
import type { Store } from "./deployments.js";

/** Per-payment cap for an agent name in base units, or undefined if uncapped. */
export function capOf(store: Store, agentName: string): bigint | undefined {
  const c = store.agents[agentName]?.cap;
  return c != null && c !== "" ? BigInt(c) : undefined;
}

/**
 * Set (or clear, when `cap` is null) an agent's per-payment spend cap. Returns a
 * new store; the input is not mutated. Throws if the agent is not delegated (you
 * cannot cap an agent that does not exist) or if the cap is not positive.
 */
export function setCap(store: Store, agentName: string, cap: bigint | null): Store {
  const agent = store.agents[agentName];
  if (!agent) throw new Error(`unknown agent ${agentName}`);
  if (cap !== null && cap <= 0n) throw new Error(`cap must be positive, got ${cap}`);
  const nextAgent = { ...agent };
  if (cap === null) delete nextAgent.cap;
  else nextAgent.cap = cap.toString();
  return { ...store, agents: { ...store.agents, [agentName]: nextAgent } };
}
