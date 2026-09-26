import { beforeAll, describe, expect, it } from "vitest";
import { type Address, getAddress } from "viem";
import { account, wallet } from "./config.js";
import {
  AGENT_OWNER_ROLES,
  IDENTITY_OWNER_ROLES,
  NameStatus,
  ROLES,
  deployRegistry,
  deployResolver,
  getOwner,
  getState,
  getSubregistry,
  grantRootRole,
  readAttestation,
  registerName,
  setAttestation,
} from "./ens.js";

const issuer = wallet("issuer");
const alice = account("alice").address;
const agent = account("agent").address;
const NAME = "alice.bsagate.eth";

describe("ENSv2 core permission mechanism (fork)", () => {
  let resolver: Address;
  let bsaRegistry: Address;
  let aliceRegistry: Address;

  beforeAll(async () => {
    resolver = (await deployResolver(issuer)).address;
    bsaRegistry = (await deployRegistry(issuer)).address;
    aliceRegistry = (await deployRegistry(issuer)).address;

    // Alice's on-chain kill switch over her own registry.
    await grantRootRole(issuer, aliceRegistry, ROLES.UNREGISTER, alice);

    // Issue alice.bsagate.eth: owner=alice, subregistry=aliceRegistry, no dangerous roles.
    await registerName(issuer, {
      registry: bsaRegistry,
      label: "alice",
      owner: alice,
      subregistry: aliceRegistry,
      resolver,
      roleBitmap: IDENTITY_OWNER_ROLES,
    });

    // Delegate: agent.alice.bsagate.eth (platform-minted), empty owner bitmap.
    await registerName(issuer, {
      registry: aliceRegistry,
      label: "agent",
      owner: agent,
      resolver,
      roleBitmap: AGENT_OWNER_ROLES,
    });

    // Issuer-only attestations.
    await setAttestation(issuer, resolver, NAME, "over18", "true");
    await setAttestation(issuer, resolver, NAME, "jurisdiction", "CH");
  }, 120_000);

  it("issuer attestations are readable", async () => {
    expect(await readAttestation(resolver, NAME, "over18")).toBe("true");
    expect(await readAttestation(resolver, NAME, "jurisdiction")).toBe("CH");
  });

  it("ownership and registration status are correct", async () => {
    expect(getAddress(await getOwner(bsaRegistry, "alice"))).toBe(getAddress(alice));
    expect(getAddress(await getOwner(aliceRegistry, "agent"))).toBe(getAddress(agent));
    expect((await getState(bsaRegistry, "alice")).status).toBe(NameStatus.REGISTERED);
  });

  it("alice's name points its subregistry to her UserRegistry (the hierarchy)", async () => {
    expect(getAddress(await getSubregistry(bsaRegistry, "alice"))).toBe(getAddress(aliceRegistry));
  });

  it("alice CANNOT forge her own over18 attestation", async () => {
    await expect(setAttestation(wallet("alice"), resolver, NAME, "over18", "false")).rejects.toThrow();
    expect(await readAttestation(resolver, NAME, "over18")).toBe("true");
  });

  it("alice CANNOT register agents outside the issuer flow", async () => {
    await expect(
      registerName(wallet("alice"), {
        registry: aliceRegistry,
        label: "rogue",
        owner: alice,
        resolver,
        roleBitmap: 0n,
      }),
    ).rejects.toThrow();
  });
});
