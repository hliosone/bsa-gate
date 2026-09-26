/**
 * Per-agent spend cap — facilitator policy.
 *
 * A principal caps how much their agent may spend per payment. The cap lives on
 * the agent's entry in the deployments store; it is NOT on-chain, because ENSv2
 * roles are not per-amount. That split is deliberate: the principal owns the
 * on-chain delegation (and can revoke it), and the facilitator enforces the
 * per-payment amount policy the principal sets.
 */
import { type Address, type Hex, verifyTypedData } from "viem";
import type { Store } from "./deployments.js";

const ROOT = "bsagate.eth";

/** EIP-712 scheme a principal signs to change their agent's cap (shared with the web app). */
export const CAP_EIP712 = {
  domainName: "BSA Gate",
  domainVersion: "1",
  types: {
    SetCap: [
      { name: "agentName", type: "string" },
      { name: "cap", type: "uint256" }, // base units; 0 clears
      { name: "deadline", type: "uint256" },
    ],
  },
} as const;

export type CapAuthorization = { agentName: string; cap: bigint; deadline: bigint; signature: Hex };

/** The principal's label for an agent name: `agent.alice.bsagate.eth` -> `alice`. */
export function principalLabel(agentName: string): string | undefined {
  const suffix = `.${ROOT}`;
  if (!agentName.endsWith(suffix)) return undefined;
  const parts = agentName.slice(0, -suffix.length).split(".");
  return parts.length >= 2 ? parts[parts.length - 1] : undefined;
}

/**
 * Verify a principal-signed cap update: the parent identity's owner must have
 * signed the EIP-712 SetCap message, and it must not be expired. This is what
 * stops an agent (or anyone else) from raising its own cap.
 */
export async function verifyCapAuthorization(
  auth: CapAuthorization,
  principal: Address,
  chainId: number,
  now: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<{ ok: boolean; reason?: string }> {
  if (auth.deadline < now) return { ok: false, reason: "cap authorization expired" };
  const valid = await verifyTypedData({
    address: principal,
    domain: { name: CAP_EIP712.domainName, version: CAP_EIP712.domainVersion, chainId },
    types: CAP_EIP712.types,
    primaryType: "SetCap",
    message: { agentName: auth.agentName, cap: auth.cap, deadline: auth.deadline },
    signature: auth.signature,
  });
  return valid ? { ok: true } : { ok: false, reason: "cap authorization not signed by the principal" };
}

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
