/**
 * Issuer flow — BSA Gate as the attestation authority.
 * Composes the ENS ops: stand up the namespace, issue a KYC'd identity with
 * attestations only we can write, and delegate a revocable agent to a principal.
 */
import type { Address } from "viem";
import {
  AGENT_OWNER_ROLES,
  IDENTITY_OWNER_ROLES,
  ROLES,
  type Signer,
  deployRegistry,
  deployResolver,
  grantRootRole,
  registerName,
  setAttestation,
} from "@bsa/ens";
import { ROOT } from "./ensGate.js";

export type Namespace = { resolver: Address; bsaRegistry: Address };

/** One-time: deploy the shared attestation resolver + the bsagate.eth root registry. */
export async function setupNamespace(issuer: Signer): Promise<Namespace> {
  const resolver = (await deployResolver(issuer)).address;
  const bsaRegistry = (await deployRegistry(issuer)).address;
  return { resolver, bsaRegistry };
}

/**
 * KYC a principal and issue their identity:
 * - deploy the principal's own UserRegistry (so their agents don't collide with others'),
 * - give the principal ROLE_UNREGISTER on it (their on-chain kill switch),
 * - register <label>.bsagate.eth to them without dangerous roles,
 * - write the issuer-only attestations.
 */
export async function issueIdentity(
  issuer: Signer,
  ns: Namespace,
  label: string,
  owner: Address,
  attestations: Record<string, string>,
): Promise<{ registry: Address; name: string }> {
  const registry = (await deployRegistry(issuer)).address;
  await grantRootRole(issuer, registry, ROLES.UNREGISTER, owner);
  await registerName(issuer, {
    registry: ns.bsaRegistry,
    label,
    owner,
    subregistry: registry,
    resolver: ns.resolver,
    roleBitmap: IDENTITY_OWNER_ROLES,
  });
  const name = `${label}.${ROOT}`;
  for (const [key, value] of Object.entries(attestations)) {
    await setAttestation(issuer, ns.resolver, name, key, value);
  }
  return { registry, name };
}

/** Delegate a revocable, non-transferable agent under a principal's registry. */
export async function delegateAgent(
  issuer: Signer,
  ns: Namespace,
  userRegistry: Address,
  agentLabel: string,
  agentOwner: Address,
): Promise<void> {
  await registerName(issuer, {
    registry: userRegistry,
    label: agentLabel,
    owner: agentOwner,
    resolver: ns.resolver,
    roleBitmap: AGENT_OWNER_ROLES,
  });
}
