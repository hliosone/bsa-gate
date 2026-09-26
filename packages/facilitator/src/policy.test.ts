import { describe, expect, it } from "vitest";
import type { Store } from "./deployments.js";
import { capOf, setCap } from "./policy.js";

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
