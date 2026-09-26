/**
 * Phase-0 spike (runs against the local Anvil fork — free).
 *
 * Proves the load-bearing ENS mechanism end-to-end and measures gas so we can
 * decide hierarchy vs flat:
 *   1. deploy a shared BSA PermissionedResolver proxy (issuer = admin)
 *   2. deploy a "bsagate" registry proxy + Alice's own UserRegistry proxy
 *   3. register alice.bsagate.eth  (owner=alice, NO set-resolver/subregistry/transfer)
 *   4. register agent.alice.bsagate.eth in Alice's registry (empty owner bitmap)
 *   5. issuer writes the over18 / jurisdiction attestations on alice's node
 *   6. PROVE alice cannot forge over18, and cannot register her own agents
 *   7. read the attestation back; check ownership via the registries
 */
import {
  type Address,
  type Hex,
  decodeEventLog,
  encodeFunctionData,
  labelhash,
  namehash,
  zeroAddress,
} from "viem";
import { userRegistryRegisterSnippet } from "@ensdomains/ensjs-abi/v2/userRegistry";
import { permissionedRegistryGetStateSnippet } from "@ensdomains/ensjs-abi/v2/permissionedRegistry";
import {
  verifiableFactoryDeployProxySnippet,
  subregistryInitializeSnippet,
  proxyDeployedEventSnippet,
} from "@ensdomains/ensjs-abi/v2/verifiableFactory";
import { ENS, RPC_MODE, account, publicClient, wallet } from "../config.js";

// ─── role bitmaps (registry) ─────────────────────────────────────────────────
const ALL_ROLES = BigInt(`0x${"1".repeat(64)}`);
const ROLE_UNREGISTER = 1n << 12n;
const ROLE_RENEW = 1n << 16n;
const ROLE_SET_SUBREGISTRY = 1n << 20n;
const ROLE_SET_RESOLVER = 1n << 24n;
const ROLE_CAN_TRANSFER_ADMIN = (1n << 28n) << 128n;
const ROOT_RESOURCE = 0n;
// Identity name: owner may renew, nothing else. No resolver swap, no subnames minting, no transfer.
const IDENTITY_OWNER_ROLES = ROLE_RENEW;
const EXCLUDED = ROLE_SET_RESOLVER | ROLE_SET_SUBREGISTRY | ROLE_CAN_TRANSFER_ADMIN;

// ─── resolver record ABI (standard ENS resolver) ─────────────────────────────
const resolverAbi = [
  {
    name: "setText",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// grantRoles() rejects ROOT_RESOURCE; root-level grants use grantRootRoles().
const eacRootAbi = [
  {
    name: "grantRootRoles",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roleBitmap", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ─── helpers ─────────────────────────────────────────────────────────────────
let failures = 0;
let totalGas = 0n;
const gasRows: Array<[string, bigint]> = [];

function check(name: string, cond: boolean) {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
}
async function expectRevert(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`  ✗ ${name} — expected revert but it SUCCEEDED`);
    failures++;
  } catch {
    console.log(`  ✓ ${name} — reverted as expected`);
  }
}
async function sendTracked(label: string, hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  gasRows.push([label, receipt.gasUsed]);
  totalGas += receipt.gasUsed;
  return receipt;
}

const EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);

async function deployProxy(label: string, impl: Address, admin: Address, roleBitmap: bigint): Promise<Address> {
  const issuer = wallet("issuer");
  const initData = encodeFunctionData({
    abi: subregistryInitializeSnippet,
    functionName: "initialize",
    args: [admin, roleBitmap],
  });
  const salt = BigInt(`0x${Buffer.from(`${label}:${Date.now()}:${Math.random()}`).toString("hex").slice(0, 62)}`);
  const hash = await issuer.writeContract({
    address: ENS.verifiableFactory,
    abi: verifiableFactoryDeployProxySnippet,
    functionName: "deployProxy",
    args: [impl, salt, initData],
  });
  const receipt = await sendTracked(`deploy ${label}`, hash);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ENS.verifiableFactory.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: proxyDeployedEventSnippet, ...log });
      if (ev.eventName === "ProxyDeployed") return (ev.args as { proxyAddress: Address }).proxyAddress;
    } catch {
      /* not the event */
    }
  }
  throw new Error(`ProxyDeployed event not found for ${label}`);
}

async function register(
  registry: Address,
  label: string,
  owner: Address,
  subregistry: Address,
  resolver: Address,
  roleBitmap: bigint,
) {
  const issuer = wallet("issuer");
  const hash = await issuer.writeContract({
    address: registry,
    abi: userRegistryRegisterSnippet,
    functionName: "register",
    args: [label, owner, subregistry, resolver, roleBitmap, EXPIRY],
  });
  return sendTracked(`register ${label}`, hash);
}

