/**
 * The ENS permission gate: does the payer control a valid name in the BSA
 * namespace, and does their identity carry the required attestations?
 *
 * We WALK THE REGISTRIES (getState → getSubregistry) rather than trusting name
 * resolution, so an unregistered name served a default record can never pass.
 */
import { type Address, zeroAddress } from "viem";
import { NameStatus, getState, getSubregistry, readAttestation } from "@bsa/ens";

export const ROOT = "bsagate.eth";

export type EnsGateContext = { bsaRegistry: Address; resolver: Address };

/** Labels of `name` below ROOT, ordered root-first for walking. null if not under ROOT. */
function subLabels(name: string): string[] | null {
  if (!name.endsWith(`.${ROOT}`)) return null;
  const prefix = name.slice(0, name.length - ROOT.length - 1);
  if (!prefix) return null;
  return prefix.split(".").reverse();
}

export type IdentityResult =
  | { ok: true; identityName: string; leafOwner: Address }
  | { ok: false; reason: string };

export async function resolvePayerIdentity(
  ctx: EnsGateContext,
  ensName: string,
  payer: Address,
): Promise<IdentityResult> {
  const parts = subLabels(ensName);
  if (!parts || parts.length === 0) return { ok: false, reason: `${ensName} is not a subname of ${ROOT}` };

  const now = BigInt(Math.floor(Date.now() / 1000));
  let registry = ctx.bsaRegistry;
  let leafOwner: Address = zeroAddress;

  for (let i = 0; i < parts.length; i++) {
    const label = parts[i]!;
    const state = await getState(registry, label);
    if (state.status !== NameStatus.REGISTERED) return { ok: false, reason: `${label} is not registered` };
    if (state.expiry !== 0n && state.expiry <= now) return { ok: false, reason: `${label} is expired` };

    if (i === parts.length - 1) {
      leafOwner = state.latestOwner;
    } else {
      registry = await getSubregistry(registry, label);
      if (registry.toLowerCase() === zeroAddress) return { ok: false, reason: `${label} has no subregistry` };
    }
  }

  if (leafOwner.toLowerCase() !== payer.toLowerCase())
    return { ok: false, reason: `payer ${payer} does not own ${ensName}` };

  // The identity that carries attestations is the first label under ROOT.
  return { ok: true, identityName: `${parts[0]}.${ROOT}`, leafOwner };
}

export async function checkAttestations(
  ctx: EnsGateContext,
  identityName: string,
  required: Record<string, string>,
): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  for (const [key, want] of Object.entries(required)) {
    const got = await readAttestation(ctx.resolver, identityName, key);
    if (got !== want) reasons.push(`attestation "${key}" is "${got || "(none)"}", required "${want}"`);
  }
  return { ok: reasons.length === 0, reasons };
}
