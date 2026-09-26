/**
 * The unified BSA Gate — one pipeline, two checks:
 *   verify EIP-3009 → ENS permission (own name + attestations + cap) → Intercepta → settle.
 * Every surface (agent x402 API, WooCommerce, Shopify) calls this.
 */
import type { Signer } from "@bsa/ens";
import { settleAuthorization, verifyAuthorization } from "./eip3009.js";
import { type EnsGateContext, checkAttestations, resolvePayerIdentity } from "./ensGate.js";
import { screen } from "./intercepta.js";
import type { GateResult, PaymentPayload, PaymentRequirements } from "./types.js";

export type GateContext = EnsGateContext & {
  /** Account that submits the settlement tx (pays gas; never holds funds). */
  relayer: Signer;
  /** Optional per-name spend cap lookup (facilitator policy). */
  capOf?: (ensName: string) => bigint | undefined;
};

export async function evaluate(
  ctx: GateContext,
  payload: PaymentPayload,
  req: PaymentRequirements,
  opts: { settle?: boolean } = {},
): Promise<GateResult> {
  const auth = payload.authorization;

  // 1. Verify the payment authorization (signature, recipient, amount, time window, replay).
  const v = await verifyAuthorization(req.token, auth, { to: req.payTo, minValue: req.amount });
  if (!v.ok) return { ok: false, stage: "verify", reasons: [v.reason ?? "verification failed"] };

  // 2. Spend cap (facilitator policy: principal caps their agent).
  const cap = ctx.capOf?.(payload.ensName) ?? req.maxAmount;
  if (cap !== undefined && auth.value > cap)
    return { ok: false, stage: "ens", reasons: [`amount ${auth.value} exceeds cap ${cap} for ${payload.ensName}`] };

  // 3. ENS permission: payer controls a valid name whose identity carries the attestations.
  const who = await resolvePayerIdentity(ctx, payload.ensName, auth.from);
  if (!who.ok) return { ok: false, stage: "ens", reasons: [who.reason] };
  const att = await checkAttestations(ctx, who.identityName, req.requiredAttestations);
  if (!att.ok) return { ok: false, stage: "ens", reasons: att.reasons, identityName: who.identityName };

  // 4. Intercepta: is this payment safe to settle?
  const s = await screen({ payer: auth.from, payee: req.payTo });
  if (!s.ok) return { ok: false, stage: "intercepta", reasons: s.reasons, identityName: who.identityName };

  // Dry-run (x402 /verify): everything passed, but do not move funds.
  if (opts.settle === false) return { ok: true, stage: "intercepta", reasons: [], identityName: who.identityName };

  // 5. Settle — USDC moves payer → payee via transferWithAuthorization.
  const txHash = await settleAuthorization(ctx.relayer, req.token, auth);
  return { ok: true, stage: "settle", reasons: [], identityName: who.identityName, txHash };
}
