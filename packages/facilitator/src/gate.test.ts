import { beforeAll, describe, expect, it } from "vitest";
import { account, wallet, USDC } from "@bsa/ens/config";
import { signTransferAuthorization, usdcBalance } from "./eip3009.js";
import { setupNamespace, issueIdentity, delegateAgent, type Namespace } from "./issuer.js";
import { evaluate, type GateContext } from "./gate.js";
import { capOf as policyCapOf, setCap } from "./policy.js";
import type { Store } from "./deployments.js";
import type { PaymentPayload, PaymentRequirements } from "./types.js";

const issuer = wallet("issuer");
const merchant = account("merchant").address;
const alice = account("alice").address;
const agent = account("agent").address;
const bob = account("bob").address;

const AMOUNT = 10_000n; // 0.01 USDC — tiny (fork is free; real pass stays tiny too)

async function pay(signerRole: "agent" | "bob", to = merchant, value = AMOUNT) {
  const auth = await signTransferAuthorization(wallet(signerRole), USDC, { to, value });
  return auth;
}

describe("BSA Gate — full vertical slice (fork)", () => {
  let ns: Namespace;
  let ctx: GateContext;
  const baseReq = (): PaymentRequirements => ({
    chainId: 11155111,
    token: USDC,
    payTo: merchant,
    amount: AMOUNT,
    requiredAttestations: { over18: "true" },
  });

  beforeAll(async () => {
    ns = await setupNamespace(issuer);
    // Alice: 18+ and CH → her agent inherits it.
    const aliceId = await issueIdentity(issuer, ns, "alice", alice, { over18: "true", jurisdiction: "CH" });
    await delegateAgent(issuer, ns, aliceId.registry, "agent", agent);
    // Bob: verified but NOT 18+.
    await issueIdentity(issuer, ns, "bob", bob, { jurisdiction: "CH" });
    ctx = { bsaRegistry: ns.bsaRegistry, resolver: ns.resolver, relayer: issuer };
  }, 180_000);

  it("PASS: Alice's agent (inherits over18) settles USDC", async () => {
    const before = await usdcBalance(USDC, merchant);
    const payload: PaymentPayload = { authorization: await pay("agent"), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(ctx, payload, baseReq());
    expect(res.ok, res.reasons.join("; ")).toBe(true);
    expect(res.stage).toBe("settle");
    expect(res.txHash).toBeTruthy();
    const after = await usdcBalance(USDC, merchant);
    expect(after - before).toBe(AMOUNT);
  });

  it("BLOCK (ENS): Bob is not 18+ → blocked before settle", async () => {
    const payload: PaymentPayload = { authorization: await pay("bob"), ensName: "bob.bsagate.eth" };
    const res = await evaluate(ctx, payload, baseReq());
    expect(res.ok).toBe(false);
    expect(res.stage).toBe("ens");
    expect(res.reasons.join(" ")).toContain("over18");
  });

  it("BLOCK (ENS): amount over the spend cap", async () => {
    const payload: PaymentPayload = { authorization: await pay("agent"), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(ctx, payload, { ...baseReq(), maxAmount: AMOUNT - 1n });
    expect(res.ok).toBe(false);
    expect(res.stage).toBe("ens");
    expect(res.reasons.join(" ")).toContain("cap");
  });

  it("BLOCK (ENS): per-agent policy cap (capOf) exceeded", async () => {
    const store: Store = { users: {}, agents: { "agent.alice.bsagate.eth": { owner: agent, cap: (AMOUNT - 1n).toString() } } };
    const capCtx: GateContext = { ...ctx, capOf: (n) => policyCapOf(store, n) };
    const payload: PaymentPayload = { authorization: await pay("agent"), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(capCtx, payload, baseReq());
    expect(res.ok).toBe(false);
    expect(res.stage).toBe("ens");
    expect(res.reasons.join(" ")).toContain("cap");
  });

  it("PASS: within the per-agent policy cap (capOf) → settles", async () => {
    const before = await usdcBalance(USDC, merchant);
    const store = setCap({ users: {}, agents: { "agent.alice.bsagate.eth": { owner: agent } } }, "agent.alice.bsagate.eth", AMOUNT);
    const capCtx: GateContext = { ...ctx, capOf: (n) => policyCapOf(store, n) };
    const payload: PaymentPayload = { authorization: await pay("agent"), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(capCtx, payload, baseReq());
    expect(res.ok, res.reasons.join("; ")).toBe(true);
    expect(res.stage).toBe("settle");
    const after = await usdcBalance(USDC, merchant);
    expect(after - before).toBe(AMOUNT);
  });

  it("BLOCK (Intercepta): flagged payee → blocked before settle", async () => {
    // Deterministic unit test: force the stub screener (no network) via the denylist.
    // The LIVE Intercepta path (real quick-scan) is exercised separately against a real
    // sanctioned address — see the live gate matrix.
    const savedKey = process.env.INTERCEPTA_API_KEY;
    process.env.INTERCEPTA_API_KEY = "";
    process.env.INTERCEPTA_TEST_DENYLIST = merchant.toLowerCase();
    try {
      const payload: PaymentPayload = { authorization: await pay("agent"), ensName: "agent.alice.bsagate.eth" };
      const res = await evaluate(ctx, payload, baseReq());
      expect(res.ok).toBe(false);
      expect(res.stage).toBe("intercepta");
    } finally {
      delete process.env.INTERCEPTA_TEST_DENYLIST;
      if (savedKey === undefined) delete process.env.INTERCEPTA_API_KEY;
      else process.env.INTERCEPTA_API_KEY = savedKey;
    }
  });

  it("BLOCK (verify): wrong recipient fails signature/recipient check", async () => {
    const payload: PaymentPayload = { authorization: await pay("agent", alice), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(ctx, payload, baseReq());
    expect(res.ok).toBe(false);
    expect(res.stage).toBe("verify");
  });

  // ── the agent path is REAL: on-chain ownership + climbing the registry ladder ──

  it("BLOCK (ens): the paying wallet must OWN the agent name (walked on-chain, not just claimed)", async () => {
    // bob signs, but *claims* to be agent.alice.bsagate.eth. The facilitator walks the registry
    // (getState → getSubregistry) to the agent leaf and sees the owner is the agent wallet, not bob.
    const payload: PaymentPayload = { authorization: await pay("bob"), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(ctx, payload, baseReq());
    expect(res.ok).toBe(false);
    expect(res.stage).toBe("ens");
    expect(res.reasons.join(" ")).toMatch(/does not own/);
  });

  it("PASS: agent climbs the ladder — attestations resolve from the PARENT (alice.bsagate.eth)", async () => {
    // The agent name carries no attestations of its own; the gate walks up to alice and reads hers.
    const payload: PaymentPayload = { authorization: await pay("agent"), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(ctx, payload, { ...baseReq(), requiredAttestations: { jurisdiction: "CH" } });
    expect(res.ok, res.reasons.join("; ")).toBe(true);
    expect(res.identityName).toBe("alice.bsagate.eth"); // proves attestations came from the parent, not the agent
  });

  it("BLOCK (ens): agent inherits CH, so a merchant requiring FR blocks it (real parent record)", async () => {
    const payload: PaymentPayload = { authorization: await pay("agent"), ensName: "agent.alice.bsagate.eth" };
    const res = await evaluate(ctx, payload, { ...baseReq(), requiredAttestations: { jurisdiction: "FR" } });
    expect(res.ok).toBe(false);
    expect(res.stage).toBe("ens");
    expect(res.reasons.join(" ")).toMatch(/jurisdiction/);
  });
});
