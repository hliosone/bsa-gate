/**
 * BSA Gate — ENSv2 operations (the permission layer).
 *
 * Thin, typed wrappers over the ENSv2 Sepolia contracts (addresses + ABIs from
 * @ensdomains/ensjs sepolia-fix). Used by the issuer flow and by the facilitator's
 * ENS gate. Works against the fork or live Sepolia (see config RPC_MODE).
 */
import {
  type Address,
  type Hex,
  decodeEventLog,
  encodeFunctionData,
  keccak256,
  labelhash,
  namehash,
  stringToBytes,
  zeroAddress,
} from "viem";
import { userRegistryRegisterSnippet } from "@ensdomains/ensjs-abi/v2/userRegistry";
import {
  permissionedRegistryGetStateSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from "@ensdomains/ensjs-abi/v2/permissionedRegistry";
import {
  verifiableFactoryDeployProxySnippet,
  subregistryInitializeSnippet,
  proxyDeployedEventSnippet,
} from "@ensdomains/ensjs-abi/v2/verifiableFactory";
import { ENS, publicClient, wallet } from "./config.js";

export type Signer = ReturnType<typeof wallet>;

// ─── roles ─────────────────────────────────────────────────────────────────
export const ROLES = {
  REGISTRAR: 1n << 0n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
} as const;
export const ALL_ROLES = BigInt(`0x${"1".repeat(64)}`);
/** Identity-name owner may renew only — no resolver swap, no sub-minting, no transfer. */
export const IDENTITY_OWNER_ROLES = ROLES.RENEW;
/** Agent-name owner gets nothing: non-transferable, records controlled by issuer. */
export const AGENT_OWNER_ROLES = 0n;

export enum NameStatus {
  AVAILABLE = 0,
  RESERVED = 1,
  REGISTERED = 2,
}

export type NameState = {
  status: NameStatus;
  expiry: bigint;
  latestOwner: Address;
  tokenId: bigint;
  resource: bigint;
};

// ─── record ABIs (standard ENS resolver) + EAC root ──────────────────────────
export const resolverAbi = [
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

export const eacRootAbi = [
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
const ONE_YEAR = 365n * 24n * 3600n;
export const oneYearFromNow = (): bigint => BigInt(Math.floor(Date.now() / 1000)) + ONE_YEAR;
const randomSalt = (): bigint =>
  BigInt(keccak256(stringToBytes(`${Date.now()}:${Math.random()}`)));

async function receipt(hash: Hex) {
  return publicClient.waitForTransactionReceipt({ hash });
}

// ─── deploys (via VerifiableFactory) ─────────────────────────────────────────
export type Deployed = { address: Address; gasUsed: bigint };

export async function deployProxy(
  signer: Signer,
  impl: Address,
  admin: Address,
  roleBitmap: bigint = ALL_ROLES,
): Promise<Deployed> {
  const initData = encodeFunctionData({
    abi: subregistryInitializeSnippet,
    functionName: "initialize",
    args: [admin, roleBitmap],
  });
  const hash = await signer.writeContract({
    address: ENS.verifiableFactory,
    abi: verifiableFactoryDeployProxySnippet,
    functionName: "deployProxy",
    args: [impl, randomSalt(), initData],
  });
  const r = await receipt(hash);
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== ENS.verifiableFactory.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: proxyDeployedEventSnippet, data: log.data, topics: log.topics });
      if (ev.eventName === "ProxyDeployed")
        return { address: (ev.args as { proxyAddress: Address }).proxyAddress, gasUsed: r.gasUsed };
    } catch {
      /* not our event */
    }
  }
  throw new Error("ProxyDeployed event not found");
}

export const deployRegistry = (signer: Signer, admin?: Address, roleBitmap?: bigint) =>
  deployProxy(signer, ENS.userRegistryImpl, admin ?? signer.account.address, roleBitmap);
export const deployResolver = (signer: Signer, admin?: Address, roleBitmap?: bigint) =>
  deployProxy(signer, ENS.permResolverImpl, admin ?? signer.account.address, roleBitmap);

// ─── writes ──────────────────────────────────────────────────────────────────
export async function grantRootRole(signer: Signer, contract: Address, roleBitmap: bigint, account: Address) {
  const hash = await signer.writeContract({
    address: contract,
    abi: eacRootAbi,
    functionName: "grantRootRoles",
    args: [roleBitmap, account],
  });
  return receipt(hash);
}

export type RegisterArgs = {
  registry: Address;
  label: string;
  owner: Address;
  resolver: Address;
  subregistry?: Address;
  roleBitmap?: bigint;
  expiry?: bigint;
};

export async function registerName(signer: Signer, a: RegisterArgs) {
  const hash = await signer.writeContract({
    address: a.registry,
    abi: userRegistryRegisterSnippet,
    functionName: "register",
    args: [
      a.label,
      a.owner,
      a.subregistry ?? zeroAddress,
      a.resolver,
      a.roleBitmap ?? 0n,
      a.expiry ?? oneYearFromNow(),
    ],
  });
  return receipt(hash);
}

/** Issuer writes an attestation record (e.g. over18=true) on a name's node. */
export async function setAttestation(signer: Signer, resolver: Address, name: string, key: string, value: string) {
  const hash = await signer.writeContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "setText",
    args: [namehash(name), key, value],
  });
  return receipt(hash);
}

// ─── reads ───────────────────────────────────────────────────────────────────
export async function readAttestation(resolver: Address, name: string, key: string): Promise<string> {
  return publicClient.readContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "text",
    args: [namehash(name), key],
  });
}

export async function getState(registry: Address, label: string): Promise<NameState> {
  const s = (await publicClient.readContract({
    address: registry,
    abi: permissionedRegistryGetStateSnippet,
    functionName: "getState",
    args: [BigInt(labelhash(label))],
  })) as NameState;
  return s;
}

export const getOwner = async (registry: Address, label: string): Promise<Address> =>
  (await getState(registry, label)).latestOwner;

export async function getSubregistry(registry: Address, label: string): Promise<Address> {
  return publicClient.readContract({
    address: registry,
    abi: permissionedRegistryGetSubregistrySnippet,
    functionName: "getSubregistry",
    args: [label],
  }) as Promise<Address>;
}