async function ownerOf(registry: Address, label: string): Promise<Address> {
  const state = (await publicClient.readContract({
    address: registry,
    abi: permissionedRegistryGetStateSnippet,
    functionName: "getState",
    args: [BigInt(labelhash(label))],
  })) as { latestOwner: Address };
  return state.latestOwner;
}

// ─── spike ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== BSA Gate — ENS core-mechanism spike (RPC_MODE=${RPC_MODE}) ===\n`);
  const issuer = account("issuer").address;
  const alice = account("alice").address;
  const agent = account("agent").address;
  const aliceNode = namehash("alice.bsagate.eth");

  console.log("1. deploy shared resolver + registries");
  const resolver = await deployProxy("resolver", ENS.permResolverImpl, issuer, ALL_ROLES);
  const bsaRegistry = await deployProxy("bsaRegistry", ENS.userRegistryImpl, issuer, ALL_ROLES);
  const aliceRegistry = await deployProxy("aliceRegistry", ENS.userRegistryImpl, issuer, ALL_ROLES);
  console.log(`   resolver=${resolver}\n   bsaRegistry=${bsaRegistry}\n   aliceRegistry=${aliceRegistry}\n`);

  console.log("2. grant Alice ROLE_UNREGISTER on her registry (her on-chain kill switch)");
  await sendTracked(
    "grant alice UNREGISTER",
    await wallet("issuer").writeContract({
      address: aliceRegistry,
      abi: eacRootAbi,
      functionName: "grantRootRoles",
      args: [ROLE_UNREGISTER, alice],
    }),
  );

  console.log("3. register alice.bsagate.eth (owner=alice; subregistry=aliceRegistry)");
  await register(bsaRegistry, "alice", alice, aliceRegistry, resolver, IDENTITY_OWNER_ROLES);

  console.log("4. register agent.alice.bsagate.eth (owner=agent; empty bitmap)");
  await register(aliceRegistry, "agent", agent, zeroAddress, resolver, 0n);

  console.log("5. issuer writes attestations on alice's node");
  await sendTracked(
    "setText over18",
    await wallet("issuer").writeContract({
      address: resolver,
      abi: resolverAbi,
      functionName: "setText",
      args: [aliceNode, "over18", "true"],
    }),
  );
  await sendTracked(
    "setText jurisdiction",
    await wallet("issuer").writeContract({
      address: resolver,
      abi: resolverAbi,
      functionName: "setText",
      args: [aliceNode, "jurisdiction", "CH"],
    }),
  );

  console.log("\n6. ASSERTIONS");
  const over18 = await publicClient.readContract({
    address: resolver, abi: resolverAbi, functionName: "text", args: [aliceNode, "over18"],
  });
  const juris = await publicClient.readContract({
    address: resolver, abi: resolverAbi, functionName: "text", args: [aliceNode, "jurisdiction"],
  });
  check(`over18 == "true" (read back)`, over18 === "true");
  check(`jurisdiction == "CH" (read back)`, juris === "CH");
  check("alice owns alice.bsagate.eth", (await ownerOf(bsaRegistry, "alice")).toLowerCase() === alice.toLowerCase());
  check("agent owns agent.alice.bsagate.eth", (await ownerOf(aliceRegistry, "agent")).toLowerCase() === agent.toLowerCase());

  await expectRevert("alice CANNOT forge over18 (no resolver role)", () =>
    wallet("alice").writeContract({
      address: resolver, abi: resolverAbi, functionName: "setText", args: [aliceNode, "over18", "false"],
    }),
  );
  await expectRevert("alice CANNOT register her own agents (no REGISTRAR)", () =>
    wallet("alice").writeContract({
      address: aliceRegistry, abi: userRegistryRegisterSnippet, functionName: "register",
      args: ["rogue", alice, zeroAddress, resolver, 0n, EXPIRY],
    }),
  );
  // still-forged value must not have changed
  const over18After = await publicClient.readContract({
    address: resolver, abi: resolverAbi, functionName: "text", args: [aliceNode, "over18"],
  });
  check(`over18 still "true" after alice's failed forge`, over18After === "true");

  console.log("\n=== GAS (fork) ===");
  for (const [label, gas] of gasRows) console.log(`  ${label.padEnd(24)} ${gas.toString().padStart(9)}`);
  console.log(`  ${"TOTAL".padEnd(24)} ${totalGas.toString().padStart(9)}`);
  // rough real-cost estimate at a modest Sepolia gas price
  const gwei = 2n;
  const wei = totalGas * gwei * 10n ** 9n;
  console.log(`  ~cost @ ${gwei} gwei: ${Number(wei) / 1e18} ETH  (per identity+agent+attest)`);

  console.log(`\n=== RESULT: ${failures === 0 ? "ALL PASSED ✓" : `${failures} FAILURE(S) ✗`} ===\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
