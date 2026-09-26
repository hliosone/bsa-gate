import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { Store } from "./deployments.js";
import { CAP_EIP712, capOf, principalLabel, setCap, verifyCapAuthorization } from "./policy.js";

const AGENT = "agent.alice.bsagate.eth";
const owner = "0xA6B99dB364f116f261a8Eb7E4cB2bD9C49777963" as const;

function store(cap?: string): Store {
  return { users: {}, agents: { [AGENT]: { owner, ...(cap !== undefined ? { cap } : {}) } } };
}

describe("per-agent spend cap (facilitator policy)", () => {
  it("capOf: undefined for an unknown agent", () => {
    expect(capOf(store(), "nope.bsagate.eth")).toBeUndefined();
  });

  it("capOf: undefined when the agent has no cap", () => {
    expect(capOf(store(), AGENT)).toBeUndefined();
  });

  it("capOf: returns the stored cap as a bigint", () => {
    expect(capOf(store("50000000"), AGENT)).toBe(50_000_000n);
  });

  it("setCap: sets a cap without mutating the input store", () => {
    const s0 = store();
    const s1 = setCap(s0, AGENT, 50_000_000n);
    expect(capOf(s1, AGENT)).toBe(50_000_000n);
    expect(capOf(s0, AGENT)).toBeUndefined(); // original untouched
  });

  it("setCap: clears the cap with null", () => {
    const s1 = setCap(store("50000000"), AGENT, null);
    expect(capOf(s1, AGENT)).toBeUndefined();
  });

  it("setCap: rejects capping an unknown agent", () => {
    expect(() => setCap(store(), "ghost.bsagate.eth", 1n)).toThrow(/unknown agent/);
  });

  it("setCap: rejects a non-positive cap", () => {
    expect(() => setCap(store(), AGENT, 0n)).toThrow(/positive/);
  });
});

describe("cap update authorization (principal-signed)", () => {
  const CHAIN = 11155111;
  const principalPk = generatePrivateKey();
  const principal = privateKeyToAccount(principalPk).address;
  const agentPk = generatePrivateKey(); // the agent's own key — must NOT be able to sign a cap change
  const future = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const msg = { agentName: AGENT, cap: 50_000_000n, deadline: future };

  async function sign(pk: Hex, m: { agentName: string; cap: bigint; deadline: bigint }): Promise<Hex> {
    return privateKeyToAccount(pk).signTypedData({
      domain: { name: CAP_EIP712.domainName, version: CAP_EIP712.domainVersion, chainId: CHAIN },
      types: CAP_EIP712.types,
      primaryType: "SetCap",
      message: m,
    });
  }

  it("principalLabel derives the principal from an agent name", () => {
    expect(principalLabel("agent.alice.bsagate.eth")).toBe("alice");
    expect(principalLabel("bob.bsagate.eth")).toBeUndefined();
  });

  it("accepts a signature from the principal", async () => {
    const signature = await sign(principalPk, msg);
    expect((await verifyCapAuthorization({ ...msg, signature }, principal, CHAIN)).ok).toBe(true);
  });

  it("rejects the agent signing its own cap change", async () => {
    const signature = await sign(agentPk, msg);
    const r = await verifyCapAuthorization({ ...msg, signature }, principal, CHAIN);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/principal/);
  });

  it("rejects an expired authorization", async () => {
    const past = { ...msg, deadline: BigInt(Math.floor(Date.now() / 1000) - 10) };
    const signature = await sign(principalPk, past);
    const r = await verifyCapAuthorization({ ...past, signature }, principal, CHAIN);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });

  it("rejects a tampered cap (signature no longer matches)", async () => {
    const signature = await sign(principalPk, msg);
    expect((await verifyCapAuthorization({ ...msg, cap: 999_999_999n, signature }, principal, CHAIN)).ok).toBe(false);
  });
});
